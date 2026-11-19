import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { dests, playUci, themeLabel, turnColor } from '../lib/chess';
import { li } from '../lib/lichess';
import type { DailyPuzzle } from '../lib/lichess';
import { errorText } from '../lib/api';
import { LICHESS } from '../config';
import { Board } from './Board';
import { TopBar, Spinner, ErrorBox, toast } from './common';
import { Icon } from './icons';
import { solved, toLoaded, useDailyPuzzle, type LoadedPuzzle } from './chess-data';

type Phase = 'jogar' | 'errou' | 'feito';

export function PuzzleScreen() {
  const daily = useDailyPuzzle();
  const [extra, setExtra] = useState<LoadedPuzzle | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const puzzle = extra ?? daily.puzzle;

  async function next() {
    setLoadingNext(true);
    try {
      const d = await li<DailyPuzzle>('/api/puzzle/next');
      setExtra(toLoaded(d));
    } catch (e) {
      toast(errorText(e) + ' Abrindo os problemas no site do Lichess.');
      window.open(`${LICHESS}/training`, '_blank', 'noopener');
    } finally {
      setLoadingNext(false);
    }
  }

  return (
    <>
      <TopBar title={extra ? 'Problema' : 'Problema do dia'} />
      {!puzzle && !daily.error && <Spinner />}
      {daily.error && !puzzle && (
        <div className="page">
          <ErrorBox message={daily.error} onRetry={daily.retry} />
        </div>
      )}
      {puzzle && <PuzzleBoard key={puzzle.data.puzzle.id} puzzle={puzzle} onNext={next} loadingNext={loadingNext} />}
    </>
  );
}

function PuzzleBoard({ puzzle, onNext, loadingNext }: { puzzle: LoadedPuzzle; onNext: () => void; loadingNext: boolean }) {
  const { data, start } = puzzle;
  const solution = data.puzzle.solution;
  const chess = useRef(new Chess(start.fen));
  const [fen, setFen] = useState(start.fen);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(start.lastMove);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>('jogar');
  const [helped, setHelped] = useState(false);
  const [marks, setMarks] = useState<Record<string, 'good' | 'bad'>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevResult = solved.get()[data.puzzle.id];

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const myColor = start.color;
  const sync = () => {
    setFen(chess.current.fen());
  };

  const finish = (withHelp: boolean) => {
    setPhase('feito');
    solved.set((s) => ({ ...s, [data.puzzle.id]: s[data.puzzle.id] === 'ok' ? 'ok' : withHelp ? 'ajuda' : 'ok' }));
  };

  const replyFrom = (idx: number) => {
    if (idx >= solution.length) {
      finish(helped);
      return;
    }
    timers.current.push(
      setTimeout(() => {
        const m = playUci(chess.current, solution[idx]);
        if (m) {
          setLastMove([m.from, m.to]);
          sync();
        }
        setStep(idx + 1);
        setMarks({});
        if (idx + 1 >= solution.length) finish(helped);
      }, 420),
    );
  };

  const onMove = (orig: string, dest: string, promo?: string) => {
    if (phase === 'feito') return;
    const uci = orig + dest + (promo ?? '');
    const expected = solution[step];
    const m = playUci(chess.current, uci);
    if (!m) {
      sync();
      return;
    }
    const sameMove = uci.slice(0, 4) === expected.slice(0, 4) && (expected.length < 5 || (promo ?? 'q') === expected[4]);
    const mate = chess.current.isCheckmate();
    if (!sameMove && !mate) {
      chess.current.undo();
      setHelped(true);
      setPhase('errou');
      setMarks({ [dest]: 'bad' });
      sync();
      timers.current.push(setTimeout(() => setMarks({}), 900));
      return;
    }
    setLastMove([m.from, m.to]);
    setMarks({ [dest]: 'good' });
    setPhase('jogar');
    sync();
    if (mate) {
      setStep(solution.length);
      finish(helped);
      return;
    }
    setStep(step + 1);
    replyFrom(step + 1);
  };

  const showSolution = () => {
    setHelped(true);
    let idx = step;
    const play = () => {
      if (idx >= solution.length) {
        finish(true);
        return;
      }
      const m = playUci(chess.current, solution[idx]);
      if (m) {
        setLastMove([m.from, m.to]);
        sync();
      }
      idx++;
      setStep(idx);
      timers.current.push(setTimeout(play, 650));
    };
    play();
  };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    chess.current = new Chess(start.fen);
    setFen(start.fen);
    setLastMove(start.lastMove);
    setStep(0);
    setPhase('jogar');
    setMarks({});
  };

  const isPromotion = (orig: string, dest: string) => {
    const piece = chess.current.get(orig as Square);
    return !!piece && piece.type === 'p' && (dest[1] === '8' || dest[1] === '1');
  };

  const myTurn = phase !== 'feito' && turnColor(chess.current) === myColor;
  const d = useMemo(() => (myTurn ? dests(chess.current) : new Map()), [fen, myTurn]);

  const line =
    phase === 'feito'
      ? { text: helped ? 'Resolvido com ajuda.' : 'Resolvido de primeira!', cls: 'good' }
      : phase === 'errou'
        ? { text: 'Não é esse lance. Tente outro.', cls: 'bad' }
        : { text: `Sua vez: jogue com as ${myColor === 'white' ? 'brancas' : 'pretas'}.`, cls: '' };

  return (
    <div className="game-wrap" style={{ paddingBottom: 40 }}>
      <div className={'status-line ' + line.cls} aria-live="polite">
        {line.text}
      </div>
      <Board
        fen={fen}
        orientation={myColor}
        turnColor={turnColor(chess.current)}
        lastMove={lastMove}
        check={chess.current.inCheck()}
        movableColor={myTurn ? myColor : undefined}
        dests={d}
        onMove={onMove}
        isPromotion={isPromotion}
        marks={marks}
        label="Tabuleiro do problema"
      />
      <div className="btn-row" style={{ marginTop: 14 }}>
        {phase !== 'feito' ? (
          <>
            <button className="btn ghost" onClick={showSolution}>
              <Icon name="eye" /> Ver solução
            </button>
            <button className="btn ghost" onClick={restart}>
              <Icon name="rotate" /> Recomeçar
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={restart}>
              <Icon name="rotate" /> De novo
            </button>
            <button className="btn primary" onClick={onNext} disabled={loadingNext}>
              {loadingNext ? 'Buscando…' : 'Outro problema'}
            </button>
          </>
        )}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="small muted">
          Rating {data.puzzle.rating}
          {data.puzzle.plays ? ` · ${data.puzzle.plays.toLocaleString('pt-BR')} pessoas tentaram` : ''}
          {prevResult ? ` · você já ${prevResult === 'ok' ? 'acertou' : 'fez com ajuda'}` : ''}
        </div>
        {phase === 'feito' && data.puzzle.themes.length > 0 && (
          <div className="chips wrap" style={{ marginTop: 10 }}>
            {data.puzzle.themes.map((t) => (
              <span key={t} className="tag">
                {themeLabel(t)}
              </span>
            ))}
          </div>
        )}
        <a className="link-btn" style={{ marginTop: 6 }} href={`${LICHESS}/training/${data.puzzle.id}`} target="_blank" rel="noopener noreferrer">
          Ver no Lichess <Icon name="external" />
        </a>
      </div>
    </div>
  );
}
