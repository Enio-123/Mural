import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { NavProvider, useNav, type Screen } from './lib/nav';
import { applyTheme, prefs, usePrefs } from './lib/prefs';
import { finishLogin } from './lib/lichess';
import { errorText } from './lib/api';
import { Home } from './ui/Home';
import { Onboarding } from './ui/Onboarding';
import { Splash } from './ui/Splash';
import { ErrorBox, LightboxHost, Spinner, ToastHost, toast } from './ui/common';

const RELOAD_FLAG = 'mural:recarregou';

/** Carrega a tela só quando precisa. Se o app foi atualizado e o pedaço antigo sumiu, recarrega uma vez. */
function page<P extends object>(load: () => Promise<ComponentType<P>>) {
  return lazy(async () => {
    try {
      const C = await load();
      sessionStorage.removeItem(RELOAD_FLAG);
      return { default: C };
    } catch (e) {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        location.reload();
        await new Promise(() => undefined);
      }
      throw e;
    }
  });
}

const NewsScreen = page(() => import('./ui/NewsScreen').then((m) => m.NewsScreen));
const ArticleScreen = page(() => import('./ui/ArticleScreen').then((m) => m.ArticleScreen));
const BlueskyScreen = page(() => import('./ui/BlueskyScreen').then((m) => m.BlueskyScreen));
const ThreadScreen = page(() => import('./ui/BlueskyScreen').then((m) => m.ThreadScreen));
const ChessScreen = page(() => import('./ui/ChessScreen').then((m) => m.ChessScreen));
const GamesScreen = page(() => import('./ui/ChessScreen').then((m) => m.GamesScreen));
const ReplayScreen = page(() => import('./ui/ChessScreen').then((m) => m.ReplayScreen));
const PuzzleScreen = page(() => import('./ui/PuzzleScreen').then((m) => m.PuzzleScreen));
const GameScreen = page(() => import('./ui/GameScreen').then((m) => m.GameScreen));
const BooksScreen = page(() => import('./ui/BooksScreen').then((m) => m.BooksScreen));
const ReaderScreen = page(() => import('./ui/ReaderScreen').then((m) => m.ReaderScreen));
const SettingsScreen = page(() => import('./ui/SettingsScreen').then((m) => m.SettingsScreen));

function render(s: Screen): ReactNode {
  switch (s.name) {
    case 'noticias':
      return <NewsScreen initialTag={s.tag} />;
    case 'artigo':
      return <ArticleScreen story={s.story} tags={s.tags} />;
    case 'bluesky':
      return <BlueskyScreen />;
    case 'post':
      return <ThreadScreen uri={s.uri} post={s.post} />;
    case 'xadrez':
      return <ChessScreen />;
    case 'problema':
      return <PuzzleScreen />;
    case 'partida':
      return <GameScreen id={s.id} />;
    case 'partidas':
      return <GamesScreen />;
    case 'replay':
      return <ReplayScreen game={s.game} />;
    case 'livros':
      return <BooksScreen />;
    case 'leitor':
      return <ReaderScreen id={s.id} />;
    case 'ajustes':
      return <SettingsScreen />;
  }
}

class Guard extends Component<{ children: ReactNode; onBack?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error('tela', e);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen-error">
        <ErrorBox message="Essa tela travou. Volte e tente de novo." onRetry={() => this.setState({ failed: false })}>
          {this.props.onBack && (
            <button className="btn ghost" onClick={this.props.onBack}>
              Voltar
            </button>
          )}
        </ErrorBox>
      </div>
    );
  }
}

function Shell() {
  const nav = useNav();
  const p = usePrefs();
  const depth = nav.stack.length;

  useEffect(() => applyTheme(p), [p.theme, p.textScale, p.readScale]);

  useEffect(() => {
    if (p.theme !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const f = () => applyTheme(prefs.get());
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [p.theme]);

  // volta do login do Lichess
  useEffect(() => {
    finishLogin()
      .then((r) => {
        if (r === 'ok') {
          toast('Lichess conectado.');
          if (prefs.get().onboarded) nav.push({ name: 'xadrez' });
        }
      })
      .catch((e) => toast(errorText(e), 4000));
  }, []);

  return (
    <>
      <div className="screen" inert={depth > 0} aria-hidden={depth > 0 || undefined}>
        <Guard>{p.onboarded ? <Home /> : <Onboarding />}</Guard>
      </div>
      {nav.stack.map((s, i) => (
        <div key={i + ':' + s.name} className="screen enter" inert={i < depth - 1} aria-hidden={i < depth - 1 || undefined}>
          <Guard onBack={nav.back}>
            <Suspense fallback={<Spinner />}>{render(s)}</Suspense>
          </Guard>
        </div>
      ))}
    </>
  );
}

export function App() {
  const [splash, setSplash] = useState(() => prefs.get().splash && !new URLSearchParams(location.search).has('code'));
  return (
    <NavProvider>
      <Shell />
      <ToastHost />
      <LightboxHost />
      {splash && <Splash onDone={() => setSplash(false)} />}
    </NavProvider>
  );
}
