import { useStoryImage, type Story } from '../lib/news';
import { timeAgo } from '../lib/time';
import { bump, markRead, sourceKey } from '../lib/learn';
import { useNav, type Screen } from '../lib/nav';
import { Img, useVisible } from './common';

export function storyScreen(s: Story): Screen {
  return { name: 'artigo', story: s, tags: s.tags };
}

export function noteOpen(s: Story): void {
  markRead(s.id);
  for (const t of s.tags) if (t !== 'destaques' && !t.startsWith('fonte:')) bump('i:' + t, 0.08);
  bump(sourceKey(s.source), 0.04);
}

function initials(source: string): string {
  return source.replace(/^(www\.)/, '').slice(0, 18);
}

export function NewsCard({ s }: { s: Story }) {
  const nav = useNav();
  const [ref, visible] = useVisible<HTMLButtonElement>('300px');
  const img = useStoryImage(s, visible);
  return (
    <button
      ref={ref}
      className="ncard"
      onClick={() => {
        noteOpen(s);
        nav.push(storyScreen(s));
      }}
    >
      <div className="ncard-img">{img ? <Img src={img} /> : <div className="src-badge">{initials(s.source)}</div>}</div>
      <div className="ncard-body">
        <b>{s.title}</b>
        <div className="meta">
          <span>{s.source}</span>
          {s.published && <span className="dot" />}
          {s.published && <span>{timeAgo(s.published)}</span>}
        </div>
      </div>
    </button>
  );
}

export function NewsListItem({ s, label }: { s: Story; label?: string }) {
  const nav = useNav();
  const [ref, visible] = useVisible<HTMLButtonElement>('400px');
  const img = useStoryImage(s, visible);
  return (
    <button
      ref={ref}
      className="nrow"
      onClick={() => {
        noteOpen(s);
        nav.push(storyScreen(s));
      }}
    >
      <div className="nrow-text">
        <b>{s.title}</b>
        {s.summary && <span className="muted small">{s.summary}</span>}
        <div className="meta">
          <span>{s.source}</span>
          {s.published && <span className="dot" />}
          {s.published && <span>{timeAgo(s.published)}</span>}
          {label && <span className="tag">{label}</span>}
        </div>
      </div>
      {img && (
        <div className="nrow-img">
          <Img src={img} />
        </div>
      )}
    </button>
  );
}
