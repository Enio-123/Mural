import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import type { Color } from '../lib/chess';

export interface BoardProps {
  fen: string;
  orientation: Color;
  turnColor?: Color;
  lastMove?: [string, string];
  check?: boolean;
  movableColor?: Color;
  dests?: Map<string, string[]>;
  onMove?: (orig: string, dest: string, promotion?: string) => void;
  /** diz se o lance precisa escolher a peça da promoção */
  isPromotion?: (orig: string, dest: string) => boolean;
  viewOnly?: boolean;
  coordinates?: boolean;
  marks?: Record<string, 'good' | 'bad'>;
  label?: string;
}

const PROMO = ['queen', 'rook', 'bishop', 'knight'] as const;
const PROMO_LETTER: Record<(typeof PROMO)[number], string> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };
const PROMO_NAME: Record<(typeof PROMO)[number], string> = { queen: 'Dama', rook: 'Torre', bishop: 'Bispo', knight: 'Cavalo' };

export function Board(props: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [promo, setPromo] = useState<{ orig: string; dest: string } | null>(null);

  const config: Config = useMemo(() => {
    const custom = new Map<Key, string>();
    for (const [k, v] of Object.entries(props.marks ?? {})) custom.set(k as Key, v);
    return {
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      lastMove: props.lastMove as Key[] | undefined,
      check: props.check,
      viewOnly: !!props.viewOnly,
      coordinates: props.coordinates ?? !props.viewOnly,
      animation: { enabled: true, duration: 170 },
      highlight: { lastMove: true, check: true, custom },
      movable: {
        free: false,
        color: props.viewOnly ? undefined : props.movableColor,
        dests: (props.dests ?? new Map()) as Map<Key, Key[]>,
        showDests: true,
        events: {
          after: (orig: Key, dest: Key) => {
            const p = propsRef.current;
            if (p.isPromotion?.(orig, dest)) setPromo({ orig, dest });
            else p.onMove?.(orig, dest);
          },
        },
      },
      premovable: { enabled: false },
      draggable: { enabled: !props.viewOnly, showGhost: true },
      selectable: { enabled: !props.viewOnly },
      drawable: { enabled: false, visible: false },
      disableContextMenu: true,
      blockTouchScroll: !props.viewOnly,
    };
  }, [props.fen, props.orientation, props.turnColor, props.lastMove?.join(), props.check, props.movableColor, props.dests, props.viewOnly, props.coordinates, JSON.stringify(props.marks ?? {})]);

  const first = useRef(config);
  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, first.current);
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.set(config);
  }, [config]);

  const color = props.movableColor ?? 'white';
  return (
    <div className={'board-box' + (props.viewOnly ? ' view' : '')} aria-label={props.label ?? 'Tabuleiro'} role="img">
      <div ref={el} />
      {promo && (
        <div className="promo" onClick={() => { setPromo(null); api.current?.set(config); }}>
          <div className="promo-box cg-wrap" onClick={(e) => e.stopPropagation()}>
            {PROMO.map((p) => (
              <button
                key={p}
                aria-label={PROMO_NAME[p]}
                onClick={() => {
                  setPromo(null);
                  propsRef.current.onMove?.(promo.orig, promo.dest, PROMO_LETTER[p]);
                }}
              >
                {createElement('piece', { className: `${p} ${color}`, style: { position: 'static', display: 'block', width: '100%', height: '100%' } })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
