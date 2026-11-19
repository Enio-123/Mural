import { useEffect, useRef, useState } from 'react';
import { downloadGutenberg, loadCatalog, searchLibrary, type CatalogBook } from '../lib/books';
import { errorText } from '../lib/api';
import { useNav } from '../lib/nav';
import { toast } from './common';

/** Baixa um clássico (se ainda não estiver no celular) e abre no leitor. */
export function useOpenClassic(): { busy: string | null; open: (b: CatalogBook) => Promise<void> } {
  const nav = useNav();
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const open = async (b: CatalogBook) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('g-' + b.id);
    try {
      const meta = await downloadGutenberg(b);
      nav.push({ name: 'leitor', id: meta.id });
    } catch (e) {
      toast(errorText(e), 4000);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };
  return { busy, open };
}

export function useCatalog(): { books: CatalogBook[] | null; total: number | null; error: string | null; retry: () => void } {
  const [data, setData] = useState<{ books: CatalogBook[]; total: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    loadCatalog(n > 0)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [n]);
  return { books: data?.books ?? null, total: data?.total ?? null, error, retry: () => setN((x) => x + 1) };
}

/** Busca no acervo inteiro, com uma pausa enquanto a pessoa digita e cancelando a busca anterior. */
export function useLibrarySearch(
  q: string,
  lang: string,
  enabled: boolean,
): { books: CatalogBook[] | null; total: number | null; all: number | null; error: string | null; loading: boolean; retry: () => void } {
  const [state, setState] = useState<{ key: string; books: CatalogBook[] | null; total: number | null; all: number | null; error: string | null }>({
    key: '',
    books: null,
    total: null,
    all: null,
    error: null,
  });
  const [loading, setLoading] = useState(false);
  const [n, setN] = useState(0);
  const query = q.trim();
  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    const key = lang + '|' + query;
    setLoading(true);
    const t = setTimeout(
      () => {
        searchLibrary(query, lang, ctl.signal)
          .then((r) => {
            if (ctl.signal.aborted) return;
            setState({ key, books: r.books, total: r.total, all: r.all, error: null });
            setLoading(false);
          })
          .catch((e) => {
            if (ctl.signal.aborted) return;
            setState((s) => ({ ...s, key, error: errorText(e) }));
            setLoading(false);
          });
      },
      query ? 350 : 0,
    );
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query, lang, enabled, n]);
  // ao trocar de idioma, a lista antiga some; ao digitar, ela fica até chegar a nova
  const sameLang = state.key.startsWith(lang + '|');
  return {
    books: sameLang ? state.books : null,
    total: sameLang ? state.total : null,
    all: state.all,
    error: sameLang ? state.error : null,
    loading,
    retry: () => setN((x) => x + 1),
  };
}
