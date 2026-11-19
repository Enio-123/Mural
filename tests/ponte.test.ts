import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  GET,
  parseFeed,
  decodeGnOffline,
  parseBatchExecute,
  extractArticle,
  catalogFromCsv,
  cleanAuthors,
  parseCsv,
  isPrivateIp,
  readMetaFromHtml,
  newsUrl,
} from '../api/ponte';

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8');

beforeAll(() => {
  process.env.PONTE_SKIP_DNS = '1';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function call(qs: string) {
  return GET(new Request('https://mural.test/api/ponte?' + qs));
}

describe('feeds', () => {
  it('Google Notícias: tira a fonte do título e lê a cobertura relacionada', () => {
    const items = parseFeed(fx('gn-top.xml'), 'Google Notícias', 'https://news.google.com/rss?hl=pt-BR');
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Senado aprova ajuste fiscal e texto vai à sanção');
    expect(items[0].source).toBe('Agência Brasil');
    expect(items[0].sourceUrl).toBe('https://agenciabrasil.ebc.com.br');
    expect(items[0].url).toMatch(/^https:\/\/news\.google\.com\/rss\/articles\//);
    expect(items[0].published).toBe('2026-11-18T22:39:00.000Z');
    expect(items[0].related).toEqual([
      { url: 'https://news.google.com/rss/articles/CBMiQkFVX3lxTE1fb3V0cm8?oc=5', title: 'Ajuste fiscal: o que muda no Orçamento de 2027', source: 'g1' },
    ]);
    expect(items[1].related).toBeUndefined();
  });

  it('Agência Brasil: usa a imagem de destaque e ignora logo e pixel', () => {
    const [it0] = parseFeed(fx('agencia-brasil.xml'), 'x', 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml');
    expect(it0.image).toBe('https://imagens.ebc.com.br/destaque/senado-2026.jpg');
    expect(it0.summary).toBe('Proposta segue agora para sanção presidencial.');
    expect(it0.source).toBe('Agência Brasil - Últimas notícias');
    expect(it0.published).toBe('2026-11-18T22:39:00.000Z');
  });

  it('WordPress: pega a imagem do content:encoded', () => {
    const [it0] = parseFeed(fx('olhar-digital.xml'), 'x', 'https://olhardigital.com.br/feed/');
    expect(it0.image).toBe('https://img.olhardigital.com.br/wp-content/uploads/2026/11/ia-observada.jpg');
    expect(it0.summary).toBe('Pesquisadores discutem se modelos percebem testes …');
  });

  it('Atom: link alternate, miniatura e entidades', () => {
    const [it0] = parseFeed(fx('atom.xml'), 'x', 'https://exemplo.org/feed');
    expect(it0.url).toBe('https://exemplo.org/abertura-italiana');
    expect(it0.title).toBe('Abertura italiana & ideias');
    expect(it0.image).toBe('https://exemplo.org/img/italiana.jpg');
    expect(it0.source).toBe('Blog de Xadrez');
  });

  it('recusa o que não é feed', () => {
    expect(() => parseFeed('<html><body>oi</body></html>', 'x')).toThrow(/não é um feed/);
  });

  it('monta os links do Google Notícias em português', () => {
    expect(newsUrl(new URLSearchParams('src=gn-top')).url).toBe('https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419');
    expect(newsUrl(new URLSearchParams('src=gn-topic&topic=technology')).url).toContain('/headlines/section/topic/TECHNOLOGY?');
    expect(newsUrl(new URLSearchParams('src=gn-search&q=xadrez')).url).toContain('search?q=xadrez%20when%3A3d&hl=pt-BR');
    expect(() => newsUrl(new URLSearchParams('src=gn-topic&topic=HACK'))).toThrow();
  });
});

describe('Google Notícias: links', () => {
  it('decodifica o formato antigo sem rede', () => {
    expect(decodeGnOffline(fx('gn-old-id.txt').trim())).toBe('https://www.exemplo.com.br/noticia/2026/11/18/teste.html');
    expect(decodeGnOffline('CBMiTEFVX3lxTE5fYWJjZGVm')).toBeNull();
  });

  it('lê a resposta do batchexecute', () => {
    expect(parseBatchExecute(fx('batchexecute.txt'))).toBe('https://agenciabrasil.ebc.com.br/politica/noticia/2026-11/senado-aprova');
    expect(parseBatchExecute(")]}'\n\n[]")).toBeNull();
    const plain = ")]}'\n\n" + JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", "https://g1.globo.com/x.ghtml", 1]), null, null, null, "generic"], ["di", 10], ["af.httprm", 10, "1", 2]]);
    expect(parseBatchExecute(plain)).toBe('https://g1.globo.com/x.ghtml');
  });
});

describe('matérias', () => {
  it('extrai o texto limpo, com imagens e links absolutos', () => {
    const a = extractArticle(fx('artigo.html'), 'https://agenciabrasil.ebc.com.br/politica/noticia/2026-11/senado-aprova');
    expect(a.title).toBe('Senado aprova ajuste fiscal e texto vai à sanção');
    expect(a.site).toBe('Agência Brasil');
    expect(a.image).toBe('https://agenciabrasil.ebc.com.br/sites/default/files/destaque.jpg');
    expect(a.published).toBe('2026-11-18T22:39:00.000Z');
    expect(a.html).toContain('O Senado aprovou nesta quarta-feira');
    expect(a.html).toContain('src="https://agenciabrasil.ebc.com.br/sites/default/files/foto-plenario.jpg"');
    expect(a.html).toContain('href="https://agenciabrasil.ebc.com.br/economia/noticia/2026-11/entenda-o-ajuste"');
    expect(a.html).not.toMatch(/<script|onclick|pixel\.exemplo|style=|data:image/);
    expect(a.minutes).toBeGreaterThanOrEqual(1);
  });

  it('lê metadados com atributos em qualquer ordem', () => {
    const m = readMetaFromHtml('<meta content="https://x.com/a.jpg" property="og:image"><meta name="twitter:title" content="T &amp; U">', 'https://x.com/p');
    expect(m.image).toBe('https://x.com/a.jpg');
    expect(m.title).toBe('T & U');
  });

  it('recusa página sem texto suficiente', () => {
    expect(() => extractArticle('<html><body><p>Assine para ler.</p></body></html>', 'https://x.com/a')).toThrow(/paywall/);
  });
});

describe('livros', () => {
  it('lê CSV com aspas, quebras de linha e vírgulas', () => {
    const rows = parseCsv('a,b\n"x, y","linha 1\nlinha 2"\n"aspas ""dentro""",z\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'linha 1\nlinha 2'],
      ['aspas "dentro"', 'z'],
    ]);
  });

  it('arruma nomes de autores', () => {
    expect(cleanAuthors('Machado de Assis, 1839-1908')).toEqual(['Machado de Assis']);
    expect(cleanAuthors('Camões, Luís de, 1524?-1580')).toEqual(['Luís de Camões']);
    expect(cleanAuthors('Alencar, José Martiniano de, 1829-1877; Tradutor, Teste, 1950- [Translator]')).toEqual(['José Martiniano de Alencar']);
  });

  it('filtra o catálogo do Gutenberg só com livros em português', () => {
    const books = catalogFromCsv(fx('pg_catalog.csv'));
    expect(books.map((b) => b.id)).toEqual([55752, 54829, 3333, 4242]);
    expect(books[3].title).toBe('Iracema Lenda do Ceará');
    expect(books[2].authors).toEqual(['Luís de Camões']);
  });
});

describe('segurança da ponte', () => {
  it('reconhece IPs internos', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.20.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '100.64.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '200.160.2.3', '2606:4700::1111']) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it('não busca endereços internos nem protocolos estranhos', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const u of ['http://127.0.0.1/x', 'http://localhost:3000/', 'file:///etc/passwd', 'http://169.254.169.254/latest/meta-data', 'http://servidor.internal/']) {
      const r = await call('fn=article&url=' + encodeURIComponent(u));
      expect(r.status, u).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('para no redirecionamento para endereço interno', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })));
    const r = await call('fn=meta&url=' + encodeURIComponent('https://site.com.br/a'));
    expect(r.status).toBe(400);
  });

  it('função desconhecida', async () => {
    const r = await call('fn=xyz');
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('fn');
  });
});

describe('rotas com rede simulada', () => {
  it('news devolve itens e cache de 10 minutos na CDN', async () => {
    const f = vi.fn(async (u: URL | string) => {
      expect(String(u)).toBe('https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419');
      return new Response(fx('gn-top.xml'), { headers: { 'content-type': 'application/xml; charset=UTF-8' } });
    });
    vi.stubGlobal('fetch', f);
    const r = await call('fn=news&src=gn-top');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('s-maxage=600');
    const body = await r.json();
    expect(body.items).toHaveLength(2);
  });

  it('article decodifica o link novo do Google e lê a matéria', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string, init?: RequestInit) => {
      const s = String(u);
      calls.push((init?.method ?? 'GET') + ' ' + s);
      if (s.startsWith('https://news.google.com/articles/')) return new Response(fx('gn-article-page.html'), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (s.startsWith('https://news.google.com/_/DotsSplashUi/data/batchexecute')) {
        const body = decodeURIComponent(String(init?.body).slice('f.req='.length));
        expect(body).toContain('CBMiTEFVX3lxTE5fYWJjZGVm');
        expect(body).toContain('1763505540');
        expect(body).toContain('AZ5r3eT_assinaturaDeTeste');
        return new Response(fx('batchexecute.txt'), { headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      if (s === 'https://agenciabrasil.ebc.com.br/politica/noticia/2026-11/senado-aprova') {
        return new Response(fx('artigo.html'), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response('nada', { status: 404 });
    }));
    const r = await call('fn=article&url=' + encodeURIComponent('https://news.google.com/rss/articles/CBMiTEFVX3lxTE5fYWJjZGVm?oc=5'));
    const body = await r.json();
    expect(r.status, JSON.stringify(body)).toBe(200);
    expect(body.url).toBe('https://agenciabrasil.ebc.com.br/politica/noticia/2026-11/senado-aprova');
    expect(body.html).toContain('O Senado aprovou');
    expect(calls[1]).toMatch(/^POST https:\/\/news\.google\.com\/_\/DotsSplashUi/);
  });

  it('article explica quando o site bloqueia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('proibido', { status: 403, headers: { 'content-type': 'text/html' } })));
    const r = await call('fn=article&url=' + encodeURIComponent('https://site.com.br/materia'));
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('bloqueado');
  });

  it('catalog filtra português', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(fx('pg_catalog.csv'), { headers: { 'content-type': 'text/csv' } })));
    const r = await call('fn=catalog');
    const body = await r.json();
    expect(body.books).toHaveLength(4);
    expect(r.headers.get('cache-control')).toContain('s-maxage=86400');
  });

  it('catalog usa o espelho oficial, descompacta o .gz e nunca o site principal', async () => {
    const seen: string[] = [];
    const gz = gzipSync(Buffer.from(fx('pg_catalog.csv'), 'utf-8'));
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) => {
      seen.push(String(u));
      return new Response(gz, { headers: { 'content-type': 'application/gzip' } });
    }));
    const r = await call('fn=catalog');
    const body = await r.json();
    expect(r.status, JSON.stringify(body)).toBe(200);
    expect(body.books).toHaveLength(4);
    expect(seen).toEqual(['https://gutenberg.pglaf.org/cache/epub/feeds/pg_catalog.csv.gz']);
  });

  it('catalog tenta o .csv quando o .gz falha', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) => {
      seen.push(String(u));
      if (String(u).endsWith('.gz')) return new Response('fora do ar', { status: 503 });
      return new Response(fx('pg_catalog.csv'), { headers: { 'content-type': 'text/csv' } });
    }));
    const r = await call('fn=catalog');
    expect(r.status).toBe(200);
    expect(seen.every((u) => u.startsWith('https://gutenberg.pglaf.org/'))).toBe(true);
    expect(seen).toHaveLength(2);
  });

  it('catalog explica quando o espelho está fora do ar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('fora do ar', { status: 503 })));
    const r = await call('fn=catalog');
    expect(r.status).toBe(502);
    expect((await r.json()).error.message).toBe('O Gutenberg respondeu 503.');
  });

  it('book devolve o ePub e tenta o formato seguinte quando falha', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(600).fill(0)]);
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) => {
      seen.push(String(u));
      if (String(u).endsWith('-images-3.epub')) return new Response('não', { status: 404 });
      return new Response(zip, { headers: { 'content-type': 'application/epub+zip' } });
    }));
    const r = await call('fn=book&id=55752');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/epub+zip');
    expect(new Uint8Array(await r.arrayBuffer()).length).toBe(zip.length);
    expect(seen).toEqual([
      'https://gutenberg.pglaf.org/cache/epub/55752/pg55752-images-3.epub',
      'https://gutenberg.pglaf.org/cache/epub/55752/pg55752-images.epub',
    ]);
  });

  it('book recusa id estranho', async () => {
    const r = await call('fn=book&id=../../etc');
    expect(r.status).toBe(400);
  });

  it('bsky só deixa consultas de leitura da lista', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"feed":[]}', { headers: { 'content-type': 'application/json' } })));
    expect((await call('fn=bsky&path=com.atproto.server.createSession')).status).toBe(400);
    const ok = await call('fn=bsky&path=app.bsky.feed.getFeed&feed=at://x/app.bsky.feed.generator/y&limit=5');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ feed: [] });
  });
});
