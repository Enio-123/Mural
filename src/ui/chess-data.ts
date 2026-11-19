import { useEffect, useState } from 'react';
import { errorText } from '../lib/api';
import { cached, persisted } from '../lib/store';
import * as lichess from '../lib/lichess';
import { puzzleStart, type PuzzleStart } from '../lib/chess';

export const solved = persisted<Record<string, 'ok' | 'ajuda'>>('problemas', {});

export interface LoadedPuzzle {
  data: lichess.DailyPuzzle;
  start: PuzzleStart;
}

export function toLoaded(data: lichess.DailyPuzzle): LoadedPuzzle {
  return { data, start: puzzleStart(data.game.pgn, data.puzzle.initialPly, data.puzzle.solution) };
}

export function useDailyPuzzle(): { puzzle: LoadedPuzzle | null; error: string | null; retry: () => void } {
  const [puzzle, setPuzzle] = useState<LoadedPuzzle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    cached('lichess-diario', 2 * 3_600_000, lichess.dailyPuzzle, { force: n > 0 })
      .then((r) => alive && setPuzzle(toLoaded(r.data)))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [n]);
  return { puzzle, error, retry: () => setN((x) => x + 1) };
}

export function usePlaying(): { games: lichess.Playing[]; loaded: boolean; reload: () => void } {
  const a = lichess.auth.use();
  const [games, setGames] = useState<lichess.Playing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!a) {
      setGames([]);
      setLoaded(true);
      return;
    }
    let alive = true;
    lichess
      .playing()
      .then((r) => alive && setGames(r.nowPlaying ?? []))
      .catch(() => alive && setGames([]))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [a?.token, n]);
  return { games, loaded, reload: () => setN((x) => x + 1) };
}
