import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import * as lichess from '../lib/lichess';
import { errorText } from '../lib/api';
import { sanTokens, statusText, type Color } from '../lib/chess';
import { setPrefs, usePrefs } from '../lib/prefs';
import { useNav } from '../lib/nav';
import { Board } from './Board';
import { TopBar, Spinner, ErrorBox, toast } from './common';
import { Icon } from './icons';
import { solved, useDailyPuzzle, usePlaying } from './chess-data';

const CLOCKS = [
  { id: 'none', label: 'Sem relógio' },
  { id: '10+0', label: '10 min' },
  { id: '15+10', label: '15 + 10' },
  { id: '30+0', label: '30 min' },
] as const;

export function LichessLogin({ compact }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      {!compact && <h3>Entrar com o Lichess</h3>}
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        Pra jogar contra o computador e ver suas partidas. Você entra na página do próprio Lichess e o Mural nunca vê sua senha.
      </p>
      <button
        className="btn primary block"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          lichess.startLogin().catch((e) => {
            setBusy(false);
            toast(errorText(e));
          });
        }}
      >
        {busy ? 'Abrindo o Lichess…' : 'Entrar com o Lichess'}
      </button>
    </div>
  );
}

export function ChessScreen() {
  const nav = useNav();
  const me = lichess.auth.use();
  const p = usePrefs();
  const daily = useDailyPuzzle();
  const { games, reload } = usePlaying();
  const done = solved.use();
  const [acct, setAcct] = useState<lichess.Account | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!me) return;
    lichess.account().then(setAcct).catch(() => undefined);
  }, [me?.token]);

  const start = async () => {
    setStarting(true);
    try {
      const g = await lichess.challengeAi({ level: p.aiLevel, color: p.aiColor, clock: p.aiClock });
      reload();
      nav.push({ name: 'partida', id: g.id });
    } catch (e) {
      toast(errorText(e));
    } finally {
      setStarting(false);
    }
  };

  const perfs = acct?.perfs ?? {};
  const shown = (['rapid', 'blitz', 'puzzle', 'classical', 'correspondence'] as const).filter((k) => perfs[k]?.games).slice(0, 3);
  const perfName: Record<string, string> = { rapid: 'Rápida', blitz: 'Blitz', puzzle: 'Problemas', classical: 'Clássica', correspondence: 'Por correspondência' };
  const pz = daily.puzzle;

  return (
    <>
      <TopBar title="Xadrez" />
      <div className="page" style={{ paddingTop: 12 }}>
        {me && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{me.username}</h3>
              <a className="link-btn" href={`https://lichess.org/@/${me.username}`} target="_blank" rel="noopener noreferrer">
                Perfil <Icon name="external" />
              </a>
            </div>
            {shown.length > 0 && (
              <div className="stat-grid">
                {shown.map((k) => (
                  <div className="stat" key={k}>
                    <b>{perfs[k]!.rating}</b>
                    <span>{perfName[k]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {me && games.length > 0 && (
          <div className="card">
            <h3>Partidas em andamento</h3>
            {games.map((g) => (
              <button key={g.gameId} className="game-row" style={{ padding: '10px 0' }} onClick={() => nav.push({ name: 'partida', id: g.gameId })}>
                <span>
                  {g.opponent.ai ? `Computador nível ${g.opponent.ai}` : g.opponent.username ?? 'Adversário'}
                  <span className="muted small"> · {g.color === 'white' ? 'brancas' : 'pretas'}</span>
                </span>
                <span className={'result' + (g.isMyTurn ? ' win' : '')}>{g.isMyTurn ? 'Sua vez' : 'Aguardando'}</span>
              </button>
            ))}
          </div>
        )}

        {me ? (
          <div className="card">
            <h3>Jogar contra o computador</h3>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Nível do computador (1 fácil, 8 muito forte)</label>
              <div className="levels">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                  <button key={l} aria-pressed={p.aiLevel === l} onClick={() => setPrefs({ aiLevel: l })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Suas peças</label>
              <div className="seg">
                {(
                  [
                    ['white', 'Brancas'],
                    ['random', 'Sorteio'],
                    ['black', 'Pretas'],
                  ] as const
                ).map(([c, l]) => (
                  <button key={c} aria-pressed={p.aiColor === c} onClick={() => setPrefs({ aiColor: c })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Tempo</label>
              <div className="seg">
                {CLOCKS.map((c) => (
                  <button key={c.id} aria-pressed={p.aiClock === c.id} onClick={() => setPrefs({ aiClock: c.id })}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn primary block" onClick={start} disabled={starting}>
              {starting ? 'Criando a partida…' : 'Começar'}
            </button>
          </div>
        ) : (
          <LichessLogin />
        )}

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Problema do dia</h3>
            {pz && <span className="muted small">{done[pz.data.puzzle.id] === 'ok' ? 'Resolvido' : done[pz.data.puzzle.id] === 'ajuda' ? 'Feito com ajuda' : `Rating ${pz.data.puzzle.rating}`}</span>}
          </div>
          {daily.error && !pz && <ErrorBox message={daily.error} onRetry={daily.retry} />}
          {!pz && !daily.error && <Spinner />}
          {pz && (
            <button style={{ display: 'block', width: '100%' }} onClick={() => nav.push({ name: 'problema' })} aria-label="Abrir o problema do dia">
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Board fen={pz.start.fen} orientation={pz.start.color} lastMove={pz.start.lastMove} viewOnly coordinates={false} label="Posição do problema do dia" />
              </div>
              <span className="btn primary block" style={{ marginTop: 12 }}>
                Resolver
              </span>
            </button>
          )}
        </div>

        {me && (
          <div className="card">
            <button className="game-row" style={{ padding: 0, border: 0 }} onClick={() => nav.push({ name: 'partidas' })}>
              <b>Suas últimas partidas</b>
              <Icon name="next" width={20} height={20} />
            </button>
          </div>
        )}

        {me && (
          <button
            className="btn ghost block"
            style={{ marginTop: 18 }}
            onClick={() => {
              void lichess.logout();
              setAcct(null);
              toast('Você saiu do Lichess neste celular.');
            }}
          >
            <Icon name="logout" /> Sair do Lichess
          </button>
        )}
      </div>
    </>
  );
}

function resultFor(g: lichess.GameSummary, me: string): { label: string; cls: string; color: Color } {
  const myColor: Color = g.players.white.user?.name?.toLowerCase() === me ? 'white' : 'black';
  if (!g.winner) return { label: g.status === 'aborted' ? 'Cancelada' : 'Empate', cls: '', color: myColor };
  return g.winner === myColor ? { label: 'Vitória', cls: 'win', color: myColor } : { label: 'Derrota', cls: 'loss', color: myColor };
}

export function GamesScreen() {
  const nav = useNav();
  const me = lichess.auth.use();
  const [games, setGames] = useState<lichess.GameSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!me) return;
    setErr(null);
    lichess
      .recentGames(me.username)
      .then(setGames)
      .catch((e) => setErr(errorText(e)));
  }, [me?.username, n]);

  return (
    <>
      <TopBar title="Suas partidas" />
      <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 40 }}>
        {!me && (
          <div className="page">
            <LichessLogin />
          </div>
        )}
        {err && (
          <div className="page">
            <ErrorBox message={err} onRetry={() => setN((x) => x + 1)} />
          </div>
        )}
        {me && !games && !err && <Spinner />}
        {games && games.length === 0 && <p className="empty">Nenhuma partida ainda.</p>}
        {games?.map((g) => {
          const r = resultFor(g, me!.username.toLowerCase());
          const opp = r.color === 'white' ? g.players.black : g.players.white;
          const oppName = opp.aiLevel ? `Computador nível ${opp.aiLevel}` : opp.user?.name ?? 'Anônimo';
          return (
            <button key={g.id} className="game-row" onClick={() => nav.push({ name: 'replay', game: g })}>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block' }}>{oppName}</b>
                <span className="muted small">
                  {new Date(g.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} · {g.speed}
                  {g.opening?.name ? ` · ${g.opening.name}` : ''}
                </span>
              </span>
              <span className={'result ' + r.cls}>{r.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function ReplayScreen({ game }: { game: lichess.GameSummary }) {
  const me = lichess.auth.use();
  const r = resultFor(game, me?.username.toLowerCase() ?? '');
  const positions = useMemo(() => {
    const chess = new Chess();
    const out: { fen: string; last?: [string, string]; san?: string }[] = [{ fen: chess.fen() }];
    for (const san of sanTokens(game.moves ?? '')) {
      try {
        const m = chess.move(san);
        out.push({ fen: chess.fen(), last: [m.from, m.to], san: m.san });
      } catch {
        break;
      }
    }
    return out;
  }, [game.id]);
  const [i, setI] = useState(positions.length - 1);
  const cur = positions[i];
  const status = statusText(game.status, game.winner, r.color);

  return (
    <>
      <TopBar
        title="Rever partida"
        right={
          <a className="icon-btn" href={lichess.gameUrl(game.id)} target="_blank" rel="noopener noreferrer" aria-label="Abrir no Lichess">
            <Icon name="external" />
          </a>
        }
      />
      <div className="game-wrap" style={{ paddingBottom: 40 }}>
        <div className={'status-line ' + status.tone}>{status.text}</div>
        <Board fen={cur.fen} orientation={r.color} lastMove={cur.last} viewOnly coordinates label="Partida" />
        <div className="moves-nav">
          <button className="icon-btn" aria-label="Início" onClick={() => setI(0)} disabled={i === 0}>
            <Icon name="first" />
          </button>
          <button className="icon-btn" aria-label="Lance anterior" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
            <Icon name="back" />
          </button>
          <span className="muted small" style={{ alignSelf: 'center', minWidth: 90, textAlign: 'center' }}>
            {i === 0 ? 'Início' : `${Math.ceil(i / 2)}${i % 2 ? '.' : '...'} ${cur.san}`}
          </span>
          <button className="icon-btn" aria-label="Próximo lance" onClick={() => setI((x) => Math.min(positions.length - 1, x + 1))} disabled={i === positions.length - 1}>
            <Icon name="next" />
          </button>
          <button className="icon-btn" aria-label="Fim" onClick={() => setI(positions.length - 1)} disabled={i === positions.length - 1}>
            <Icon name="last" />
          </button>
        </div>
        {game.opening?.name && <p className="note" style={{ textAlign: 'center' }}>{game.opening.name}</p>}
      </div>
    </>
  );
}
