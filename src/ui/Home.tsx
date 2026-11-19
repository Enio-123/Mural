import { useEffect, useMemo, useState } from 'react';
import * as bsky from '../lib/bsky';
import * as lichess from '../lib/lichess';
import { errorText } from '../lib/api';
import { classics, gutenbergCover, library, sortedLibrary } from '../lib/books';
import { refreshNews, useNews } from '../lib/news';
import { setPrefs, usePrefs } from '../lib/prefs';
import { cached } from '../lib/store';
import { todayLabel } from '../lib/time';
import { promptInstall, useInstall } from '../lib/install';
import { useNav } from '../lib/nav';
import { Board } from './Board';
import { BookCover, ShelfBook } from './BookCover';
import { useCatalog, useOpenClassic } from './books-data';
import { NewsCard } from './NewsCard';
import { PostMini } from './Post';
import { ErrorBox, toast } from './common';
import { BrandMark, Icon } from './icons';
import { solved, useDailyPuzzle, usePlaying } from './chess-data';

const AGAIN_AFTER = 10 * 60_000;

function useHomePosts() {
  const sess = bsky.session.use();
  const [posts, setPosts] = useState<bsky.PostView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    const key = 'bsky-inicio:' + (sess?.did ?? 'publico');
    cached(
      key,
      AGAIN_AFTER,
      async () => {
        const page = sess ? await bsky.timeline() : await bsky.feed(bsky.DISCOVER);
        const items = page.feed.filter((i) => !i.reply && (i.post.record?.text || i.post.embed));
        return (items.length ? items : page.feed).slice(0, 12).map((i) => i.post);
      },
      { force: n > 0 },
    )
      .then((r) => alive && setPosts(r.data))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [sess?.did, n]);
  return { posts, error, retry: () => setN((x) => x + 1), logged: !!sess };
}

function ChessRow() {
  const nav = useNav();
  const me = lichess.auth.use();
  const daily = useDailyPuzzle();
  const { games } = usePlaying();
  const done = solved.use();
  const pz = daily.puzzle;
  const game = me ? (games.find((g) => g.isMyTurn) ?? games[0]) : undefined;
  const pzState = pz ? (done[pz.data.puzzle.id] === 'ok' ? 'Resolvido' : done[pz.data.puzzle.id] === 'ajuda' ? 'Com ajuda' : `${pz.data.puzzle.rating}`) : '';

  return (
    <section className="section" aria-labelledby="h-xadrez">
      <div className="section-head">
        <h2 id="h-xadrez">Xadrez</h2>
        <button onClick={() => nav.push({ name: 'xadrez' })}>
          Abrir <Icon name="next" />
        </button>
      </div>
      <div className="chess-tiles">
        <button className="tile" onClick={() => nav.push({ name: 'problema' })} aria-label="Problema do dia">
          <div className="tile-board">
            {pz ? (
              <Board fen={pz.start.fen} orientation={pz.start.color} lastMove={pz.start.lastMove} viewOnly coordinates={false} label="Posição do problema do dia" />
            ) : daily.error ? (
              <div className="tile-art" style={{ width: '100%', height: '100%' }}>
                <Icon name="bulb" />
              </div>
            ) : (
              <div className="skeleton" style={{ width: '100%', height: '100%' }} />
            )}
          </div>
          <div className="tile-cap">
            <b>Problema do dia</b>
            <span>{pzState}</span>
          </div>
        </button>

        {game ? (
          <button className="tile" onClick={() => nav.push({ name: 'partida', id: game.gameId })} aria-label="Continuar a partida">
            <div className="tile-board">
              <Board
                fen={game.fen}
                orientation={game.color}
                lastMove={game.lastMove && game.lastMove.length >= 4 ? [game.lastMove.slice(0, 2), game.lastMove.slice(2, 4)] : undefined}
                viewOnly
                coordinates={false}
                label="Sua partida em andamento"
              />
            </div>
            <div className="tile-cap">
              <b>{game.opponent.ai ? `Computador ${game.opponent.ai}` : (game.opponent.username ?? 'Partida')}</b>
              <span>{game.isMyTurn ? 'Sua vez' : 'Aguardando'}</span>
            </div>
          </button>
        ) : (
          <button className="tile" onClick={() => nav.push({ name: 'xadrez' })} aria-label="Jogar xadrez">
            <div className="tile-art">
              <Icon name="knight" />
            </div>
            <div className="tile-cap">
              <b>Jogar</b>
              <span>{me ? 'Computador' : 'Lichess'}</span>
            </div>
          </button>
        )}
      </div>
    </section>
  );
}

function BooksRow() {
  const nav = useNav();
  const books = sortedLibrary(library.use());
  const catalog = useCatalog();
  const { busy, open } = useOpenClassic();
  const picks = useMemo(() => (books.length < 4 && catalog.books ? classics(catalog.books, 8).filter((b) => !books.some((x) => x.id === 'g-' + b.id)) : []), [books, catalog.books]);
  const shown = books.slice(0, 8);

  return (
    <section className="section" aria-labelledby="h-livros">
      <div className="section-head">
        <h2 id="h-livros">Livros</h2>
        <button onClick={() => nav.push({ name: 'livros' })}>
          {books.length ? 'Estante' : 'Ver clássicos'} <Icon name="next" />
        </button>
      </div>
      <div className="row-scroll" aria-label="Seus livros" key={shown[0]?.id ?? 'vazia'}>
        {shown.map((b) => (
          <ShelfBook key={b.id} book={b} onClick={() => nav.push({ name: 'leitor', id: b.id })} />
        ))}
        {picks.slice(0, Math.max(0, 6 - shown.length)).map((b) => (
          <BookCover
            key={b.id}
            title={b.title}
            author={b.authors.join(', ')}
            src={gutenbergCover(b.id)}
            busy={busy === 'g-' + b.id}
            onClick={() => void open(b)}
          />
        ))}
        {!shown.length && !picks.length && !catalog.error && [0, 1, 2, 3].map((i) => <div key={i} className="cover"><div className="cover-img skeleton" /></div>)}
        <div className="cover add">
          <button className="cover-img" onClick={() => nav.push({ name: 'livros' })} aria-label="Adicionar livro">
            <Icon name="plus" />
          </button>
          <span className="cover-title">{books.length ? 'Mais livros' : 'Adicionar'}</span>
        </div>
      </div>
      {!books.length && picks.length > 0 && <p className="note" style={{ padding: '0 16px', margin: '2px 0 0' }}>Clássicos grátis do Projeto Gutenberg. Toque para baixar e ler.</p>}
    </section>
  );
}

function NewsRow() {
  const nav = useNav();
  const news = useNews();
  const list = news.state ? (news.state.forYou.length ? news.state.forYou : news.state.top) : [];
  return (
    <section className="section" aria-labelledby="h-noticias">
      <div className="section-head">
        <h2 id="h-noticias">Notícias</h2>
        <button onClick={() => nav.push({ name: 'noticias' })}>
          Ver todas <Icon name="next" />
        </button>
      </div>
      {news.error && !news.state ? (
        <div style={{ padding: '0 16px' }}>
          <ErrorBox message={news.error} onRetry={() => void refreshNews(true)} />
        </div>
      ) : (
        <div className="row-scroll" aria-label="Notícias para você">
          {list.slice(0, 12).map((s) => (
            <NewsCard key={s.id} s={s} />
          ))}
          {!news.state && [0, 1, 2].map((i) => <div key={i} className="ncard skeleton" />)}
          {news.state && list.length === 0 && <div className="empty-card">Nada novo agora.</div>}
        </div>
      )}
    </section>
  );
}

function BlueskyRow() {
  const nav = useNav();
  const { posts, error, retry, logged } = useHomePosts();
  return (
    <section className="section" aria-labelledby="h-bluesky">
      <div className="section-head">
        <h2 id="h-bluesky">Bluesky</h2>
        <button onClick={() => nav.push({ name: 'bluesky' })}>
          {logged ? 'Seguindo' : 'Descobrir'} <Icon name="next" />
        </button>
      </div>
      {error && !posts ? (
        <div style={{ padding: '0 16px' }}>
          <ErrorBox message={error} onRetry={retry} />
        </div>
      ) : (
        <div className="row-scroll" aria-label="Posts do Bluesky">
          {posts?.map((p) => <PostMini key={p.uri} post={p} />)}
          {!posts && [0, 1].map((i) => <div key={i} className="pcard skeleton" />)}
          {posts && posts.length === 0 && <div className="empty-card">Nada por aqui agora.</div>}
        </div>
      )}
    </section>
  );
}

function InstallCard() {
  const p = usePrefs();
  const { can, installed } = useInstall();
  if (!can || installed || p.installHidden) return null;
  return (
    <div className="install-card" style={{ maxWidth: 648, marginLeft: 'auto', marginRight: 'auto' }}>
      <p>Coloque o Mural na tela inicial do celular. Ele abre como um app, sem a barra do navegador.</p>
      <div className="btn-row">
        <button className="btn ghost" onClick={() => setPrefs({ installHidden: true })}>
          Agora não
        </button>
        <button
          className="btn primary"
          onClick={() =>
            void promptInstall().then((r) => {
              if (r === 'aceito') toast('Pronto, o Mural está na sua tela inicial.');
            })
          }
        >
          <Icon name="download" /> Instalar
        </button>
      </div>
    </div>
  );
}

export function Home() {
  const nav = useNav();
  const news = useNews();

  // voltou pro app depois de um tempo: busca notícias novas
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const at = news.state?.at ?? 0;
      if (Date.now() - at > AGAIN_AFTER) void refreshNews(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [news.state?.at]);

  return (
    <main>
      <header className="home-head">
        <div className="brand">
          <BrandMark className="brand-mark" />
          <div className="brand-text">
            <b>Mural</b>
            <span>{todayLabel()}</span>
          </div>
        </div>
        <button className="icon-btn" aria-label="Ajustes" onClick={() => nav.push({ name: 'ajustes' })}>
          <Icon name="settings" />
        </button>
      </header>
      <ChessRow />
      <BooksRow />
      <NewsRow />
      <BlueskyRow />
      <InstallCard />
      <p className="home-foot">
        {news.state ? `Notícias de ${new Date(news.state.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Buscando as notícias…'}
      </p>
    </main>
  );
}
