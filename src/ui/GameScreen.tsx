import { useEffect, useMemo, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import * as lichess from '../lib/lichess';
import { dests, fromMoves, statusText, turnColor, type Color } from '../lib/chess';
import { errorText } from '../lib/api';
import { clockText } from '../lib/time';
import { Board } from './Board';
import { TopBar, Spinner, ErrorBox, Sheet, toast } from './common';
import { Icon } from './icons';

interface Side {
  id?: string;
  name?: string;
  rating?: number;
  aiLevel?: number;
}

interface GameData {
  initialFen: string;
  white: Side;
  black: Side;
  moves: string;
  wtime?: number;
  btime?: number;
  status: string;
  winner?: Color;
  stamp: number;
}

const UNLIMITED = 1e9;

function sideName(s: Side): string {
  if (s.aiLevel) return `Computador nível ${s.aiLevel}`;
  return s.name ?? s.id ?? 'Adversário';
}

export function GameScreen({ id }: { id: string }) {
  const me = lichess.auth.use();
  const [g, setG] = useState<GameData | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [, tick] = useState(0);
  const retries = useRef(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let stopped = false;
    const onEvent = (e: any) => {
      if (e.type === 'gameFull') {
        retries.current = 0;
        setG({
          initialFen: e.initialFen,
          white: { id: e.white?.id, name: e.white?.name, rating: e.white?.rating, aiLevel: e.white?.aiLevel },
          black: { id: e.black?.id, name: e.black?.name, rating: e.black?.rating, aiLevel: e.black?.aiLevel },
          moves: e.state.moves ?? '',
          wtime: e.state.wtime,
          btime: e.state.btime,
          status: e.state.status,
          winner: e.state.winner,
          stamp: Date.now(),
        });
        setPending(null);
      } else if (e.type === 'gameState') {
        setG((cur) => (cur ? { ...cur, moves: e.moves ?? '', wtime: e.wtime, btime: e.btime, status: e.status, winner: e.winner, stamp: Date.now() } : cur));
        setPending(null);
      }
    };
    const run = async () => {
      while (!stopped) {
        try {
          await lichess.stream(`/api/board/game/stream/${id}`, onEvent, ctrl.signal);
          setErr(null);
        } catch (e) {
          setErr(errorText(e));
        }
        if (stopped) return;
        retries.current++;
        if (retries.current > 6) return;
        await new Promise((r) => setTimeout(r, Math.min(15000, 1500 * retries.current)));
      }
    };
    void run();
    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, [id]);

  const playing = g ? g.status === 'started' || g.status === 'created' : false;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [playing]);

  const myId = me?.username.toLowerCase();
  const myColor: Color = g ? (g.white.id === myId ? 'white' : g.black.id === myId ? 'black' : g.white.aiLevel ? 'black' : 'white') : 'white';
  const moves = pending ?? g?.moves ?? '';
  const { chess, last } = useMemo(() => fromMoves(g?.initialFen, moves), [g?.initialFen, moves]);
  const fen = chess.fen();
  const turn = turnColor(chess);
  const myTurn = playing && turn === myColor && pending === null;
  const d = useMemo(() => (myTurn ? dests(chess) : new Map()), [fen, myTurn]);
  const plies = moves.split(' ').filter(Boolean).length;

  const onMove = (orig: string, dest: string, promo?: string) => {
    if (!g) return;
    const uci = orig + dest + (promo ?? '');
    const next = (g.moves ? g.moves + ' ' : '') + uci;
    setPending(next);
    lichess.move(id, uci).catch((e) => {
      setPending(null);
      toast(errorText(e));
    });
  };

  const isPromotion = (orig: string, dest: string) => {
    const p = chess.get(orig as Square);
    return !!p && p.type === 'p' && (dest[1] === '8' || dest[1] === '1');
  };

  const clockFor = (c: Color) => {
    if (!g) return null;
    const base = c === 'white' ? g.wtime : g.btime;
    if (base == null || base > UNLIMITED) return null;
    const running = playing && plies >= 2 && turn === c;
    const left = running ? base - (Date.now() - g.stamp) : base;
    return { text: clockText(left), running, low: left < 20_000 };
  };

  const top: Color = myColor === 'white' ? 'black' : 'white';
  const topSide = g ? (top === 'white' ? g.white : g.black) : null;
  const botSide = g ? (myColor === 'white' ? g.white : g.black) : null;
  const topClock = clockFor(top);
  const botClock = clockFor(myColor);
  const result = g && !playing ? statusText(g.status, g.winner, myColor) : null;

  return (
    <>
      <TopBar
        title="Partida"
        right={
          <a className="icon-btn" href={lichess.gameUrl(id)} target="_blank" rel="noopener noreferrer" aria-label="Abrir no Lichess">
            <Icon name="external" />
          </a>
        }
      />
      {!g && !err && <Spinner label="Conectando à partida" />}
      {!g && err && (
        <div className="page">
          <ErrorBox message={err} />
        </div>
      )}
      {g && topSide && botSide && (
        <div className="game-wrap" style={{ paddingBottom: 40 }}>
          <div className="player">
            <b>{sideName(topSide)}</b>
            {topClock && <span className={'clock' + (topClock.running ? ' running' : '') + (topClock.low && topClock.running ? ' low' : '')}>{topClock.text}</span>}
          </div>
          <Board
            fen={fen}
            orientation={myColor}
            turnColor={turn}
            lastMove={last ? [last.from, last.to] : undefined}
            check={chess.inCheck()}
            movableColor={myTurn ? myColor : undefined}
            dests={d}
            onMove={onMove}
            isPromotion={isPromotion}
            label="Tabuleiro da partida"
          />
          <div className="player">
            <b>Você</b>
            {botClock && <span className={'clock' + (botClock.running ? ' running' : '') + (botClock.low && botClock.running ? ' low' : '')}>{botClock.text}</span>}
          </div>
          <div className={'status-line ' + (result?.tone ?? '')} aria-live="polite">
            {result ? result.text : myTurn ? 'Sua vez.' : pending ? 'Enviando lance…' : 'Vez do adversário…'}
          </div>
          {err && <p className="note">Conexão instável: {err}</p>}
          {playing ? (
            <div className="btn-row">
              {plies < 2 ? (
                <button className="btn ghost" onClick={() => lichess.abort(id).catch((e) => toast(errorText(e)))}>
                  <Icon name="stop" /> Cancelar partida
                </button>
              ) : (
                <button className="btn ghost danger" onClick={() => setConfirm(true)}>
                  <Icon name="flag" /> Desistir
                </button>
              )}
            </div>
          ) : (
            <a className="btn ghost block" href={lichess.gameUrl(id)} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> Ver a análise no Lichess
            </a>
          )}
        </div>
      )}
      {confirm && (
        <Sheet title="Desistir desta partida?" onClose={() => setConfirm(false)}>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Continuar jogando
            </button>
            <button
              className="btn primary"
              onClick={() => {
                setConfirm(false);
                lichess.resign(id).catch((e) => toast(errorText(e)));
              }}
            >
              Desistir
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
