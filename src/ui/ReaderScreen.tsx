import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Book, Location, NavItem, Rendition } from 'epubjs';
import { bookFile, closeBook, library, updateBook } from '../lib/books';
import { ApiError, errorText } from '../lib/api';
import { idbGet, idbSet } from '../lib/store';
import { prefs, setPrefs, usePrefs, type BookTheme, type Prefs } from '../lib/prefs';
import { useNav } from '../lib/nav';
import { ErrorBox, Sheet, Spinner } from './common';
import { Icon } from './icons';

const LOOKS: Record<Exclude<BookTheme, 'auto'>, { bg: string; fg: string; link: string }> = {
  escuro: { bg: '#0d0f12', fg: '#d7dae0', link: '#8fb4ff' },
  claro: { bg: '#fbfaf7', fg: '#1b1d21', link: '#2459d6' },
  sepia: { bg: '#f2e8d5', fg: '#3a3024', link: '#8a4b12' },
};

function lookOf(p: Prefs) {
  const t = p.bookTheme === 'auto' ? (document.documentElement.dataset.theme === 'claro' ? 'claro' : 'escuro') : p.bookTheme;
  return LOOKS[t];
}

function applyLook(r: Rendition, p: Prefs) {
  const c = lookOf(p);
  r.themes.default({
    'html, body': { background: `${c.bg} !important` },
    body: {
      color: `${c.fg} !important`,
      'font-family': "'Noto Serif', 'Source Serif Pro', Georgia, serif !important",
      'line-height': '1.62 !important',
      'text-align': 'left',
      'hyphens': 'auto',
      '-webkit-hyphens': 'auto',
    },
    'p, li, div, span, h1, h2, h3, h4, h5, h6, blockquote, td, th, em, i, b, strong, small, sup, sub': { color: 'inherit !important' },
    a: { color: `${c.link} !important` },
    img: { 'max-width': '100% !important', height: 'auto !important' },
    'svg, image': { 'max-width': '100% !important' },
  });
  r.themes.fontSize(`${Math.round(p.bookScale * 100)}%`);
}

function flatToc(items: NavItem[], depth = 0, out: { item: NavItem; depth: number }[] = []) {
  for (const it of items) {
    out.push({ item: it, depth });
    if (it.subitems?.length) flatToc(it.subitems, depth + 1, out);
  }
  return out;
}

function samePath(a: string, b: string): boolean {
  const x = decodeURIComponent(a.split('#')[0]).replace(/^\.?\//, '');
  const y = decodeURIComponent(b.split('#')[0]).replace(/^\.?\//, '');
  return !!x && !!y && (x === y || x.endsWith('/' + y) || y.endsWith('/' + x));
}

interface Pos {
  pct?: number;
  page?: number;
  total?: number;
  href?: string;
  atStart?: boolean;
  atEnd?: boolean;
}

const SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.7];

export function ReaderScreen({ id }: { id: string }) {
  const nav = useNav();
  const p = usePrefs();
  const meta = library.use().find((b) => b.id === id);
  const host = useRef<HTMLDivElement>(null);
  const rend = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const [phase, setPhase] = useState<'abrindo' | 'pronto' | 'erro'>('abrindo');
  const [err, setErr] = useState('');
  const [bars, setBars] = useState(false);
  const [toc, setToc] = useState<{ item: NavItem; depth: number }[]>([]);
  const [sheet, setSheet] = useState<'indice' | 'texto' | null>(null);
  const [pos, setPos] = useState<Pos>({});
  const [hasLocations, setHasLocations] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const tocRef = useRef(toc);
  tocRef.current = toc;

  useEffect(() => {
    let alive = true;
    let book: Book | undefined;
    let generating: Promise<unknown> | null = null;
    setPhase('abrindo');
    const onRelocated = (l: Location) => {
      if (!alive || !l?.start) return;
      const b = bookRef.current;
      const pct = b && b.locations.length() > 0 ? l.start.percentage : undefined;
      const href = l.start.href;
      const chapter = tocRef.current.find((t) => samePath(t.item.href, href))?.item.label.trim();
      setPos({ pct, page: l.start.displayed?.page, total: l.start.displayed?.total, href, atStart: l.atStart, atEnd: l.atEnd });
      const patch: Parameters<typeof updateBook>[1] = { cfi: l.start.cfi, lastOpened: Date.now() };
      if (pct != null) patch.pct = l.atEnd ? 1 : pct;
      if (chapter) patch.chapter = chapter;
      updateBook(id, patch);
    };

    (async () => {
      const buf = await bookFile(id);
      if (!buf) throw new ApiError('livro-sumiu', 'O arquivo desse livro não está mais neste celular. Baixe ou abra de novo.');
      const { default: ePub } = await import('epubjs');
      if (!alive || !host.current) return;
      book = ePub(buf.slice(0));
      bookRef.current = book;
      const r = book.renderTo(host.current, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'none',
        allowScriptedContent: false,
      });
      rend.current = r;
      applyLook(r, prefs.get());
      r.on('relocated', onRelocated);
      void book.loaded.navigation.then((n) => alive && setToc(flatToc(n.toc ?? [])));
      const startAt = library.get().find((b) => b.id === id)?.cfi;
      try {
        await r.display(startAt || undefined);
      } catch {
        await r.display();
      }
      if (!alive) return;
      setPhase('pronto');
      updateBook(id, { lastOpened: Date.now() });

      // posições do livro todo, para mostrar a porcentagem (fica guardado depois da primeira vez)
      const saved = await idbGet<string>('loc:' + id);
      if (!alive) return;
      if (saved) book.locations.load(saved);
      else {
        generating = book.locations.generate(1600);
        await generating;
        if (!alive) return;
        void idbSet('loc:' + id, book.locations.save());
      }
      setHasLocations(true);
      const cur = r.currentLocation() as unknown as Location | undefined;
      if (cur?.start) onRelocated(r.location ?? cur);
    })().catch((e) => {
      if (!alive) return;
      setErr(e instanceof ApiError ? e.message : 'Não consegui abrir esse livro. O arquivo pode estar com defeito ou com DRM. ' + errorText(e));
      setPhase('erro');
    });

    return () => {
      alive = false;
      rend.current = null;
      bookRef.current = null;
      if (book) closeBook(book, generating);
    };
  }, [id, tries]);

  useEffect(() => {
    if (rend.current) applyLook(rend.current, p);
  }, [p.bookTheme, p.bookScale]);

  const next = () => void rend.current?.next();
  const prev = () => void rend.current?.prev();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  // toque: esquerda volta, direita avança, meio mostra os controles; deslizar também vira a página
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const onDown = (e: RPointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onUp = (e: RPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (dx < 0) next();
      else prev();
      setBars(false);
      return;
    }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const w = (e.currentTarget as HTMLElement).clientWidth;
    const x = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
    if (x < w * 0.3) {
      prev();
      setBars(false);
    } else if (x > w * 0.7) {
      next();
      setBars(false);
    } else setBars((b) => !b);
  };

  const c = lookOf(p);
  const pctShown = drag != null ? drag / 1000 : pos.pct;
  const chapter = toc.find((t) => pos.href && samePath(t.item.href, pos.href))?.item.label.trim();
  const title = meta?.title ?? 'Livro';

  const jump = (v: number) => {
    const b = bookRef.current;
    if (!b || !hasLocations) return;
    const cfi = b.locations.cfiFromPercentage(Math.min(0.999, Math.max(0, v / 1000)));
    if (cfi) void rend.current?.display(cfi);
  };

  return (
    <div className="reader" style={{ ['--reader-bg' as string]: c.bg, ['--reader-fg' as string]: c.fg }}>
      <div className="reader-view">
        <div className="epub-host" ref={host} />
        {phase === 'pronto' && (
          <div className="reader-tap" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (start.current = null)} aria-hidden="true" />
        )}
        {phase === 'abrindo' && (
          <div className="reader-state">
            <Spinner label="Abrindo o livro" />
          </div>
        )}
        {phase === 'erro' && (
          <div className="reader-state">
            <ErrorBox message={err} onRetry={() => setTries((t) => t + 1)}>
              <button className="btn ghost" onClick={nav.back}>
                Voltar
              </button>
            </ErrorBox>
          </div>
        )}
      </div>

      {phase === 'pronto' && !bars && (
        <div className="reader-foot" aria-hidden="true">
          {pos.pct != null ? `${Math.round(pos.pct * 100)}%` : pos.page && pos.total ? `${pos.page} de ${pos.total}` : ''}
        </div>
      )}

      <div className={'reader-bar top' + (bars ? '' : ' hidden')}>
        <div className="reader-top">
          <button className="icon-btn" aria-label="Voltar" onClick={nav.back}>
            <Icon name="back" />
          </button>
          <div className="reader-title">
            <b>{title}</b>
            {chapter && <span>{chapter}</span>}
          </div>
          <button className="icon-btn" aria-label="Capítulos" onClick={() => setSheet('indice')} disabled={!toc.length}>
            <Icon name="list" />
          </button>
          <button className="icon-btn" aria-label="Texto e cores" onClick={() => setSheet('texto')}>
            <Icon name="text" />
          </button>
        </div>
      </div>

      <div className={'reader-bar bottom' + (bars ? '' : ' hidden')}>
        <div className="reader-bottom">
          <input
            className="range"
            type="range"
            min={0}
            max={1000}
            step={1}
            disabled={!hasLocations}
            value={Math.round((pctShown ?? 0) * 1000)}
            aria-label="Posição no livro"
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={(e) => {
              jump(Number((e.target as HTMLInputElement).value));
              setDrag(null);
            }}
            onKeyUp={(e) => {
              jump(Number((e.target as HTMLInputElement).value));
              setDrag(null);
            }}
          />
          <div className="reader-pos">
            <span>{hasLocations ? `${Math.round((pctShown ?? 0) * 100)}% lido` : 'Calculando as páginas…'}</span>
            <span>{pos.page && pos.total ? `página ${pos.page} de ${pos.total} do capítulo` : ''}</span>
          </div>
          <div className="btn-row">
            <button className="btn ghost" onClick={prev} disabled={pos.atStart}>
              <Icon name="back" /> Anterior
            </button>
            <button className="btn ghost" onClick={next} disabled={pos.atEnd}>
              Próxima <Icon name="next" />
            </button>
          </div>
        </div>
      </div>

      {sheet === 'indice' && (
        <Sheet title="Capítulos" onClose={() => setSheet(null)}>
          <div className="toc">
            {toc.map(({ item, depth }) => (
              <button
                key={item.id + item.href}
                className={(depth ? 'toc-sub' : '') + (pos.href && samePath(item.href, pos.href) ? ' toc-here' : '')}
                style={depth > 1 ? { paddingLeft: 18 * depth } : undefined}
                onClick={() => {
                  setSheet(null);
                  setBars(false);
                  void rend.current?.display(item.href);
                }}
              >
                {item.label.trim() || 'Sem título'}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {sheet === 'texto' && (
        <Sheet title="Texto e cores" onClose={() => setSheet(null)}>
          <div className="field">
            <label>Tamanho da letra</label>
            <div className="size-row">
              <button
                className="icon-btn"
                aria-label="Letra menor"
                disabled={p.bookScale <= SCALES[0]}
                onClick={() => setPrefs({ bookScale: [...SCALES].reverse().find((s) => s < p.bookScale - 0.001) ?? SCALES[0] })}
              >
                <Icon name="minus" />
              </button>
              <span className="size-value">{Math.round(p.bookScale * 100)}%</span>
              <button
                className="icon-btn"
                aria-label="Letra maior"
                disabled={p.bookScale >= SCALES[SCALES.length - 1]}
                onClick={() => setPrefs({ bookScale: SCALES.find((s) => s > p.bookScale + 0.001) ?? SCALES[SCALES.length - 1] })}
              >
                <Icon name="plus" />
              </button>
            </div>
          </div>
          <div className="field">
            <label>Cor da página</label>
            <div className="seg">
              {(
                [
                  ['auto', 'Igual ao app'],
                  ['claro', 'Clara'],
                  ['sepia', 'Sépia'],
                  ['escuro', 'Escura'],
                ] as const
              ).map(([t, l]) => (
                <button key={t} aria-pressed={p.bookTheme === t} onClick={() => setPrefs({ bookTheme: t })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
