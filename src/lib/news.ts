import { useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, errorText, ponte, pool } from './api';
import { cached, idbGet, idbSet } from './store';
import { findInterest, ponteParams } from './interests';
import { allSources } from './sources';
import { readIds, sourceKey, weightOf } from './learn';
import { prefs, type Prefs } from './prefs';

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

/** Notícia com as etiquetas de onde veio: id do assunto, "destaques" ou "fonte:<id>". */
export interface Story extends NewsItem {
  tags: string[];
}

export interface NewsState {
  top: Story[];
  forYou: Story[];
  byTag: Record<string, Story[]>;
  status: Record<string, 'ok' | 'erro'>;
  at: number;
}

const TTL = 15 * 60 * 1000;

export function normTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function dedupe(stories: Story[]): Story[] {
  const seen = new Map<string, Story>();
  const out: Story[] = [];
  for (const s of stories) {
    const key = normTitle(s.title);
    const existing = seen.get(key) ?? seen.get(s.url);
    if (existing) {
      for (const t of s.tags) if (!existing.tags.includes(t)) existing.tags.push(t);
      if (!existing.image && s.image) existing.image = s.image;
      if (!existing.summary && s.summary) existing.summary = s.summary;
      continue;
    }
    const copy: Story = { ...s, tags: [...s.tags] };
    seen.set(key, copy);
    seen.set(s.url, copy);
    out.push(copy);
  }
  return out;
}

function interestTags(s: Story): string[] {
  return s.tags.filter((t) => t !== 'destaques' && !t.startsWith('fonte:'));
}

export function score(s: Story, now: number, read: Set<string>, boost = 1): number {
  const t = s.published ? Date.parse(s.published) : NaN;
  const ageH = Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : 30;
  const recency = Math.exp(-ageH / 20);
  const tags = interestTags(s);
  const iw = tags.length ? Math.max(...tags.map((x) => weightOf('i:' + x))) : 0.9;
  const sw = weightOf(sourceKey(s.source));
  const img = s.image ? 1.05 : 1;
  const seenFactor = read.has(s.id) ? 0.35 : 1;
  return recency * iw * sw * img * seenFactor * boost;
}

export function rank(stories: Story[], now = Date.now(), boosts?: Map<string, number>): Story[] {
  const read = new Set(readIds.get());
  return stories
    .map((s) => ({ s, v: score(s, now, read, boosts?.get(s.id) ?? 1) }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.s);
}

interface Job {
  key: string;
  tag: string;
  params: Record<string, string>;
  sourceName?: string;
}

export function buildJobs(p: Prefs): Job[] {
  const jobs: Job[] = [{ key: 'gn-top', tag: 'destaques', params: { src: 'gn-top' } }];
  for (const id of p.interests) {
    const i = findInterest(id, p.custom);
    if (i) jobs.push({ key: 'i:' + i.id, tag: i.id, params: ponteParams(i) });
  }
  for (const src of allSources(p.extraSources)) {
    if (p.sources.includes(src.id)) {
      jobs.push({ key: 'f:' + src.id, tag: 'fonte:' + src.id, params: { src: 'rss', url: src.url }, sourceName: src.name });
    }
  }
  return jobs;
}

export function combine(jobs: Job[], results: PromiseSettledResult<NewsItem[]>[], now = Date.now()): NewsState {
  const status: Record<string, 'ok' | 'erro'> = {};
  const byTag: Record<string, Story[]> = {};
  const fromInterests: Story[] = [];
  const fromSources: Story[] = [];
  results.forEach((r, idx) => {
    const job = jobs[idx];
    if (r.status !== 'fulfilled') {
      status[job.key] = 'erro';
      return;
    }
    status[job.key] = 'ok';
    const stories: Story[] = r.value.map((it) => ({ ...it, source: job.sourceName ?? it.source, tags: [job.tag] }));
    byTag[job.tag] = stories;
    if (job.tag.startsWith('fonte:')) fromSources.push(...stories);
    else if (job.tag !== 'destaques') fromInterests.push(...stories);
  });
  const google = byTag['destaques'] ?? [];
  const boosts = new Map<string, number>();
  google.forEach((s, i) => boosts.set(s.id, Math.max(1, 1.6 - i * 0.03)));
  const top = rank(dedupe([...google, ...fromSources]), now, boosts);
  const forYou = rank(dedupe([...fromInterests, ...fromSources]), now);
  return { top, forYou, byTag, status, at: now };
}

export async function loadNews(p: Prefs, force = false): Promise<NewsState> {
  const jobs = buildJobs(p);
  const results = await pool(jobs, 4, async (job) => {
    const r = await cached<{ items: NewsItem[] }>('news:' + job.key + ':' + JSON.stringify(job.params), TTL, () => ponte('news', job.params), { force });
    return r.data.items;
  });
  if (results.every((r) => r.status === 'rejected')) {
    const first = results[0] as PromiseRejectedResult;
    throw first.reason instanceof Error ? first.reason : new ApiError('noticias', 'Não consegui buscar as notícias.');
  }
  return combine(jobs, results);
}

/* ------------------------------------------- estado compartilhado */

interface Shared {
  state: NewsState | null;
  loading: boolean;
  error: string | null;
  key: string;
}

let shared: Shared = { state: null, loading: false, error: null, key: '' };
const subs = new Set<() => void>();
function emit(next: Partial<Shared>) {
  shared = { ...shared, ...next };
  subs.forEach((f) => f());
}

function prefsKey(p: Prefs): string {
  return JSON.stringify([p.interests, p.sources, p.extraSources.map((s) => s.url), p.custom.map((c) => c.id)]);
}

let inflight: Promise<void> | null = null;

export function refreshNews(force = false): Promise<void> {
  if (inflight && !force) return inflight;
  const p = prefs.get();
  const key = prefsKey(p);
  emit({ loading: true, key });
  const run = loadNews(p, force)
    .then((state) => emit({ state, error: null }))
    .catch((e) => emit({ error: errorText(e) }))
    .finally(() => {
      emit({ loading: false });
      inflight = null;
    });
  inflight = run;
  return run;
}

export function useNews() {
  const snap = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => shared,
  );
  const p = prefs.use();
  const key = prefsKey(p);
  useEffect(() => {
    const stale = !shared.state || Date.now() - shared.state.at > TTL;
    if ((shared.key !== key || stale) && !inflight) void refreshNews(false);
  }, [key]);
  return snap;
}

/* ------------------------------------------------ imagem dos cartões */

const metaQueue: (() => Promise<void>)[] = [];
let metaRunning = 0;
function runMeta() {
  while (metaRunning < 3 && metaQueue.length) {
    const job = metaQueue.shift()!;
    metaRunning++;
    void job().finally(() => {
      metaRunning--;
      runMeta();
    });
  }
}

const metaMemo = new Map<string, Promise<string | null>>();

export function storyImage(s: NewsItem): Promise<string | null> {
  if (s.image) return Promise.resolve(s.image);
  const memo = metaMemo.get(s.id);
  if (memo) return memo;
  const p = new Promise<string | null>((resolve) => {
    metaQueue.push(async () => {
      const hit = await idbGet<{ image: string | null; at: number }>('meta:' + s.id);
      if (hit && Date.now() - hit.at < 7 * 86_400_000) return resolve(hit.image);
      try {
        const m = await ponte<{ image: string | null }>('meta', { url: s.url });
        void idbSet('meta:' + s.id, { image: m.image, at: Date.now() });
        resolve(m.image);
      } catch {
        resolve(null);
      }
    });
    runMeta();
  });
  metaMemo.set(s.id, p);
  return p;
}

export function useStoryImage(s: NewsItem, enabled = true): string | null {
  const [img, setImg] = useState<string | null>(s.image ?? null);
  useEffect(() => {
    if (s.image || !enabled) return;
    let alive = true;
    void storyImage(s).then((v) => alive && setImg(v));
    return () => {
      alive = false;
    };
  }, [s.id, s.image, enabled]);
  return img;
}

/* -------------------------------------------------------- matérias */

export interface Article {
  url: string;
  title: string;
  byline: string | null;
  site: string;
  published: string | null;
  image: string | null;
  html: string;
  minutes: number;
}

export async function loadArticle(s: NewsItem, force = false): Promise<Article> {
  const r = await cached<Article>('artigo:' + s.id, 7 * 86_400_000, () => ponte<Article>('article', { url: s.url }), { force });
  return r.data;
}
