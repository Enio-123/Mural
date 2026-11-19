/**
 * Ponte do Mural (função da Vercel).
 *
 * O navegador do celular não pode ler direto o Google Notícias, as páginas das matérias
 * nem o Project Gutenberg, porque esses sites não liberam CORS. Esta função busca no
 * servidor e devolve só o que o app precisa, já limpo.
 *
 * GET /api/ponte?fn=...
 *   news     src=gn-top | gn-topic&topic=TECHNOLOGY | gn-search&q=xadrez | rss&url=<feed>
 *   meta     url=<link da notícia>     -> { url, image, site }
 *   article  url=<link da notícia>     -> matéria limpa (Readability)
 *   catalog                            -> livros em português do Project Gutenberg
 *   book     id=<número>               -> arquivo ePub
 *
 * Livros: o site www.gutenberg.org é só para pessoas e bloqueia acesso automático de
 * servidores. Por isso a ponte usa o espelho oficial (gutenberg.pglaf.org), que existe
 * justamente para isso e tem o mesmo catálogo e os mesmos arquivos.
 *   bsky     path=app.bsky.feed.getFeed&...  -> leitura pública do Bluesky (reserva)
 */
import { XMLParser } from 'fast-xml-parser';
import { parseHTML } from 'linkedom';
import readabilityPkg from '@mozilla/readability';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { gunzipSync } from 'node:zlib';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';

type ReadabilityCtor = typeof import('@mozilla/readability').Readability;
const { Readability } = readabilityPkg as unknown as { Readability: ReadabilityCtor };

const UA_BROWSER =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const UA_APP = 'Mural/0.1 (leitor pessoal de livros)';

export class PonteError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ------------------------------------------------------------------ rede */

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function checkUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new PonteError('url', 'Link inválido.', 400);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new PonteError('url', 'Só dá pra abrir links http ou https.', 400);
  if (u.username || u.password) throw new PonteError('url', 'Link inválido.', 400);
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(host)) {
    throw new PonteError('url', 'Endereço não permitido.', 400);
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new PonteError('url', 'Endereço não permitido.', 400);
    return u;
  }
  if (process.env.PONTE_SKIP_DNS !== '1') {
    let addrs: { address: string }[];
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      throw new PonteError('dns', 'Site não encontrado.', 502);
    }
    if (addrs.some((a) => isPrivateIp(a.address))) throw new PonteError('url', 'Endereço não permitido.', 400);
  }
  return u;
}

interface GetOpts {
  accept?: string;
  ua?: string;
  maxBytes?: number;
  timeoutMs?: number;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

interface Got {
  url: string;
  status: number;
  headers: Headers;
  bytes: Uint8Array;
}

async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > max) {
    await res.body?.cancel().catch(() => undefined);
    throw new PonteError('grande', 'Arquivo grande demais.', 413);
  }
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new PonteError('grande', 'Arquivo grande demais.', 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export async function get(raw: string, o: GetOpts = {}): Promise<Got> {
  let url = await checkUrl(raw);
  let method = o.method ?? 'GET';
  let body = o.body;
  for (let hop = 0; hop < 6; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(o.timeoutMs ?? 12000),
        headers: {
          'User-Agent': o.ua ?? UA_BROWSER,
          Accept: o.accept ?? '*/*',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5',
          ...o.headers,
        },
      });
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new PonteError('tempo', 'O site demorou demais pra responder.', 504);
      throw new PonteError('rede', 'Não consegui falar com o site.', 502);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      await res.body?.cancel().catch(() => undefined);
      if (!loc) throw new PonteError('rede', 'O site mandou um redirecionamento sem destino.');
      url = await checkUrl(new URL(loc, url).href);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await readLimited(res, o.maxBytes ?? 3_000_000);
    } catch (e) {
      if (e instanceof PonteError) throw e;
      const name = (e as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new PonteError('tempo', 'O site demorou demais pra responder.', 504);
      throw new PonteError('rede', 'A conexão caiu no meio do caminho.', 502);
    }
    return { url: url.href, status: res.status, headers: res.headers, bytes };
  }
  throw new PonteError('rede', 'Redirecionamentos demais.');
}

export function decodeText(bytes: Uint8Array, contentType: string | null): string {
  let charset = /charset=["']?([\w:.-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase();
  if (!charset) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
    charset =
      /<meta[^>]+charset=["']?([\w:.-]+)/i.exec(head)?.[1]?.toLowerCase() ??
      /<\?xml[^>]+encoding=["']([\w:.-]+)["']/i.exec(head)?.[1]?.toLowerCase();
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/* --------------------------------------------------------------- texto */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

export function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function hostLabel(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function absolutize(src: string | undefined | null, base: string): string | undefined {
  if (!src) return undefined;
  const s = decodeEntities(src.trim());
  if (!s || s.startsWith('data:') || s.startsWith('javascript:')) return undefined;
  try {
    const u = new URL(s, base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

/* ---------------------------------------------------------------- feeds */

export interface Related {
  title: string;
  url: string;
  source: string;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceUrl?: string;
  published?: string;
  image?: string;
  summary?: string;
  related?: Related[];
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ['item', 'entry', 'link', 'media:content', 'media:thumbnail', 'enclosure', 'category'].includes(name),
});

function txt(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return txt(v[0]);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('#text' in o) return txt(o['#text']);
    if ('@_href' in o) return txt(o['@_href']);
  }
  return '';
}

function attr(v: unknown, name: string): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) return txt((v as Record<string, unknown>)['@_' + name]);
  return '';
}

function toIso(v: string): string | undefined {
  if (!v) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

const BAD_IMG = /(pixel|tracking|feedburner|doubleclick|analytics|\/logo|logo[-_.]|gravatar|emoji|spacer|blank\.gif|1x1)/i;

function firstImgInHtml(html: string, base: string): string | undefined {
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const w = /\bwidth=["']?(\d+)/i.exec(tag)?.[1];
    const h = /\bheight=["']?(\d+)/i.exec(tag)?.[1];
    if ((w && Number(w) < 60) || (h && Number(h) < 60)) continue;
    const src = /\b(?:data-src|src)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || BAD_IMG.test(src)) continue;
    const abs = absolutize(src, base);
    if (abs) return abs;
  }
  return undefined;
}

function pickImage(it: Record<string, unknown>, base: string): string | undefined {
  const media = (it['media:content'] as unknown[] | undefined) ?? [];
  let best: { url: string; w: number } | undefined;
  for (const m of media) {
    const url = attr(m, 'url');
    if (!url) continue;
    const medium = attr(m, 'medium');
    const type = attr(m, 'type');
    const looksImg = medium === 'image' || type.startsWith('image/') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
    if (!looksImg) continue;
    const w = Number(attr(m, 'width')) || 0;
    if (!best || w > best.w) best = { url, w };
  }
  if (best) return absolutize(best.url, base);
  const group = it['media:group'] as Record<string, unknown> | undefined;
  const thumbs = [
    ...(((it['media:thumbnail'] as unknown[]) ?? [])),
    ...((((group?.['media:thumbnail'] as unknown[]) ?? []))),
  ];
  for (const t of thumbs) {
    const url = attr(t, 'url');
    if (url) return absolutize(url, base);
  }
  for (const e of (it['enclosure'] as unknown[]) ?? []) {
    const url = attr(e, 'url');
    if (url && (attr(e, 'type').startsWith('image/') || /\.(jpe?g|png|webp)(\?|$)/i.test(url))) return absolutize(url, base);
  }
  for (const [k, v] of Object.entries(it)) {
    if (/imag/i.test(k) && !k.startsWith('media:')) {
      const s = txt(v) || attr(v, 'url') || attr(v, 'src');
      if (/^https?:\/\//.test(s)) return absolutize(s, base);
    }
  }
  const html = txt(it['content:encoded']) || txt(it['description']) || txt(it['content']) || txt(it['summary']);
  return html ? firstImgInHtml(html, base) : undefined;
}

function itemLink(it: Record<string, unknown>): string {
  const links = it['link'] as unknown[] | undefined;
  if (links && links.length) {
    const alt = links.find((l) => typeof l === 'object' && l && (attr(l, 'rel') === 'alternate' || !attr(l, 'rel')) && attr(l, 'href'));
    if (alt) return attr(alt, 'href');
    for (const l of links) {
      const s = typeof l === 'string' ? l : attr(l, 'href') || txt(l);
      if (s) return s.trim();
    }
  }
  const guid = it['guid'];
  if (guid && (attr(guid, 'isPermaLink') !== 'false') && /^https?:/.test(txt(guid))) return txt(guid);
  return '';
}

export function parseGoogleRelated(descriptionHtml: string): Related[] {
  const out: Related[] = [];
  const re = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:\s|&nbsp;|&#160;)*<font[^>]*>([\s\S]*?)<\/font>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(descriptionHtml))) {
    out.push({ url: decodeEntities(m[1]), title: stripTags(m[2]), source: stripTags(m[3]) });
  }
  return out;
}

export function parseFeed(xmlText: string, fallbackSource: string, feedUrl = ''): NewsItem[] {
  let doc: Record<string, any>;
  try {
    doc = xml.parse(xmlText);
  } catch {
    throw new PonteError('feed', 'O feed veio com um formato que não entendi.');
  }
  const channel = doc?.rss?.channel ?? doc?.['rdf:RDF']?.channel;
  const raw: Record<string, unknown>[] = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item ?? doc?.feed?.entry ?? [];
  if (!doc?.rss && !doc?.feed && !doc?.['rdf:RDF']) throw new PonteError('feed', 'Esse link não é um feed RSS.');
  const feedTitle = stripTags(txt(channel?.title) || txt(doc?.feed?.title)) || fallbackSource;
  const isGoogle = /news\.google\.com/.test(feedUrl);
  const items: NewsItem[] = [];
  for (const it of raw) {
    const url = itemLink(it).trim();
    let title = stripTags(txt(it['title']));
    if (!url || !title) continue;
    const srcEl = it['source'];
    let source = stripTags(txt(srcEl)) || feedTitle;
    const sourceUrl = attr(srcEl, 'url') || undefined;
    if (isGoogle && source) {
      const suffix = ' - ' + source;
      if (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
    } else if (isGoogle) {
      const m = /^(.*) - ([^-]{2,60})$/.exec(title);
      if (m) {
        title = m[1].trim();
        source = m[2].trim();
      }
    }
    const descHtml = txt(it['description']) || txt(it['summary']) || txt(it['content:encoded']) || txt(it['content']);
    const item: NewsItem = {
      id: hashId(url),
      title,
      url,
      source,
      sourceUrl,
      published: toIso(txt(it['pubDate']) || txt(it['dc:date']) || txt(it['published']) || txt(it['updated'])),
    };
    if (isGoogle) {
      const rel = parseGoogleRelated(descHtml).filter((r) => r.url !== url && r.title !== title);
      if (rel.length) item.related = rel.slice(0, 5);
    } else {
      const summary = stripTags(descHtml);
      if (summary && summary !== title) item.summary = clip(summary, 280);
      const image = pickImage(it, url);
      if (image) item.image = image;
    }
    items.push(item);
  }
  return items;
}

const GN = 'https://news.google.com/rss';
const GN_PARAMS = 'hl=pt-BR&gl=BR&ceid=BR:pt-419';
const GN_TOPICS = new Set(['WORLD', 'NATION', 'BUSINESS', 'TECHNOLOGY', 'ENTERTAINMENT', 'SPORTS', 'SCIENCE', 'HEALTH']);

export function newsUrl(p: URLSearchParams): { url: string; label: string } {
  const src = p.get('src') ?? 'gn-top';
  if (src === 'gn-top') return { url: `${GN}?${GN_PARAMS}`, label: 'Google Notícias' };
  if (src === 'gn-topic') {
    const topic = (p.get('topic') ?? '').toUpperCase();
    if (!GN_TOPICS.has(topic)) throw new PonteError('param', 'Tema desconhecido.', 400);
    return { url: `${GN}/headlines/section/topic/${topic}?${GN_PARAMS}`, label: 'Google Notícias' };
  }
  if (src === 'gn-search') {
    const q = (p.get('q') ?? '').trim().slice(0, 120);
    if (!q) throw new PonteError('param', 'Faltou o assunto.', 400);
    return { url: `${GN}/search?q=${encodeURIComponent(q + ' when:3d')}&${GN_PARAMS}`, label: 'Google Notícias' };
  }
  if (src === 'rss') {
    const url = (p.get('url') ?? '').trim();
    if (!url) throw new PonteError('param', 'Faltou o link do feed.', 400);
    return { url, label: hostLabel(url) };
  }
  throw new PonteError('param', 'Fonte desconhecida.', 400);
}

async function news(p: URLSearchParams) {
  const { url, label } = newsUrl(p);
  const r = await get(url, { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5', maxBytes: 4_000_000 });
  if (r.status >= 400) throw new PonteError('http', `O feed respondeu ${r.status}.`);
  const items = parseFeed(decodeText(r.bytes, r.headers.get('content-type')), label, url);
  return { items: items.slice(0, 50), fetchedAt: new Date().toISOString() };
}

/* -------------------------------------------------------- google notícias */

export function decodeGnOffline(id: string): string | null {
  try {
    const b = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (b.length < 5 || b[0] !== 0x08 || b[1] !== 0x13 || b[2] !== 0x22) return null;
    let i = 3;
    let len = 0;
    let shift = 0;
    while (i < b.length) {
      const byte = b[i++];
      len |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    const s = b.subarray(i, i + len).toString('utf8');
    return /^https?:\/\/\S+$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

export function parseBatchExecute(text: string): string | null {
  // A resposta começa com )]}' e depois vem um JSON inteiro ou vários pedaços
  // (uma linha com o tamanho e outra com o JSON). Os dois formatos são aceitos.
  const body = text.replace(/^\)\]\}'\s*/, '');
  const chunks: unknown[] = [];
  try {
    chunks.push(JSON.parse(body));
  } catch {
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('[')) continue;
      try {
        chunks.push(JSON.parse(t));
      } catch {
        /* linha que não é JSON */
      }
    }
  }
  for (const arr of chunks) {
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (Array.isArray(row) && row[0] === 'wrb.fr' && typeof row[2] === 'string') {
        try {
          const inner = JSON.parse(row[2]);
          if (Array.isArray(inner) && typeof inner[1] === 'string' && /^https?:\/\//.test(inner[1])) return inner[1];
        } catch {
          /* segue */
        }
      }
    }
  }
  return null;
}

async function decodeGnOnline(id: string): Promise<string> {
  let sg: string | undefined;
  let ts: string | undefined;
  for (const pageUrl of [`https://news.google.com/articles/${id}`, `https://news.google.com/rss/articles/${id}`]) {
    try {
      const r = await get(pageUrl, { accept: 'text/html', maxBytes: 3_000_000, headers: { Cookie: 'CONSENT=YES+cb' } });
      const html = decodeText(r.bytes, r.headers.get('content-type'));
      sg = /data-n-a-sg="([^"]+)"/.exec(html)?.[1];
      ts = /data-n-a-ts="([^"]+)"/.exec(html)?.[1];
      if (sg && ts) break;
    } catch {
      /* tenta o próximo */
    }
  }
  if (!sg || !ts || !/^\d+$/.test(ts)) throw new PonteError('gn', 'Não consegui abrir esse link do Google Notícias.');
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
  const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner]]]));
  const r = await get('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    body,
    accept: '*/*',
    maxBytes: 1_000_000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
  });
  const url = parseBatchExecute(decodeText(r.bytes, 'charset=utf-8'));
  if (!url) throw new PonteError('gn', 'Não consegui abrir esse link do Google Notícias.');
  return url;
}

export async function resolveNewsUrl(raw: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new PonteError('url', 'Link inválido.', 400);
  }
  if (u.hostname !== 'news.google.com') return raw;
  const m = /\/(?:rss\/)?articles\/([A-Za-z0-9_-]+)/.exec(u.pathname);
  if (!m) return raw;
  return decodeGnOffline(m[1]) ?? (await decodeGnOnline(m[1]));
}

/* -------------------------------------------------------------- matérias */

interface PageMeta {
  title?: string;
  image?: string;
  site?: string;
  published?: string;
}

export function readMetaFromHtml(html: string, base: string): PageMeta {
  const head = html.slice(0, 300_000);
  const metas: Record<string, string> = {};
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) {
    const tag = m[0];
    const key = /\b(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content != null && !(key in metas)) metas[key] = decodeEntities(content);
  }
  const image = metas['og:image'] || metas['og:image:url'] || metas['og:image:secure_url'] || metas['twitter:image'] || metas['twitter:image:src'] || metas['image'];
  return {
    title: metas['og:title'] || metas['twitter:title'] || undefined,
    image: absolutize(image, base),
    site: metas['og:site_name'] || metas['application-name'] || undefined,
    published: toIso(metas['article:published_time'] || metas['datepublished'] || metas['date'] || ''),
  };
}

export function cleanContent(contentHtml: string, base: string): string {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${contentHtml}</body></html>`);
  const body = document.body;
  body.querySelectorAll('script,style,noscript,iframe,form,button,input,select,textarea,svg,canvas,object,embed,link,meta').forEach((el: Element) => el.remove());
  body.querySelectorAll('img').forEach((img: Element) => {
    const cands = [img.getAttribute('data-src'), img.getAttribute('data-lazy-src'), img.getAttribute('data-original'), img.getAttribute('src')];
    const src = cands.map((c) => absolutize(c, base)).find(Boolean);
    if (!src || BAD_IMG.test(src)) {
      img.remove();
      return;
    }
    for (const a of Array.from(img.attributes) as Attr[]) {
      if (!['alt', 'width', 'height'].includes(a.name)) img.removeAttribute(a.name);
    }
    img.setAttribute('src', src);
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  });
  body.querySelectorAll('source').forEach((s: Element) => s.remove());
  body.querySelectorAll('a').forEach((a: Element) => {
    const href = absolutize(a.getAttribute('href'), base);
    for (const at of Array.from(a.attributes) as Attr[]) a.removeAttribute(at.name);
    if (href) a.setAttribute('href', href);
  });
  body.querySelectorAll('*').forEach((el: Element) => {
    for (const at of Array.from(el.attributes) as Attr[]) {
      const n = at.name.toLowerCase();
      if (n === 'style' || n === 'class' || n === 'id' || n.startsWith('on') || n.startsWith('data-')) el.removeAttribute(at.name);
    }
  });
  body.querySelectorAll('p,div,span,section').forEach((el: Element) => {
    if (!el.textContent?.trim() && !el.querySelector('img')) el.remove();
  });
  return body.innerHTML.trim();
}

async function fetchHtml(raw: string, maxBytes: number) {
  const real = await resolveNewsUrl(raw);
  const r = await get(real, { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', maxBytes });
  if (r.status === 401 || r.status === 403) throw new PonteError('bloqueado', 'Esse site não deixa ler a matéria fora dele.', 422);
  if (r.status >= 400) throw new PonteError('http', `O site respondeu ${r.status}.`);
  const ct = r.headers.get('content-type') || '';
  if (ct && !/html|xml/i.test(ct)) throw new PonteError('tipo', 'Esse link não é uma página de texto.', 422);
  return { finalUrl: r.url, html: decodeText(r.bytes, ct) };
}

async function meta(p: URLSearchParams) {
  const raw = p.get('url') ?? '';
  const { finalUrl, html } = await fetchHtml(raw, 1_500_000);
  const m = readMetaFromHtml(html, finalUrl);
  return { url: finalUrl, image: m.image ?? null, site: m.site ?? hostLabel(finalUrl) };
}

export function extractArticle(html: string, finalUrl: string) {
  const metaInfo = readMetaFromHtml(html, finalUrl);
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document, { charThreshold: 400, keepClasses: false });
  const parsed = reader.parse();
  const text = (parsed?.textContent ?? '').trim();
  if (!parsed || !parsed.content || text.length < 400) {
    throw new PonteError('sem-texto', 'Não deu pra ler essa matéria aqui. Pode ser paywall ou uma página que só abre no site.', 422);
  }
  const words = text.split(/\s+/).length;
  return {
    url: finalUrl,
    title: (parsed.title || metaInfo.title || '').trim(),
    byline: parsed.byline?.trim() || null,
    site: parsed.siteName?.trim() || metaInfo.site || hostLabel(finalUrl),
    published: toIso(parsed.publishedTime ?? '') ?? metaInfo.published ?? null,
    image: metaInfo.image ?? null,
    html: cleanContent(parsed.content, finalUrl),
    minutes: Math.max(1, Math.round(words / 200)),
  };
}

async function article(p: URLSearchParams) {
  const raw = p.get('url') ?? '';
  const { finalUrl, html } = await fetchHtml(raw, 5_000_000);
  return extractArticle(html, finalUrl);
}

/* ---------------------------------------------------------------- livros */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let quoted = false;
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (quoted) {
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      const next = text.indexOf('"', i);
      if (next === -1) {
        field += text.slice(i);
        i = n;
      } else {
        field += text.slice(i, next);
        i = next;
      }
      continue;
    }
    if (c === 34) {
      quoted = true;
      i++;
    } else if (c === 44) {
      row.push(field);
      field = '';
      i++;
    } else if (c === 10 || c === 13) {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      i++;
    } else {
      let j = i;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d === 44 || d === 10 || d === 13 || d === 34) break;
        j++;
      }
      field += text.slice(i, j);
      i = j;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function cleanAuthors(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(';')) {
    let p = part.trim();
    if (!p) continue;
    const role = /\[([^\]]+)\]/.exec(p)?.[1]?.toLowerCase();
    if (role && !/author|autor/.test(role)) continue;
    p = p.replace(/\[[^\]]*\]/g, '').trim();
    p = p.replace(/,\s*(?:fl\.\s*|ca\.\s*|active\s*)?\d{0,4}\??\s*(?:BCE|AD)?\s*-\s*\d{0,4}\??\s*(?:BCE|AD)?\s*$/i, '').trim();
    p = p.replace(/,\s*\d{3,4}-?\s*$/, '').trim();
    p = p.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const comma = p.indexOf(', ');
    if (comma > 0) p = `${p.slice(comma + 2)} ${p.slice(0, comma)}`.trim();
    p = p.replace(/,+$/, '').replace(/\s+/g, ' ');
    if (p) out.push(p);
  }
  return out;
}

export interface CatalogBook {
  id: number;
  title: string;
  authors: string[];
}

export function catalogFromCsv(text: string, lang = 'pt'): CatalogBook[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const cId = col('text#');
  const cType = col('type');
  const cTitle = col('title');
  const cLang = col('language');
  const cAuth = col('authors');
  if (cId < 0 || cTitle < 0 || cLang < 0) throw new PonteError('catalogo', 'O catálogo do Gutenberg mudou de formato.');
  const out: CatalogBook[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length <= cLang) continue;
    if (cType >= 0 && row[cType] && row[cType] !== 'Text') continue;
    const langs = row[cLang].split(/[;,]\s*/).map((s) => s.trim().toLowerCase());
    if (!langs.includes(lang)) continue;
    const id = Number(row[cId]);
    if (!Number.isFinite(id) || id <= 0) continue;
    const title = row[cTitle].replace(/\s+/g, ' ').trim();
    if (!title) continue;
    out.push({ id, title, authors: cAuth >= 0 ? cleanAuthors(row[cAuth] ?? '') : [] });
  }
  return out;
}

/** Espelho oficial do Project Gutenberg (PGLAF, hospedado pelo ibiblio). */
export const PG_MIRROR = 'https://gutenberg.pglaf.org';
const pgMirror = () => process.env.PONTE_PG_MIRROR || PG_MIRROR;

interface RawRes {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/**
 * Pedido HTTP cru: não descompacta nada e não segue redirecionamentos, para que pedaços
 * (Range) de um arquivo .gz cheguem exatamente como estão no servidor.
 */
function rawRequest(url: URL, o: { method?: string; headers?: Record<string, string>; deadline: number; maxBytes: number }): Promise<RawRes> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err: unknown, res?: RawRes) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(res!);
    };
    const req = (url.protocol === 'http:' ? httpRequest : httpsRequest)(
      url,
      { method: o.method ?? 'GET', headers: { 'User-Agent': UA_APP, Accept: '*/*', 'Accept-Encoding': 'identity', ...o.headers } },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total > o.maxBytes) {
            req.destroy();
            finish(new PonteError('grande', 'Arquivo grande demais.', 413));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const declared = Number(res.headers['content-length'] ?? NaN);
          if (o.method !== 'HEAD' && Number.isFinite(declared) && declared !== total) {
            finish(new PonteError('rede', 'A conexão caiu no meio do caminho.', 502));
            return;
          }
          finish(null, { status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
        });
        res.on('error', () => finish(new PonteError('rede', 'A conexão caiu no meio do caminho.', 502)));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish(new PonteError('tempo', 'O site demorou demais pra responder.', 504));
    }, Math.max(1, o.deadline - Date.now()));
    req.on('error', () => finish(new PonteError('rede', 'Não consegui falar com o site.', 502)));
    req.end();
  });
}

async function rawFollow(raw: string, o: { method?: string; headers?: Record<string, string>; deadline: number; maxBytes: number }): Promise<RawRes & { url: URL }> {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    const r = await rawRequest(url, o);
    const loc = r.headers.location;
    if ([301, 302, 303, 307, 308].includes(r.status) && loc) {
      url = await checkUrl(new URL(loc, url).href);
      continue;
    }
    return { ...r, url };
  }
  throw new PonteError('rede', 'Redirecionamentos demais.');
}

/**
 * Baixa um arquivo grande em vários pedaços ao mesmo tempo (Range). O espelho entrega
 * devagar por conexão; em paralelo o catálogo inteiro chega bem mais rápido.
 */
export async function downloadInParts(raw: string, deadline: number, maxBytes = 60_000_000): Promise<Buffer> {
  const head = await rawFollow(raw, { method: 'HEAD', deadline, maxBytes: 0 });
  const noHead = head.status === 405 || head.status === 501;
  if (head.status >= 400 && !noHead) throw new PonteError('http', `O Gutenberg respondeu ${head.status}.`);
  const size = noHead ? 0 : Number(head.headers['content-length'] ?? 0);
  const ranges = String(head.headers['accept-ranges'] ?? '').toLowerCase().includes('bytes');
  if (size > maxBytes) throw new PonteError('grande', 'Arquivo grande demais.', 413);
  if (!size || !ranges || size < 1_000_000) {
    const r = await rawFollow(head.url.href, { deadline, maxBytes });
    if (r.status >= 400) throw new PonteError('http', `O Gutenberg respondeu ${r.status}.`);
    return r.body;
  }
  const parts = Math.min(10, Math.ceil(size / 600_000));
  const step = Math.ceil(size / parts);
  const one = async (k: number): Promise<Buffer> => {
    const a = k * step;
    const b = Math.min(size, a + step) - 1;
    let last: unknown;
    for (let attempt = 0; attempt < 2 && Date.now() < deadline - 1000; attempt++) {
      try {
        const r = await rawRequest(head.url, { headers: { Range: `bytes=${a}-${b}` }, deadline, maxBytes: step + 1 });
        if (r.status === 206 && r.body.length === b - a + 1) return r.body;
        last = new PonteError('rede', 'O catálogo do Gutenberg chegou pela metade.', 502);
      } catch (e) {
        last = e;
        if (e instanceof PonteError && e.code === 'tempo') break;
      }
    }
    throw last ?? new PonteError('tempo', 'O site demorou demais pra responder.', 504);
  };
  const bufs = await Promise.all(Array.from({ length: parts }, (_, k) => one(k)));
  return Buffer.concat(bufs);
}

let catalogMemo: { at: number; data: { books: CatalogBook[]; fetchedAt: string } } | null = null;

/** Só para os testes. */
export function resetCatalogCache(): void {
  catalogMemo = null;
}

async function catalog() {
  if (catalogMemo && Date.now() - catalogMemo.at < 6 * 3_600_000) return catalogMemo.data;
  const deadline = Date.now() + (Number(process.env.PONTE_CATALOG_MS) || 50_000);
  let lastError: unknown = null;
  for (const name of ['pg_catalog.csv.gz', 'pg_catalog.csv']) {
    if (Date.now() > deadline - 3000) break;
    let raw: Buffer;
    try {
      const b = await downloadInParts(`${pgMirror()}/cache/epub/feeds/${name}`, deadline);
      raw = b.length > 2 && b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b;
    } catch (e) {
      console.error('ponte catalog', name, e);
      lastError = e instanceof PonteError ? e : new PonteError('catalogo', 'O catálogo do Gutenberg chegou estragado.');
      continue;
    }
    const books = catalogFromCsv(new TextDecoder('utf-8').decode(raw));
    if (!books.length) throw new PonteError('catalogo', 'Não achei livros em português no catálogo.');
    const data = { books, fetchedAt: new Date().toISOString() };
    catalogMemo = { at: Date.now(), data };
    return data;
  }
  if (lastError instanceof PonteError && lastError.code === 'tempo') {
    throw new PonteError('tempo', 'O espelho do Gutenberg demorou demais pra mandar o catálogo. Tente de novo daqui a pouco.', 504);
  }
  throw lastError ?? new PonteError('tempo', 'O espelho do Gutenberg demorou demais pra mandar o catálogo.', 504);
}

async function book(p: URLSearchParams): Promise<Response> {
  const id = p.get('id') ?? '';
  if (!/^\d{1,6}$/.test(id)) throw new PonteError('param', 'Livro inválido.', 400);
  let tooBig = false;
  // com imagens (ePub 3), com imagens (ePub 2) e só texto, nessa ordem
  for (const file of [`pg${id}-images-3.epub`, `pg${id}-images.epub`, `pg${id}.epub`]) {
    try {
      const r = await get(`${pgMirror()}/cache/epub/${id}/${file}`, {
        ua: UA_APP,
        accept: 'application/epub+zip,*/*;q=0.5',
        maxBytes: 4_200_000,
        timeoutMs: 20_000,
      });
      if (r.status === 200 && r.bytes.length > 512 && r.bytes[0] === 0x50 && r.bytes[1] === 0x4b) {
        return new Response(r.bytes as Uint8Array<ArrayBuffer>, {
          status: 200,
          headers: {
            'Content-Type': 'application/epub+zip',
            'Cache-Control': 'public, max-age=86400, s-maxage=2592000',
          },
        });
      }
    } catch (e) {
      if (e instanceof PonteError && e.code === 'grande') {
        tooBig = true;
        continue;
      }
      if (e instanceof PonteError && (e.code === 'tempo' || e.code === 'rede')) throw e;
    }
  }
  if (tooBig) throw new PonteError('grande', 'Esse livro é grande demais pra baixar por aqui.', 413);
  throw new PonteError('livro', 'Não consegui baixar esse livro do Gutenberg.');
}

/* --------------------------------------------------------------- bluesky */

const BSKY_ALLOWED = new Set([
  'app.bsky.feed.getFeed',
  'app.bsky.feed.searchPosts',
  'app.bsky.feed.getPostThread',
  'app.bsky.feed.getAuthorFeed',
  'app.bsky.feed.getFeedGenerators',
  'app.bsky.actor.getProfile',
]);

async function bsky(p: URLSearchParams): Promise<Response> {
  const path = p.get('path') ?? '';
  if (!BSKY_ALLOWED.has(path)) throw new PonteError('param', 'Consulta do Bluesky não permitida.', 400);
  const q = new URLSearchParams(p);
  q.delete('fn');
  q.delete('path');
  const r = await get(`https://public.api.bsky.app/xrpc/${path}?${q.toString()}`, { accept: 'application/json', maxBytes: 4_000_000 });
  return new Response(r.bytes as Uint8Array<ArrayBuffer>, {
    status: r.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30, s-maxage=60' },
  });
}

/* ---------------------------------------------------------------- rotas */

function json(data: unknown, sMaxAge: number, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': sMaxAge > 0 ? `public, max-age=60, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 4}` : 'no-store',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const p = url.searchParams;
  try {
    switch (p.get('fn')) {
      case 'news':
        return json(await news(p), 600);
      case 'meta':
        return json(await meta(p), 86400);
      case 'article':
        return json(await article(p), 21600);
      case 'catalog':
        return json(await catalog(), 86400);
      case 'book':
        return await book(p);
      case 'bsky':
        return await bsky(p);
      case 'saude':
        return json({ ok: true, hora: new Date().toISOString() }, 0);
      default:
        return json({ error: { code: 'fn', message: 'Função desconhecida.' } }, 0, 400);
    }
  } catch (e) {
    if (e instanceof PonteError) return json({ error: { code: e.code, message: e.message } }, 0, e.status);
    console.error('ponte', p.get('fn'), e);
    return json({ error: { code: 'interno', message: 'Algo deu errado na ponte.' } }, 0, 500);
  }
}
