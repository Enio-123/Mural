import { BSKY_ENTRY, BSKY_PUBLIC } from '../config';
import { ApiError, ponte } from './api';
import { persisted } from './store';

/* ------------------------------------------------------------ tipos */

export interface Author {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: { $type: string; uri?: string; did?: string; tag?: string }[];
}

export interface PostRecord {
  text?: string;
  createdAt?: string;
  facets?: Facet[];
}

export interface ImageView {
  thumb: string;
  fullsize: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
}

export interface ExternalView {
  uri: string;
  title?: string;
  description?: string;
  thumb?: string;
}

export interface EmbedView {
  $type: string;
  images?: ImageView[];
  external?: ExternalView;
  record?: any;
  media?: EmbedView;
  playlist?: string;
  thumbnail?: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
}

export interface PostView {
  uri: string;
  cid: string;
  author: Author;
  record: PostRecord;
  embed?: EmbedView;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  quoteCount?: number;
  indexedAt?: string;
}

export interface FeedItem {
  post: PostView;
  reason?: { $type: string; by?: Author };
  reply?: { parent?: PostView };
}

export interface FeedPage {
  feed: FeedItem[];
  cursor?: string;
}

export interface ThreadNode {
  $type: string;
  post?: PostView;
  parent?: ThreadNode;
  replies?: ThreadNode[];
}

export interface Session {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  service: string;
}

export const DISCOVER = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

export const session = persisted<Session | null>('bsky-sessao', null);

/* ------------------------------------------------------------- rede */

type Params = Record<string, string | number | string[] | undefined>;

function query(params: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.append(k, String(v));
  }
  return q.toString();
}

async function readError(res: Response): Promise<{ error?: string; message?: string }> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

let refreshing: Promise<Session> | null = null;

async function refresh(s: Session): Promise<Session> {
  if (!refreshing) {
    refreshing = (async () => {
      const res = await fetch(`${s.service}/xrpc/com.atproto.server.refreshSession`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.refreshJwt}` },
      });
      if (!res.ok) {
        session.set(null);
        throw new ApiError('bsky-sessao', 'Sua sessão do Bluesky expirou. Entre de novo em Ajustes.', res.status);
      }
      const j = await res.json();
      const next: Session = { ...s, accessJwt: j.accessJwt, refreshJwt: j.refreshJwt, handle: j.handle ?? s.handle };
      session.set(next);
      return next;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function authed<T>(method: string, params: Params): Promise<T> {
  let s = session.get();
  if (!s) throw new ApiError('bsky-login', 'Entre na sua conta do Bluesky pra ver isso.');
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${s.service}/xrpc/${method}?${query(params)}`, {
      headers: { Authorization: `Bearer ${s.accessJwt}` },
    });
    if (res.ok) return (await res.json()) as T;
    const err = await readError(res);
    if ((res.status === 400 || res.status === 401) && err.error === 'ExpiredToken' && attempt === 0) {
      s = await refresh(s);
      continue;
    }
    if (res.status === 401) {
      session.set(null);
      throw new ApiError('bsky-sessao', 'Sua sessão do Bluesky acabou. Entre de novo em Ajustes.', 401);
    }
    throw new ApiError('bsky', err.message || 'O Bluesky não respondeu direito.', res.status);
  }
  throw new ApiError('bsky', 'O Bluesky não respondeu direito.');
}

async function publicGet<T>(method: string, params: Params): Promise<T> {
  let res: Response | null = null;
  try {
    res = await fetch(`${BSKY_PUBLIC}/${method}?${query(params)}`);
  } catch {
    res = null; // rede ou CORS: tenta pela ponte
  }
  if (res && res.ok) return (await res.json()) as T;
  if (res && res.status !== 0 && res.status < 500 && res.status !== 403) {
    const err = await readError(res);
    throw new ApiError('bsky', err.message || 'O Bluesky recusou essa busca.', res.status);
  }
  const flat: Record<string, string> = { path: method };
  for (const [k, v] of Object.entries(params)) if (v !== undefined && !Array.isArray(v)) flat[k] = String(v);
  return ponte<T>('bsky', flat);
}

function xrpc<T>(method: string, params: Params): Promise<T> {
  return session.get() ? authed<T>(method, params) : publicGet<T>(method, params);
}

/* ------------------------------------------------------------ conta */

export async function login(identifier: string, password: string): Promise<Session> {
  const id = identifier.trim().replace(/^@/, '');
  let res: Response;
  try {
    res = await fetch(`${BSKY_ENTRY}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: id, password: password.trim() }),
    });
  } catch {
    throw new ApiError('offline', 'Sem conexão com o Bluesky agora.');
  }
  if (!res.ok) {
    const err = await readError(res);
    if (err.error === 'AuthFactorTokenRequired') throw new ApiError('bsky-2fa', 'Sua conta pede código por e-mail. Use uma senha de app, que não pede.');
    if (res.status === 429) throw new ApiError('bsky-limite', 'Muitas tentativas. Espere alguns minutos.');
    if (res.status === 401 || err.error === 'AuthenticationRequired') throw new ApiError('bsky-senha', 'Usuário ou senha de app incorretos.');
    throw new ApiError('bsky', err.message || 'Não consegui entrar no Bluesky.', res.status);
  }
  const j = await res.json();
  const pds = (j.didDoc?.service as { id?: string; type?: string; serviceEndpoint?: string }[] | undefined)?.find(
    (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer',
  )?.serviceEndpoint;
  const s: Session = { did: j.did, handle: j.handle, accessJwt: j.accessJwt, refreshJwt: j.refreshJwt, service: (pds || BSKY_ENTRY).replace(/\/$/, '') };
  session.set(s);
  return s;
}

export function logout(): void {
  const s = session.get();
  session.set(null);
  if (s) {
    void fetch(`${s.service}/xrpc/com.atproto.server.deleteSession`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.refreshJwt}` },
    }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------ feeds */

export function timeline(cursor?: string): Promise<FeedPage> {
  return authed<FeedPage>('app.bsky.feed.getTimeline', { limit: 40, cursor });
}

export function feed(uri: string, cursor?: string): Promise<FeedPage> {
  return xrpc<FeedPage>('app.bsky.feed.getFeed', { feed: uri, limit: 40, cursor });
}

export async function search(q: string, cursor?: string): Promise<FeedPage> {
  const r = await xrpc<{ posts: PostView[]; cursor?: string }>('app.bsky.feed.searchPosts', { q, lang: 'pt', sort: 'top', limit: 30, cursor });
  return { feed: r.posts.map((post) => ({ post })), cursor: r.cursor };
}

export async function thread(uri: string): Promise<ThreadNode> {
  const r = await xrpc<{ thread: ThreadNode }>('app.bsky.feed.getPostThread', { uri, depth: 2, parentHeight: 4 });
  return r.thread;
}

export interface SavedFeed {
  uri: string;
  name: string;
}

export async function pinnedFeeds(): Promise<SavedFeed[]> {
  const prefsRes = await authed<{ preferences: { $type: string; items?: { type: string; value: string; pinned: boolean }[]; pinned?: string[] }[] }>(
    'app.bsky.actor.getPreferences',
    {},
  );
  const uris: string[] = [];
  for (const p of prefsRes.preferences) {
    if (p.$type === 'app.bsky.actor.defs#savedFeedsPrefV2') {
      for (const it of p.items ?? []) if (it.type === 'feed' && it.pinned && it.value !== DISCOVER) uris.push(it.value);
    } else if (p.$type === 'app.bsky.actor.defs#savedFeedsPref') {
      for (const u of p.pinned ?? []) if (u.includes('app.bsky.feed.generator') && u !== DISCOVER && !uris.includes(u)) uris.push(u);
    }
  }
  if (!uris.length) return [];
  const gens = await authed<{ feeds: { uri: string; displayName: string }[] }>('app.bsky.feed.getFeedGenerators', { feeds: uris.slice(0, 12) });
  return gens.feeds.map((f) => ({ uri: f.uri, name: f.displayName }));
}

/* ------------------------------------------------------ texto rico */

export interface Segment {
  text: string;
  link?: string;
  mention?: string;
  tag?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Os facets usam posições em bytes UTF-8; aqui viram pedaços de texto. */
export function segments(text: string, facets?: Facet[]): Segment[] {
  if (!facets?.length) return [{ text }];
  const bytes = enc.encode(text);
  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);
  const out: Segment[] = [];
  let pos = 0;
  for (const f of sorted) {
    const { byteStart, byteEnd } = f.index;
    if (byteStart < pos || byteEnd > bytes.length || byteEnd <= byteStart) continue;
    if (byteStart > pos) out.push({ text: dec.decode(bytes.slice(pos, byteStart)) });
    const seg: Segment = { text: dec.decode(bytes.slice(byteStart, byteEnd)) };
    for (const feat of f.features) {
      if (feat.$type === 'app.bsky.richtext.facet#link' && feat.uri) seg.link = feat.uri;
      else if (feat.$type === 'app.bsky.richtext.facet#mention' && feat.did) seg.mention = feat.did;
      else if (feat.$type === 'app.bsky.richtext.facet#tag' && feat.tag) seg.tag = feat.tag;
    }
    out.push(seg);
    pos = byteEnd;
  }
  if (pos < bytes.length) out.push({ text: dec.decode(bytes.slice(pos)) });
  return out;
}

export function postUrl(p: PostView): string {
  const rkey = p.uri.split('/').pop();
  return `https://bsky.app/profile/${p.author.handle}/post/${rkey}`;
}
