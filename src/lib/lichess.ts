import { LICHESS, LICHESS_CLIENT_ID } from '../config';
import { ApiError } from './api';
import { lsGet, lsSet, persisted } from './store';

export interface LichessAuth {
  token: string;
  username: string;
  expires?: number;
}

export const auth = persisted<LichessAuth | null>('lichess', null);

const SCOPES = 'board:play challenge:write puzzle:read';

/* -------------------------------------------------- uma requisição por vez */

let chain: Promise<unknown> = Promise.resolve();
let blockedUntil = 0;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => undefined);
  return p;
}

function headers(withAuth: boolean, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', ...extra };
  const a = auth.get();
  if (withAuth && a) h.Authorization = `Bearer ${a.token}`;
  return h;
}

async function check(res: Response, withAuth: boolean): Promise<Response> {
  if (res.status === 429) {
    blockedUntil = Date.now() + 61_000;
    throw new ApiError('lichess-limite', 'O Lichess pediu pra esperar um minuto.', 429);
  }
  if (res.status === 401 && withAuth) {
    auth.set(null);
    throw new ApiError('lichess-sessao', 'Sua conexão com o Lichess acabou. Entre de novo.', 401);
  }
  if (!res.ok) {
    let msg = 'O Lichess não respondeu direito.';
    try {
      const j = await res.json();
      if (typeof j?.error === 'string') msg = j.error;
    } catch {
      /* corpo vazio */
    }
    throw new ApiError('lichess', msg, res.status);
  }
  return res;
}

export async function li<T>(path: string, init: { method?: string; body?: URLSearchParams; auth?: boolean; accept?: string } = {}): Promise<T> {
  return enqueue(async () => {
    if (Date.now() < blockedUntil) throw new ApiError('lichess-limite', 'O Lichess pediu pra esperar um minuto.', 429);
    const withAuth = init.auth ?? !!auth.get();
    let res: Response;
    try {
      res = await fetch(LICHESS + path, {
        method: init.method ?? 'GET',
        body: init.body,
        headers: headers(withAuth, init.accept ? { Accept: init.accept } : undefined),
      });
    } catch {
      throw new ApiError('offline', 'Sem conexão com o Lichess agora.');
    }
    await check(res, withAuth);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  });
}

/* ---------------------------------------------------------- NDJSON */

export function splitNdjson(buffer: string): { lines: unknown[]; rest: string } {
  const lines: unknown[] = [];
  let rest = buffer;
  let nl: number;
  while ((nl = rest.indexOf('\n')) >= 0) {
    const line = rest.slice(0, nl).trim();
    rest = rest.slice(nl + 1);
    if (!line) continue;
    try {
      lines.push(JSON.parse(line));
    } catch {
      /* linha quebrada, ignora */
    }
  }
  return { lines, rest };
}

export async function stream(path: string, onEvent: (e: any) => void, signal: AbortSignal, withAuth = true): Promise<void> {
  let res: Response;
  try {
    res = await fetch(LICHESS + path, { headers: headers(withAuth, { Accept: 'application/x-ndjson' }), signal });
  } catch (e) {
    if (signal.aborted) return;
    throw new ApiError('offline', 'Sem conexão com o Lichess agora.');
  }
  await check(res, withAuth);
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const { lines, rest } = splitNdjson(buf);
      buf = rest;
      lines.forEach(onEvent);
    }
    const { lines } = splitNdjson(buf + '\n');
    lines.forEach(onEvent);
  } catch (e) {
    if (!signal.aborted) throw e;
  }
}

/* ------------------------------------------------------------ login */

function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function redirectUri(): string {
  return location.origin + location.pathname;
}

export async function startLogin(): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  lsSet('lichess-pkce', { verifier, state, at: Date.now() });
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  });
  location.assign(`${LICHESS}/oauth?${q.toString()}`);
}

/** Volta do Lichess com ?code=...; troca o código pelo token. */
export async function finishLogin(): Promise<'ok' | 'nada'> {
  const sp = new URLSearchParams(location.search);
  const code = sp.get('code');
  const state = sp.get('state');
  const error = sp.get('error');
  if (!code && !error) return 'nada';
  history.replaceState(history.state, '', location.pathname + location.hash);
  const saved = lsGet<{ verifier: string; state: string } | null>('lichess-pkce', null);
  lsSet('lichess-pkce', undefined);
  if (error) throw new ApiError('lichess-negado', 'Você não autorizou o Mural no Lichess.');
  if (!saved || saved.state !== state || !code) throw new ApiError('lichess-estado', 'O login do Lichess não bateu. Tente de novo.');
  let res: Response;
  try {
    res = await fetch(`${LICHESS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: saved.verifier,
        redirect_uri: redirectUri(),
        client_id: LICHESS_CLIENT_ID,
      }),
    });
  } catch {
    throw new ApiError('offline', 'Sem conexão com o Lichess agora.');
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new ApiError('lichess-token', 'O Lichess não liberou o acesso. Tente de novo.');
  const token: string = j.access_token;
  const acct = await fetch(`${LICHESS}/api/account`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }).then((r) => r.json());
  auth.set({ token, username: acct.username, expires: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined });
  return 'ok';
}

export async function logout(): Promise<void> {
  const a = auth.get();
  auth.set(null);
  if (a) {
    await fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${a.token}` } }).catch(() => undefined);
  }
}

/* -------------------------------------------------------------- API */

export interface Perf {
  rating: number;
  games: number;
  prov?: boolean;
}

export interface Account {
  id: string;
  username: string;
  perfs?: Record<string, Perf>;
  count?: { all: number; win: number; loss: number; draw: number };
}

export interface DailyPuzzle {
  game: { id: string; pgn: string; clock?: string; players?: { name: string; color: string; rating?: number }[] };
  puzzle: { id: string; rating: number; plays?: number; initialPly: number; solution: string[]; themes: string[] };
}

export interface Playing {
  gameId: string;
  fullId: string;
  color: 'white' | 'black';
  fen: string;
  isMyTurn: boolean;
  lastMove?: string;
  opponent: { id?: string; username?: string; rating?: number; ai?: number };
  speed?: string;
  secondsLeft?: number;
}

export interface GameSummary {
  id: string;
  rated: boolean;
  speed: string;
  perf: string;
  createdAt: number;
  status: string;
  winner?: 'white' | 'black';
  moves?: string;
  opening?: { name: string };
  players: {
    white: { user?: { name: string }; rating?: number; aiLevel?: number };
    black: { user?: { name: string }; rating?: number; aiLevel?: number };
  };
  clock?: { initial: number; increment: number };
}

export const account = () => li<Account>('/api/account', { auth: true });
export const dailyPuzzle = () => li<DailyPuzzle>('/api/puzzle/daily', { auth: false });
export const playing = () => li<{ nowPlaying: Playing[] }>('/api/account/playing?nb=10', { auth: true });

export function challengeAi(o: { level: number; color: 'white' | 'black' | 'random'; clock: string }): Promise<{ id: string }> {
  const body = new URLSearchParams({ level: String(o.level), color: o.color, variant: 'standard' });
  if (o.clock !== 'none') {
    const [min, inc] = o.clock.split('+').map(Number);
    body.set('clock.limit', String(min * 60));
    body.set('clock.increment', String(inc));
  }
  return li<{ id: string }>('/api/challenge/ai', { method: 'POST', body, auth: true });
}

export const move = (id: string, uci: string) => li<{ ok: boolean }>(`/api/board/game/${id}/move/${uci}`, { method: 'POST', auth: true });
export const resign = (id: string) => li<{ ok: boolean }>(`/api/board/game/${id}/resign`, { method: 'POST', auth: true });
export const abort = (id: string) => li<{ ok: boolean }>(`/api/board/game/${id}/abort`, { method: 'POST', auth: true });

export async function recentGames(username: string, max = 20): Promise<GameSummary[]> {
  return enqueue(async () => {
    const res = await fetch(`${LICHESS}/api/games/user/${encodeURIComponent(username)}?max=${max}&moves=true&opening=true&pgnInJson=false`, {
      headers: headers(true, { Accept: 'application/x-ndjson' }),
    }).catch(() => {
      throw new ApiError('offline', 'Sem conexão com o Lichess agora.');
    });
    await check(res, true);
    const { lines } = splitNdjson((await res.text()) + '\n');
    return lines as GameSummary[];
  });
}

export function gameUrl(id: string): string {
  return `${LICHESS}/${id}`;
}
