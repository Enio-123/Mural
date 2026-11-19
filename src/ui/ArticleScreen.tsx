import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { loadArticle, type Article, type NewsItem } from '../lib/news';
import { errorText } from '../lib/api';
import { bump, scale, sourceKey } from '../lib/learn';
import { findInterest } from '../lib/interests';
import { setPrefs, usePrefs } from '../lib/prefs';
import { timeAgo } from '../lib/time';
import { TopBar, Spinner, ErrorBox, Img, toast, openImage } from './common';
import { Icon } from './icons';
import { useNav } from '../lib/nav';

export function ArticleScreen({ story, tags = [] }: { story: NewsItem; tags?: string[] }) {
  const p = usePrefs();
  const nav = useNav();
  const [art, setArt] = useState<Article | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const opened = useRef(Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    loadArticle(story, tries > 0)
      .then((a) => alive && setArt(a))
      .catch((e) => alive && setErr(errorText(e)));
    return () => {
      alive = false;
    };
  }, [story.id, tries]);

  // leu de verdade (mais de 40 s): o app aprende mais com isso
  useEffect(() => {
    return () => {
      if (Date.now() - opened.current > 40_000) {
        for (const t of tags) if (t !== 'destaques' && !t.startsWith('fonte:')) bump('i:' + t, 0.15);
      }
    };
  }, []);

  const safeHtml = useMemo(() => {
    if (!art) return '';
    return DOMPurify.sanitize(art.html, {
      ALLOWED_TAGS: ['p', 'a', 'b', 'strong', 'i', 'em', 'u', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li', 'blockquote', 'figure', 'figcaption', 'img', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'code', 'sup', 'sub', 'small', 'span', 'div', 'picture'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'width', 'height', 'loading', 'decoding'],
    });
  }, [art]);

  // links abrem fora, imagens abrem grandes
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
    el.querySelectorAll('img').forEach((img) => {
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.addEventListener('click', () => openImage(img.src, img.alt));
      img.addEventListener('error', () => img.remove());
    });
  }, [safeHtml]);

  const interestTags = tags.filter((t) => t !== 'destaques' && !t.startsWith('fonte:'));
  const firstInterest = interestTags.map((t) => findInterest(t, p.custom)).find(Boolean);
  const heroInContent = art?.image && safeHtml.includes(art.image.split('?')[0]);
  const fontStep = (d: number) => setPrefs({ readScale: Math.min(1.5, Math.max(0.85, Math.round((p.readScale + d) * 100) / 100)) });

  return (
    <>
      <TopBar
        title={art?.site ?? story.source}
        right={
          <>
            <button className="icon-btn" aria-label="Diminuir letra" onClick={() => fontStep(-0.08)}>
              <Icon name="minus" />
            </button>
            <button className="icon-btn" aria-label="Aumentar letra" onClick={() => fontStep(0.08)}>
              <Icon name="plus" />
            </button>
          </>
        }
      />
      <article className="page" style={{ paddingTop: 12 }}>
        {!art && !err && (
          <>
            <h1 className="reading" style={{ fontSize: '1.5rem', margin: '4px 0 14px' }}>{story.title}</h1>
            <Spinner label="Abrindo a matéria" />
          </>
        )}
        {err && (
          <>
            <h1 className="reading" style={{ fontSize: '1.5rem', margin: '4px 0 14px' }}>{story.title}</h1>
            <ErrorBox message={err} onRetry={() => setTries((t) => t + 1)}>
              <a className="btn ghost" href={story.url} target="_blank" rel="noopener noreferrer">
                <Icon name="external" /> Abrir no site
              </a>
            </ErrorBox>
          </>
        )}
        {art && (
          <>
            {art.image && !heroInContent && (
              <div className="article-hero">
                <Img src={art.image} />
              </div>
            )}
            <div className="reading">
              <h1>{art.title || story.title}</h1>
            </div>
            <div className="article-meta">
              <span>{art.site}</span>
              {art.byline && <span>· {art.byline}</span>}
              {(art.published || story.published) && <span>· {timeAgo(art.published ?? story.published)}</span>}
              <span>· {art.minutes} min de leitura</span>
            </div>
            <div className="reading" ref={bodyRef} dangerouslySetInnerHTML={{ __html: safeHtml }} />
            <div className="article-actions">
              <a className="btn ghost block" href={art.url} target="_blank" rel="noopener noreferrer">
                <Icon name="external" /> Abrir no site
              </a>
              {firstInterest && (
                <button
                  className="btn ghost block"
                  onClick={() => {
                    scale('i:' + firstInterest.id, 0.6);
                    toast(`Vou mostrar menos de ${firstInterest.label}.`);
                    nav.back();
                  }}
                >
                  Menos de {firstInterest.label}
                </button>
              )}
              <button
                className="btn ghost block"
                onClick={() => {
                  scale(sourceKey(story.source), 0.6);
                  toast(`Vou mostrar menos de ${story.source}.`);
                  nav.back();
                }}
              >
                Menos de {story.source}
              </button>
            </div>
            {story.related && story.related.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h2 style={{ fontSize: '1rem', marginBottom: 6 }}>Outras coberturas</h2>
                {story.related.map((r) => (
                  <button
                    key={r.url}
                    className="nrow"
                    style={{ padding: '12px 0' }}
                    onClick={() => nav.push({ name: 'artigo', story: { id: r.url, title: r.title, url: r.url, source: r.source }, tags })}
                  >
                    <div className="nrow-text">
                      <b style={{ fontSize: '0.95rem' }}>{r.title}</b>
                      <div className="meta">{r.source}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </article>
    </>
  );
}
