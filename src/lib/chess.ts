import { Chess, type Move, type Square } from 'chess.js';

export type Color = 'white' | 'black';

export function dests(chess: Chess): Map<Square, Square[]> {
  const out = new Map<Square, Square[]>();
  for (const m of chess.moves({ verbose: true }) as Move[]) {
    const list = out.get(m.from) ?? [];
    list.push(m.to);
    out.set(m.from, list);
  }
  return out;
}

export function turnColor(chess: Chess): Color {
  return chess.turn() === 'w' ? 'white' : 'black';
}

export function isLegalUci(chess: Chess, uci: string): boolean {
  if (!uci || uci.length < 4) return false;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci[4];
  return (chess.moves({ verbose: true }) as Move[]).some((m) => m.from === from && m.to === to && (!promo || m.promotion === promo));
}

export function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
  } catch {
    return null;
  }
}

export function sanTokens(pgn: string): string[] {
  return pgn
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
    .map((t) => t.replace(/^\d+\.+/, ''))
    .filter(Boolean);
}

export interface PuzzleStart {
  fen: string;
  lastMove?: [Square, Square];
  color: Color;
}

function replay(sans: string[], plies: number): { chess: Chess; last?: Move } | null {
  const chess = new Chess();
  let last: Move | undefined;
  for (let i = 0; i < plies; i++) {
    try {
      last = chess.move(sans[i]);
    } catch {
      return null;
    }
  }
  return { chess, last };
}

/**
 * Posição inicial do problema do Lichess: o PGN traz a partida até o lance do adversário,
 * e o primeiro lance da solução é o seu. Confere se esse lance é legal antes de aceitar.
 */
export function puzzleStart(pgn: string, initialPly: number, solution: string[]): PuzzleStart {
  const sans = sanTokens(pgn);
  const tries = [Math.min(sans.length, initialPly + 1), initialPly, sans.length].filter((n, i, a) => n >= 0 && a.indexOf(n) === i);
  for (const plies of tries) {
    const r = replay(sans, plies);
    if (r && isLegalUci(r.chess, solution[0])) {
      return { fen: r.chess.fen(), lastMove: r.last ? [r.last.from, r.last.to] : undefined, color: turnColor(r.chess) };
    }
  }
  throw new Error('Não consegui montar a posição do problema.');
}

/** Aplica os lances (em UCI, separados por espaço) a partir de uma posição. */
export function fromMoves(initialFen: string | undefined, moves: string): { chess: Chess; last?: Move } {
  const chess = initialFen && initialFen !== 'startpos' ? new Chess(initialFen) : new Chess();
  let last: Move | undefined;
  for (const uci of moves.split(' ').filter(Boolean)) {
    const m = playUci(chess, uci);
    if (!m) break;
    last = m;
  }
  return { chess, last };
}

const THEMES: Record<string, string> = {
  mate: 'Mate',
  mateIn1: 'Mate em 1',
  mateIn2: 'Mate em 2',
  mateIn3: 'Mate em 3',
  mateIn4: 'Mate em 4',
  mateIn5: 'Mate em 5 ou mais',
  fork: 'Garfo',
  pin: 'Cravada',
  skewer: 'Espeto',
  discoveredAttack: 'Ataque descoberto',
  doubleCheck: 'Xeque duplo',
  sacrifice: 'Sacrifício',
  deflection: 'Desvio',
  attraction: 'Atração',
  interference: 'Interferência',
  intermezzo: 'Lance intermediário',
  hangingPiece: 'Peça solta',
  trappedPiece: 'Peça presa',
  promotion: 'Promoção',
  underPromotion: 'Subpromoção',
  advancedPawn: 'Peão avançado',
  endgame: 'Final',
  middlegame: 'Meio-jogo',
  opening: 'Abertura',
  short: 'Curto',
  long: 'Longo',
  veryLong: 'Muito longo',
  oneMove: 'Um lance',
  crushing: 'Esmagador',
  advantage: 'Vantagem',
  equality: 'Igualdade',
  defensiveMove: 'Defesa',
  quietMove: 'Lance silencioso',
  xRayAttack: 'Raio X',
  zugzwang: 'Zugzwang',
  kingsideAttack: 'Ataque na ala do rei',
  queensideAttack: 'Ataque na ala da dama',
  backRankMate: 'Mate na última fileira',
  smotheredMate: 'Mate sufocado',
  rookEndgame: 'Final de torres',
  pawnEndgame: 'Final de peões',
  queenEndgame: 'Final de damas',
  bishopEndgame: 'Final de bispos',
  knightEndgame: 'Final de cavalos',
  capturingDefender: 'Captura do defensor',
  clearance: 'Liberação',
  exposedKing: 'Rei exposto',
  master: 'Partida de mestre',
};

export function themeLabel(t: string): string {
  return THEMES[t] ?? t.replace(/([A-Z])/g, ' $1').toLowerCase();
}

export function statusText(status: string, winner: Color | undefined, me: Color | undefined): { text: string; tone: 'good' | 'bad' | '' } {
  const reasons: Record<string, string> = {
    mate: 'xeque-mate',
    resign: 'desistência',
    outoftime: 'tempo esgotado',
    timeout: 'abandono',
    stalemate: 'afogamento',
    draw: 'empate',
    aborted: 'partida cancelada',
    noStart: 'partida não começou',
    cheat: 'trapaça',
    variantEnd: 'fim da variante',
  };
  const why = reasons[status] ?? status;
  if (status === 'aborted' || status === 'noStart') return { text: 'Partida cancelada', tone: '' };
  if (!winner) return { text: `Empate (${why})`, tone: '' };
  if (!me) return { text: `${winner === 'white' ? 'Brancas' : 'Pretas'} venceram por ${why}`, tone: '' };
  return winner === me ? { text: `Você venceu por ${why}`, tone: 'good' } : { text: `Você perdeu por ${why}`, tone: 'bad' };
}
