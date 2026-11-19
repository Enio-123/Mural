import { useState } from 'react';
import { segments, postUrl, type EmbedView, type FeedItem, type PostView } from '../lib/bsky';
import { timeAgo } from '../lib/time';
import { useNav } from '../lib/nav';
import { Img, openImage } from './common';
import { Icon } from './icons';

function name(a: PostView['author']) {
  return a.displayName?.trim() || a.handle;
}

export function RichText({ text, facets }: { text: string; facets?: PostView['record']['facets'] }) {
  return (
    <>
      {segments(text, facets).map((s, i) =>
        s.link ? (
          <a key={i} href={s.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            {s.text}
          </a>
        ) : s.mention || s.tag ? (
          <span key={i} style={{ color: 'var(--accent)' }}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function canPlayHls(): boolean {
  const v = document.createElement('video');
  return v.canPlayType('application/vnd.apple.mpegurl') !== '';
}

function Embed({ embed, post, compact }: { embed: EmbedView; post: PostView; compact?: boolean }) {
  const nav = useNav();
  const [playing, setPlaying] = useState(false);
  const t = embed.$type;
  if (t === 'app.bsky.embed.images#view' && embed.images?.length) {
    const imgs = embed.images.slice(0, 4);
    return (
      <div className={`post-images n${imgs.length}`}>
        {imgs.map((im, i) => (
          <button
            key={i}
            aria-label={im.alt || 'Abrir imagem'}
            onClick={(e) => {
              e.stopPropagation();
              openImage(im.fullsize, im.alt);
            }}
          >
            <Img src={im.thumb} alt={im.alt} />
          </button>
        ))}
      </div>
    );
  }
  if (t === 'app.bsky.embed.external#view' && embed.external) {
    const ex = embed.external;
    let host = '';
    try {
      host = new URL(ex.uri).hostname.replace(/^www\./, '');
    } catch {
      /* link estranho */
    }
    return (
      <button
        className="ext"
        onClick={(e) => {
          e.stopPropagation();
          nav.push({ name: 'artigo', story: { id: ex.uri, title: ex.title || ex.uri, url: ex.uri, source: host } });
        }}
      >
        {ex.thumb && !compact && <Img src={ex.thumb} />}
        <div>
          <b>{ex.title || ex.uri}</b>
          <span>{host}</span>
        </div>
      </button>
    );
  }
  if (t === 'app.bsky.embed.video#view') {
    if (playing && embed.playlist) {
      return (
        <div className="video-box" onClick={(e) => e.stopPropagation()}>
          <video src={embed.playlist} poster={embed.thumbnail} controls autoPlay playsInline />
        </div>
      );
    }
    return (
      <button
        className="video-box"
        aria-label="Ver vídeo"
        onClick={(e) => {
          e.stopPropagation();
          if (canPlayHls()) setPlaying(true);
          else window.open(postUrl(post), '_blank', 'noopener');
        }}
      >
        {embed.thumbnail && <Img src={embed.thumbnail} />}
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff' }}>
          <Icon name="play" width={44} height={44} />
        </span>
      </button>
    );
  }
  if (t === 'app.bsky.embed.record#view' && embed.record?.author && embed.record?.value) {
    const r = embed.record;
    return (
      <div className="quote">
        <div className="who">
          <Img className="avatar" src={r.author.avatar} />
          <div className="who-text">
            <b>{r.author.displayName || r.author.handle}</b>
            <span>@{r.author.handle}</span>
          </div>
        </div>
        <span style={{ whiteSpace: 'pre-wrap' }}>{r.value.text}</span>
      </div>
    );
  }
  if (t === 'app.bsky.embed.recordWithMedia#view') {
    return (
      <>
        {embed.media && <Embed embed={embed.media} post={post} compact={compact} />}
        {embed.record?.record && <Embed embed={{ $type: 'app.bsky.embed.record#view', record: embed.record.record }} post={post} compact={compact} />}
      </>
    );
  }
  return null;
}

export function PostCard({ item, post: postProp, onOpen }: { item?: FeedItem; post?: PostView; onOpen?: boolean }) {
  const nav = useNav();
  const post = item?.post ?? postProp!;
  const text = post.record?.text ?? '';
  return (
    <article
      className="post"
      onClick={() => onOpen !== false && nav.push({ name: 'post', uri: post.uri, post })}
      role={onOpen !== false ? 'button' : undefined}
      tabIndex={onOpen !== false ? 0 : undefined}
    >
      {item?.reason?.$type === 'app.bsky.feed.defs#reasonRepost' && item.reason.by && (
        <div className="reason">
          <Icon name="repeat" width={14} height={14} /> {name(item.reason.by)} repostou
        </div>
      )}
      <div className="who">
        <Img className="avatar" src={post.author.avatar} />
        <div className="who-text">
          <b>{name(post.author)}</b>
          <span>
            @{post.author.handle} · {timeAgo(post.indexedAt ?? post.record?.createdAt)}
          </span>
        </div>
      </div>
      {text && (
        <div className="post-text">
          <RichText text={text} facets={post.record.facets} />
        </div>
      )}
      {post.embed && <Embed embed={post.embed} post={post} />}
      <div className="counts">
        <span>
          <Icon name="reply" /> {post.replyCount ?? 0}
        </span>
        <span>
          <Icon name="repeat" /> {post.repostCount ?? 0}
        </span>
        <span>
          <Icon name="heart" /> {post.likeCount ?? 0}
        </span>
      </div>
    </article>
  );
}

/** Cartão curto para a fileira da tela inicial. */
export function PostMini({ post }: { post: PostView }) {
  const nav = useNav();
  const img = post.embed?.images?.[0]?.thumb ?? post.embed?.media?.images?.[0]?.thumb ?? post.embed?.external?.thumb ?? post.embed?.thumbnail;
  return (
    <button className="pcard" onClick={() => nav.push({ name: 'post', uri: post.uri, post })}>
      <div className="who">
        <Img className="avatar" src={post.author.avatar} />
        <div className="who-text">
          <b>{name(post.author)}</b>
          <span>{timeAgo(post.indexedAt ?? post.record?.createdAt)}</span>
        </div>
      </div>
      {post.record?.text && <p className="post-text">{post.record.text}</p>}
      {img && (
        <div className="pcard-img">
          <Img src={img} />
        </div>
      )}
    </button>
  );
}
