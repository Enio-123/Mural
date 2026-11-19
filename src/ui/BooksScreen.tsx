import { useMemo, useRef, useState } from 'react';
import { classics, gutenbergCover, importFile, library, removeBook, searchCatalog, sortedLibrary, type BookMeta } from '../lib/books';
import { errorText } from '../lib/api';
import { useNav } from '../lib/nav';
import { TopBar, Spinner, ErrorBox, Sheet, toast } from './common';
import { CoverArt, ShelfBook } from './BookCover';
import { useCatalog, useOpenClassic } from './books-data';
import { Icon } from './icons';

export function BooksScreen() {
  const nav = useNav();
  const books = sortedLibrary(library.use());
  const catalog = useCatalog();
  const { busy, open } = useOpenClassic();
  const [q, setQ] = useState('');
  const [importing, setImporting] = useState(false);
  const [edit, setEdit] = useState(false);
  const [removing, setRemoving] = useState<BookMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const have = useMemo(() => new Set(books.map((b) => b.id)), [books]);
  const list = useMemo(() => {
    if (!catalog.books) return [];
    return q.trim() ? searchCatalog(catalog.books, q) : classics(catalog.books);
  }, [catalog.books, q]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setImporting(true);
    try {
      const meta = await importFile(f);
      toast(`"${meta.title}" está na sua estante.`);
    } catch (e) {
      toast(errorText(e), 4000);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <TopBar
        title="Livros"
        right={
          <button className="icon-btn" aria-label="Abrir um ePub seu" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Icon name="upload" />
          </button>
        }
      />
      <input ref={fileRef} type="file" accept=".epub,application/epub+zip" hidden onChange={(e) => void onFile(e.target.files?.[0])} />

      <div className="shelf-head">
        <h2>Sua estante</h2>
        {books.length > 0 && (
          <button className="link-btn" onClick={() => setEdit((x) => !x)}>
            {edit ? 'Pronto' : 'Organizar'}
          </button>
        )}
      </div>
      {importing && <Spinner label="Abrindo o ePub" />}
      {books.length === 0 && !importing ? (
        <div className="empty-card">
          Sua estante está vazia. Baixe um clássico aqui embaixo ou abra um ePub seu (sem DRM).
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Abrir um ePub
          </button>
        </div>
      ) : (
        <div className="book-grid" style={{ maxWidth: 680, margin: '0 auto' }}>
          {books.map((b) => (
            <ShelfBook key={b.id} book={b} onClick={() => (edit ? setRemoving(b) : nav.push({ name: 'leitor', id: b.id }))}>
              {edit && (
                <button className="cover-remove" aria-label={`Tirar ${b.title} da estante`} onClick={() => setRemoving(b)}>
                  <Icon name="close" />
                </button>
              )}
            </ShelfBook>
          ))}
        </div>
      )}

      <div className="shelf-head" style={{ paddingTop: 26 }}>
        <h2>Clássicos grátis em português</h2>
      </div>
      <div className="search-box" style={{ maxWidth: 680, margin: '0 auto' }}>
        <Icon name="search" />
        <input
          className="input"
          type="search"
          enterKeyHint="search"
          placeholder="Buscar título ou autor"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar nos clássicos"
        />
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 40 }}>
        {catalog.error && !catalog.books && (
          <div style={{ padding: '8px 16px' }}>
            <ErrorBox message={catalog.error} onRetry={catalog.retry} />
          </div>
        )}
        {!catalog.books && !catalog.error && <Spinner label="Carregando os clássicos" />}
        {catalog.books && list.length === 0 && <p className="empty">{q.trim() ? 'Nada com esse nome nos livros em português.' : 'Nenhum livro agora.'}</p>}
        {list.map((b) => {
          const id = 'g-' + b.id;
          const inShelf = have.has(id);
          return (
            <button key={b.id} className="book-row" onClick={() => void open(b)} disabled={busy !== null}>
              <div className="book-thumb">
                <CoverArt title={b.title} author={b.authors.join(', ')} src={gutenbergCover(b.id)} />
              </div>
              <div className="book-text">
                <b>{b.title}</b>
                <span className="muted small">{b.authors.join(', ') || 'Autor desconhecido'}</span>
              </div>
              <span className="book-state">
                {busy === id ? (
                  <div className="spinner" />
                ) : inShelf ? (
                  'Ler'
                ) : (
                  <>
                    <Icon name="download" />
                    <span className="sr-only">Baixar</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
        <p className="note" style={{ padding: '12px 16px 0' }}>
          Livros em domínio público do Projeto Gutenberg. Eles e os seus ePubs ficam guardados só neste celular e funcionam sem internet.
        </p>
      </div>

      {removing && (
        <Sheet title="Tirar da estante?" onClose={() => setRemoving(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            "{removing.title}" sai deste celular. {removing.source === 'gutenberg' ? 'Dá pra baixar de novo quando quiser.' : 'Pra ler de novo, você abre o arquivo outra vez.'}
          </p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </button>
            <button
              className="btn primary"
              onClick={() => {
                const b = removing;
                setRemoving(null);
                void removeBook(b.id).then(() => toast('Livro tirado da estante.'));
              }}
            >
              Tirar
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
