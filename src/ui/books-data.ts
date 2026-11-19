import { useEffect, useRef, useState } from 'react';
import { downloadGutenberg, loadCatalog, type CatalogBook } from '../lib/books';
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

export function useCatalog(): { books: CatalogBook[] | null; error: string | null; retry: () => void } {
  const [books, setBooks] = useState<CatalogBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    loadCatalog(n > 0)
      .then((b) => alive && setBooks(b))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [n]);
  return { books, error, retry: () => setN((x) => x + 1) };
}

