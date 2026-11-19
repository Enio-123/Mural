import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as bsky from '../lib/bsky';
import { errorText } from '../lib/api';
import { findInterest } from '../lib/interests';
import { usePrefs } from '../lib/prefs';
import { TopBar, Spinner, ErrorBox, Sheet, toast } from './common';
import { PostCard } from './Post';
import { Icon } from './icons';

type Tab = { id: string; label: string; load: (cursor?: string) => Promise<bsky.FeedPage> };

export function BskyLoginSheet({ onClose }: { onClose: () => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet title="Entrar no Bluesky" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const s = await bsky.login(id, pw);
            toast(`Conectado como @${s.handle}`);
            onClose();
          } catch (ex) {
            setErr(errorText(ex));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="bsky-id">Seu usuário</label>
          <input id="bsky-id" className="input" autoComplete="username" autoCapitalize="none" placeholder="voce.bsky.social" value={id} onChange={(e) => setId(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="bsky-pw">Senha de app</label>
          <input id="bsky-pw" className="input" type="password" autoComplete="current-password" placeholder="xxxx-xxxx-xxxx-xxxx" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </div>
        <p className="note" style={{ marginTop: -4, marginBottom: 14 }}>
          Use uma senha de app, não a sua senha normal. Ela é criada no Bluesky em Configurações, Privacidade e segurança, Senhas de app (
          <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer">
            abrir
          </a>
          ). Ela fica só neste celular e você pode apagar quando quiser.
        </p>
        {err && <p style={{ color: 'var(--bad)', margin: '0 0 12px' }}>{err}</p>}
        <button className="btn primary block" disabled={busy || !id || !pw}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </Sheet>
  );
}

export function BlueskyScreen() {
  const p = usePrefs();
  const sess = bsky.session.use();
  const [pinned, setPinned] = useState<bsky.SavedFeed[]>([]);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!sess) {
      setPinned([]);
      return;
    }
    bsky.pinnedFeeds().then(setPinned).catch(() => setPinned([]));
  }, [sess?.did]);

  const tabs: Tab[] = useMemo(() => {
    const t: Tab[] = [];
    if (sess) t.push({ id: 'seguindo', label: 'Seguindo', load: (c) => bsky.timeline(c) });
    t.push({ id: 'descobrir', label: 'Descobrir', load: (c) => bsky.feed(bsky.DISCOVER, c) });
    for (const f of pinned) t.push({ id: f.uri, label: f.name, load: (c) => bsky.feed(f.uri, c) });
    for (const id of p.interests) {
      const i = findInterest(id, p.custom);
      if (i?.bsky) t.push({ id: 'q:' + i.id, label: i.label, load: (c) => bsky.search(i.bsky!, c) });
    }
    return t;
  }, [sess?.did, pinned, p.interests, p.custom]);

  const [tabId, setTabId] = useState(tabs[0].id);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];

  return (
    <>
      <TopBar
        title="Bluesky"
        lined={false}
        right={
          !sess ? (
            <button className="link-btn" onClick={() => setShowLogin(true)}>
              Entrar
            </button>
          ) : undefined
        }
      />
      <div className="chips" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} className="chip" role="tab" aria-pressed={t.id === tab.id} aria-selected={t.id === tab.id} onClick={() => setTabId(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {!sess && tab.id === 'descobrir' && (
          <div className="empty-card" style={{ marginBottom: 8 }}>
            Entrando com a sua conta, aparece aqui o que as pessoas que você segue postam.
            <button className="btn ghost" onClick={() => setShowLogin(true)}>
              Entrar no Bluesky
            </button>
          </div>
        )}
        <FeedList key={tab.id} load={tab.load} />
      </div>
      {showLogin && <BskyLoginSheet onClose={() => setShowLogin(false)} />}
    </>
  );
}

function FeedList({ load }: { load: (cursor?: string) => Promise<bsky.FeedPage> }) {
  const [items, setItems] = useState<bsky.FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const more = useCallback(
    async (reset = false) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setErr(null);
      try {
        const page = await load(reset ? undefined : cursor);
        setItems((cur) => {
          const base = reset ? [] : cur;
          const seen = new Set(base.map((i) => i.post.uri + (i.reason?.by?.did ?? '')));
          return [...base, ...page.feed.filter((i) => !seen.has(i.post.uri + (i.reason?.by?.did ?? '')))];
        });
        setCursor(page.cursor);
        setDone(!page.cursor || page.feed.length === 0);
      } catch (e) {
        setErr(errorText(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [load, cursor],
  );

  useEffect(() => {
    void more(true);
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && !busyRef.current && items.length > 0 && void more(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, done, items.length]);

  return (
    <div className="list">
      {items.map((it) => (
        <PostCard key={it.post.uri + (it.reason?.by?.did ?? '')} item={it} />
      ))}
      {err && (
        <div style={{ padding: 16 }}>
          <ErrorBox message={err} onRetry={() => void more(items.length === 0)} />
        </div>
      )}
      {busy && <Spinner />}
      {!busy && !err && items.length === 0 && done && <p className="empty">Nada por aqui agora.</p>}
      <div ref={sentinel} style={{ height: 1 }} />
    </div>
  );
}

export function ThreadScreen({ uri, post }: { uri: string; post?: bsky.PostView }) {
  const [node, setNode] = useState<bsky.ThreadNode | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setErr(null);
    bsky
      .thread(uri)
      .then((n) => alive && setNode(n))
      .catch((e) => alive && setErr(errorText(e)));
    return () => {
      alive = false;
    };
  }, [uri, tries]);

  const parents: bsky.PostView[] = [];
  let cur = node?.parent;
  while (cur?.post) {
    parents.unshift(cur.post);
    cur = cur.parent;
  }
  const main = node?.post ?? post;
  const replies = (node?.replies ?? []).filter((r) => r.post).slice(0, 60);

  return (
    <>
      <TopBar
        title="Post"
        right={
          main ? (
            <a className="icon-btn" href={bsky.postUrl(main)} target="_blank" rel="noopener noreferrer" aria-label="Abrir no Bluesky">
              <Icon name="external" />
            </a>
          ) : undefined
        }
      />
      <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 40 }}>
        {parents.map((p) => (
          <div key={p.uri} className="thread-parent">
            <PostCard post={p} />
          </div>
        ))}
        {main && (
          <div className="thread-main">
            <PostCard post={main} onOpen={false} />
          </div>
        )}
        {err && (
          <div style={{ padding: 16 }}>
            <ErrorBox message={err} onRetry={() => setTries((t) => t + 1)} />
          </div>
        )}
        {!node && !err && <Spinner />}
        {node && replies.length === 0 && <p className="empty">Sem respostas ainda.</p>}
        {replies.map((r) => (
          <PostCard key={r.post!.uri} post={r.post!} />
        ))}
      </div>
    </>
  );
}
