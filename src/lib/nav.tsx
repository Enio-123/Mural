import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NewsItem } from './news';
import type { PostView } from './bsky';
import type { GameSummary } from './lichess';

export type Screen =
  | { name: 'noticias'; tag?: string }
  | { name: 'artigo'; story: NewsItem; tags?: string[] }
  | { name: 'bluesky' }
  | { name: 'post'; uri: string; post?: PostView }
  | { name: 'xadrez' }
  | { name: 'problema' }
  | { name: 'partida'; id: string }
  | { name: 'partidas' }
  | { name: 'replay'; game: GameSummary }
  | { name: 'livros' }
  | { name: 'leitor'; id: string }
  | { name: 'ajustes' };

interface Nav {
  stack: Screen[];
  push(s: Screen): void;
  back(): void;
  replaceTop(s: Screen): void;
}

const Ctx = createContext<Nav | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Screen[]>([]);
  const ref = useRef(stack);
  ref.current = stack;

  useEffect(() => {
    if (typeof history.state?.mural !== 'number' || history.state.mural !== 0) history.replaceState({ mural: 0 }, '');
    const onPop = (e: PopStateEvent) => {
      const depth = typeof e.state?.mural === 'number' ? e.state.mural : 0;
      setStack((s) => (depth < s.length ? s.slice(0, depth) : s));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((s: Screen) => {
    const next = [...ref.current, s];
    history.pushState({ mural: next.length }, '');
    ref.current = next;
    setStack(next);
  }, []);

  const back = useCallback(() => {
    if (ref.current.length) history.back();
  }, []);

  const replaceTop = useCallback((s: Screen) => {
    setStack((cur) => (cur.length ? [...cur.slice(0, -1), s] : [s]));
  }, []);

  const value = useMemo(() => ({ stack, push, back, replaceTop }), [stack, push, back, replaceTop]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): Nav {
  const v = useContext(Ctx);
  if (!v) throw new Error('NavProvider ausente');
  return v;
}
