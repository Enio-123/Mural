import { useState, type CSSProperties, type ReactNode } from 'react';
import { useCover, type BookMeta } from '../lib/books';

/** Duas cores da capa desenhada, tiradas do título: o mesmo livro tem sempre a mesma capa. */
export function coverColors(seed: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { '--cover-a': `hsl(${hue} 26% 32%)`, '--cover-b': `hsl(${(hue + 28) % 360} 30% 14%)` } as CSSProperties;
}

/** Capa: a imagem quando existe, por baixo uma capa desenhada com título e autor. */
export function CoverArt({ title, author, src }: { title: string; author?: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <div className="cover-fallback" style={coverColors(title + (author ?? ''))}>
        <b>{title}</b>
        {author && <span>{author}</span>}
      </div>
      {src && !failed && <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </>
  );
}

export function BookCover({
  title,
  author,
  src,
  pct,
  busy,
  onClick,
  children,
}: {
  title: string;
  author?: string;
  src?: string;
  pct?: number;
  busy?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="cover">
      <button className="cover-img" onClick={onClick} aria-label={author ? `${title}, ${author}` : title} disabled={busy}>
        <CoverArt title={title} author={author} src={src} />
        {busy && (
          <div className="cover-busy">
            <div className="spinner" />
          </div>
        )}
      </button>
      {pct != null && pct > 0.005 && (
        <div className="cover-progress" aria-label={`${Math.round(pct * 100)}% lido`}>
          <i style={{ width: `${Math.max(3, Math.round(pct * 100))}%` }} />
        </div>
      )}
      <span className="cover-title">{title}</span>
      {children}
    </div>
  );
}

/** Capa de um livro que já está na estante (a capa pode estar guardada no aparelho). */
export function ShelfBook({ book, onClick, children }: { book: BookMeta; onClick: () => void; children?: ReactNode }) {
  const src = useCover(book);
  return (
    <BookCover title={book.title} author={book.author} src={src} pct={book.pct} onClick={onClick}>
      {children}
    </BookCover>
  );
}
