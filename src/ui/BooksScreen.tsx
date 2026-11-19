import { useMemo, useRef, useState } from 'react';
import { BOOK_LANGS, classics, gutenbergCover, importFile, langName, library, removeBook, searchCatalog, sortedLibrary, type BookMeta, type CatalogBook } from '../lib/books';
import { errorText } from '../lib/api';
import { useNav } from '../lib/nav';
import { TopBar, Spinner, ErrorBox, Sheet, toast } from './common';
import { CoverArt, ShelfBook } from './BookCover';
import { useCatalog, useLibrarySearch, useOpenClassic } from './books-data';
import { Icon } from './icons';

export function BooksScreen() {
  const nav = useNav();
  const books = sortedLibrary(library.use());
  const catalog = useCatalog();
  const { busy, open } = useOpenClassic();
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('pt');
  const remote = useLibrarySearch(q, lang, lang !== 'pt');
  const [importing, setImporting] = useState(false);
  const [edit, setEdit] = useState(false);
  const [removing, setRemoving] = useState<BookMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const have = useMemo(() => new Set(books.map((b) => b.id)), [books]);
  const local = useMemo(() => {
    if (!catalog.books) return [];
    return q.trim() ? searchCatalog(catalog.books, q) : classics(catalog.books);
  }, [catalog.books, q]);
  const isLocal = lang === 'pt';
  const list: CatalogBook[] = isLocal ? local : remote.books ?? [];
  const all = remote.all ?? catalog.total;
  const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

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
        <h2>Biblioteca grátis</h2>
      </div>
      <p className="lib-count muted small">
        {all ? `${fmt(all)} livros em domínio público, de graça, pra ler no app.` : 'Livros em domínio público, de graça, pra ler no app.'}
      </p>
      <div className="chips lib-langs" role="group" aria-label="Idioma dos livros">
        {BOOK_LANGS.map(([code, name]) => (
          <button key={code} className="chip" aria-pressed={lang === code} onClick={() => setLang(code)}>
            {name}
          </button>
        ))}
      </div>
      <div className="search-box" style={{ maxWidth: 680, margin: '0 auto' }}>
        <Icon name="search" />
        <input
          className="input"
          type="search"
          enterKeyHint="search"
          placeholder={isLocal ? 'Buscar título ou autor' : `Buscar entre ${remote.total ? fmt(remote.total) + ' ' : 'os '}livros`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar na biblioteca"
        />
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 40 }}>
        {isLocal && catalog.error && !catalog.books && (
          <div style={{ padding: '8px 16px' }}>
            <ErrorBox message={catalog.error} onRetry={catalog.retry} />
          </div>
        )}
        {!isLocal && remote.error && (
          <div style={{ padding: '8px 16px' }}>
            <ErrorBox message={remote.error} onRetry={remote.retry} />
          </div>
        )}
        {isLocal && !catalog.books && !catalog.error && <Spinner label="Carregando os clássicos" />}
        {!isLocal && !remote.books && !remote.error && <Spinner label="Procurando na biblioteca" />}
        {(isLocal ? catalog.books : remote.books) && list.length === 0 && (
          <p className="empty">{q.trim() ? `Nada com esse nome ${isLocal ? 'em português' : lang === 'todos' ? 'na biblioteca' : 'em ' + langName(lang).toLowerCase()}.` : 'Nenhum livro agora.'}</p>
        )}
        <div className={'lib-list' + (!isLocal && remote.loading && remote.books ? ' stale' : '')}>
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
                  {b.lang && b.lang !== 'pt' && lang === 'todos' && <span className="tag lang-tag">{langName(b.lang)}</span>}
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
        </div>
        {isLocal && q.trim() && catalog.books && (
          <button className="btn ghost lib-more" onClick={() => setLang('todos')}>
            <Icon name="search" /> Procurar “{q.trim()}” em todos os idiomas
          </button>
        )}
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
