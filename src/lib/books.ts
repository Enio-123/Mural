import { useEffect, useState } from 'react';
import { ApiError, ponte, ponteBytes } from './api';
import { cached, idbDel, idbGet, idbSet, persisted } from './store';

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  source: 'arquivo' | 'gutenberg';
  gid?: number;
  coverUrl?: string;
  hasCover?: boolean;
  size: number;
  addedAt: number;
  lastOpened?: number;
  cfi?: string;
  pct?: number;
  chapter?: string;
}

export const library = persisted<BookMeta[]>('livros', []);

export function sortedLibrary(list: BookMeta[]): BookMeta[] {
  return [...list].sort((a, b) => (b.lastOpened ?? b.addedAt) - (a.lastOpened ?? a.addedAt));
}

export function bookFile(id: string): Promise<ArrayBuffer | undefined> {
  return idbGet<ArrayBuffer>('livro:' + id);
}

export function updateBook(id: string, patch: Partial<BookMeta>): void {
  library.set((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
}

export async function removeBook(id: string): Promise<void> {
  library.set((list) => list.filter((b) => b.id !== id));
  await idbDel('livro:' + id);
  await idbDel('capa:' + id);
  await idbDel('loc:' + id);
}

/** Capa pelo espelho oficial do Gutenberg: muitas capas de uma vez no site principal podem bloquear o seu IP. */
export function gutenbergCover(gid: number): string {
  return `https://gutenberg.pglaf.org/cache/epub/${gid}/pg${gid}.cover.medium.jpg`;
}

function isZip(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b;
}

function hashBytes(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(b.length / 4096));
  for (let i = 0; i < b.length; i += step) {
    h ^= b[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + b.length.toString(36);
}

/** Pede ao navegador para não apagar os livros quando faltar espaço. */
function keepStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* navegador sem esse recurso */
  }
}

async function shrink(blobUrl: string, maxH = 420): Promise<Blob | undefined> {
  try {
    const img = new Image();
    img.src = blobUrl;
    await img.decode();
    const scale = Math.min(1, maxH / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | undefined>((r) => canvas.toBlob((b) => r(b ?? undefined), 'image/jpeg', 0.82));
  } catch {
    return undefined;
  }
}

export async function readEpubMeta(buf: ArrayBuffer): Promise<{ title?: string; author?: string; cover?: Blob }> {
  const { default: ePub } = await import('epubjs');
  const book = ePub(buf.slice(0));
  try {
    const md = (await book.loaded.metadata) as { title?: string; creator?: string };
    let cover: Blob | undefined;
    try {
      const url = await book.coverUrl();
      if (url) cover = await shrink(url);
    } catch {
      /* livro sem capa */
    }
    return { title: md.title?.trim() || undefined, author: md.creator?.trim() || undefined, cover };
  } finally {
    closeBook(book);
  }
}

/**
 * Fecha um livro do epub.js só depois que ele termina de carregar por dentro:
 * fechar antes faz o epub.js dar erro sozinho em segundo plano.
 */
export function closeBook(book: { ready: Promise<unknown>; destroy(): void }, alsoWait?: Promise<unknown> | null): void {
  const ready = book.ready;
  const limit = new Promise((r) => setTimeout(r, 20_000));
  void Promise.race([Promise.allSettled([ready, alsoWait ?? Promise.resolve()]), limit]).then(() => {
    try {
      book.destroy();
    } catch {
      /* já fechado */
    }
  });
}

export async function importFile(file: File): Promise<BookMeta> {
  const buf = await file.arrayBuffer();
  if (!isZip(buf)) throw new ApiError('livro-formato', 'Esse arquivo não é um ePub.');
  const id = 'a-' + hashBytes(buf);
  const existing = library.get().find((b) => b.id === id);
  if (existing) return existing;
  let info: { title?: string; author?: string; cover?: Blob } = {};
  try {
    info = await readEpubMeta(buf);
  } catch {
    throw new ApiError('livro-formato', 'Não consegui abrir esse ePub. Ele pode estar com DRM ou corrompido.');
  }
  keepStorage();
  await idbSet('livro:' + id, buf);
  if (info.cover) await idbSet('capa:' + id, info.cover);
  const meta: BookMeta = {
    id,
    title: info.title ?? file.name.replace(/\.epub$/i, ''),
    author: info.author ?? '',
    source: 'arquivo',
    hasCover: !!info.cover,
    size: buf.byteLength,
    addedAt: Date.now(),
  };
  library.set((list) => [meta, ...list.filter((b) => b.id !== id)]);
  return meta;
}

/* ---------------------------------------------------------- catálogo */

export interface CatalogBook {
  id: number;
  title: string;
  authors: string[];
}

export async function loadCatalog(force = false): Promise<CatalogBook[]> {
  const r = await cached<{ books: CatalogBook[] }>('catalogo-pt', 7 * 86_400_000, () => ponte('catalog'), { force });
  return r.data.books;
}

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const AUTHORS = [
  'machado de assis',
  'jose de alencar',
  'aluisio azevedo',
  'lima barreto',
  'eca de queiroz',
  'eca de queiros',
  'luis de camoes',
  'euclides da cunha',
  'raul pompeia',
  'bernardo guimaraes',
  'manuel antonio de almeida',
  'joaquim manuel de macedo',
  'goncalves dias',
  'castro alves',
  'olavo bilac',
  'alvares de azevedo',
  'julio dinis',
  'camilo castelo branco',
  'almeida garrett',
  'visconde de taunay',
  'cruz e sousa',
  'antero de quental',
  'cesario verde',
];

const FAMOUS = [
  'dom casmurro',
  'memorias posthumas de braz cubas',
  'memorias postumas de bras cubas',
  'o cortico',
  'iracema',
  'o guarany',
  'o guarani',
  'os lusiadas',
  'os sertoes',
  'o atheneu',
  'o ateneu',
  'triste fim de policarpo quaresma',
  'a moreninha',
  'senhora',
  'luciola',
  'quincas borba',
  'o alienista',
  'a cidade e as serras',
  'o primo bazilio',
  'o primo basilio',
  'os maias',
  'amor de perdicao',
  'memorias de um sargento de milicias',
  'a escrava isaura',
  'helena',
  'esau e jacob',
  'o crime do padre amaro',
  'innocencia',
  'inocencia',
];

function authorRank(b: CatalogBook): number {
  const a = norm(b.authors.join(' '));
  const i = AUTHORS.findIndex((x) => a.includes(x));
  return i < 0 ? 999 : i;
}

function famousRank(b: CatalogBook): number {
  const t = norm(b.title);
  const i = FAMOUS.findIndex((x) => t === x || t.startsWith(x + ' '));
  return i < 0 ? 999 : i;
}

/** Clássicos em destaque: obras famosas primeiro, depois os autores da lista. */
export function classics(books: CatalogBook[], limit = 40): CatalogBook[] {
  return books
    .filter((b) => authorRank(b) < 999 || famousRank(b) < 999)
    .sort((x, y) => famousRank(x) - famousRank(y) || authorRank(x) - authorRank(y) || x.title.localeCompare(y.title, 'pt'))
    .slice(0, limit);
}

export function searchCatalog(books: CatalogBook[], q: string, limit = 60): CatalogBook[] {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  return books
    .filter((b) => {
      const hay = norm(b.title + ' ' + b.authors.join(' '));
      return words.every((w) => hay.includes(w));
    })
    .sort((x, y) => famousRank(x) - famousRank(y) || authorRank(x) - authorRank(y))
    .slice(0, limit);
}

export async function downloadGutenberg(b: CatalogBook): Promise<BookMeta> {
  const id = 'g-' + b.id;
  const existing = library.get().find((x) => x.id === id);
  if (existing && (await bookFile(id))) return existing;
  const buf = await ponteBytes('book', { id: String(b.id) });
  if (!isZip(buf)) throw new ApiError('livro', 'O arquivo do livro veio estranho. Tente de novo.');
  keepStorage();
  await idbSet('livro:' + id, buf);
  const meta: BookMeta = {
    id,
    title: b.title,
    author: b.authors.join(', '),
    source: 'gutenberg',
    gid: b.id,
    coverUrl: gutenbergCover(b.id),
    size: buf.byteLength,
    addedAt: Date.now(),
  };
  library.set((list) => [meta, ...list.filter((x) => x.id !== id)]);
  return meta;
}

/** Endereço da capa: guardada no aparelho (ePub próprio) ou do Gutenberg. */
export function useCover(b: Pick<BookMeta, 'id' | 'coverUrl' | 'hasCover'>): string | undefined {
  const [url, setUrl] = useState<string | undefined>(b.coverUrl);
  useEffect(() => {
    if (b.coverUrl || !b.hasCover) return;
    let objectUrl: string | undefined;
    let alive = true;
    void idbGet<Blob>('capa:' + b.id).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [b.id, b.coverUrl, b.hasCover]);
  return url;
}
