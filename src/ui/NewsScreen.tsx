import { useMemo, useState } from 'react';
import { refreshNews, useNews, type Story } from '../lib/news';
import { findInterest } from '../lib/interests';
import { usePrefs } from '../lib/prefs';
import { allSources } from '../lib/sources';
import { TopBar, Spinner, ErrorBox } from './common';
import { NewsListItem } from './NewsCard';
import { Icon } from './icons';

export function NewsScreen({ initialTag }: { initialTag?: string }) {
  const p = usePrefs();
  const news = useNews();
  const [tag, setTag] = useState(initialTag ?? 'para-voce');

  const tabs = useMemo(() => {
    const t: { id: string; label: string }[] = [
      { id: 'para-voce', label: 'Para você' },
      { id: 'destaques', label: 'Destaques' },
    ];
    for (const id of p.interests) {
      const i = findInterest(id, p.custom);
      if (i) t.push({ id: i.id, label: i.label });
    }
    for (const s of allSources(p.extraSources)) if (p.sources.includes(s.id)) t.push({ id: 'fonte:' + s.id, label: s.name });
    return t;
  }, [p.interests, p.custom, p.sources, p.extraSources]);

  const labelOf = useMemo(() => {
    const m = new Map(tabs.map((t) => [t.id, t.label]));
    return (s: Story) => {
      const first = s.tags.find((x) => x !== 'destaques' && !x.startsWith('fonte:'));
      return first ? m.get(first) : undefined;
    };
  }, [tabs]);

  let list: Story[] = [];
  if (news.state) {
    if (tag === 'para-voce') list = news.state.forYou.length ? news.state.forYou : news.state.top;
    else if (tag === 'destaques') list = news.state.top;
    else list = news.state.byTag[tag] ?? [];
  }

  return (
    <>
      <TopBar
        title="Notícias"
        lined={false}
        right={
          <button className="icon-btn" aria-label="Atualizar" onClick={() => void refreshNews(true)}>
            <Icon name="refresh" />
          </button>
        }
      />
      <div className="chips" role="tablist" aria-label="Assuntos">
        {tabs.map((t) => (
          <button key={t.id} className="chip" role="tab" aria-pressed={tag === t.id} aria-selected={tag === t.id} onClick={() => setTag(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 40 }}>
        {news.error && !news.state && (
          <div style={{ padding: '0 16px' }}>
            <ErrorBox message={news.error} onRetry={() => void refreshNews(true)} />
          </div>
        )}
        {!news.state && news.loading && <Spinner />}
        {news.state && list.length === 0 && (
          <p className="empty">{news.loading ? 'Buscando…' : 'Nada novo aqui agora. Puxe de novo mais tarde.'}</p>
        )}
        <div className="list">
          {list.slice(0, 80).map((s) => (
            <NewsListItem key={s.id} s={s} label={tag === 'para-voce' ? labelOf(s) : undefined} />
          ))}
        </div>
        {news.state && (
          <p className="note" style={{ padding: '6px 16px' }}>
            Atualizado {new Date(news.state.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Fontes: Google Notícias e os sites ligados em Ajustes.
          </p>
        )}
      </div>
    </>
  );
}
