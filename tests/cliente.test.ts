import { describe, expect, it } from 'vitest';
import { combine, dedupe, rank, type NewsItem, type Story } from '../src/lib/news';
import { segments } from '../src/lib/bsky';
import { fromMoves, puzzleStart, sanTokens, statusText } from '../src/lib/chess';
import { splitNdjson } from '../src/lib/lichess';
import { customInterest } from '../src/lib/interests';
import { classics, norm, searchCatalog } from '../src/lib/books';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function story(id: string, title: string, h: number, tags: string[], extra: Partial<Story> = {}): Story {
  return { id, title, url: 'https://exemplo.test/' + id, source: 'Fonte ' + id, published: hoursAgo(h), tags, ...extra };
}

describe('notícias', () => {
  it('junta a mesma notícia vinda de dois lugares e soma as etiquetas', () => {
    const out = dedupe([story('a', 'Brasil vence a Argentina!', 1, ['futebol']), story('b', 'Brasil vence a Argentina', 2, ['destaques'], { image: 'x.jpg' })]);
    expect(out).toHaveLength(1);
    expect(out[0].tags.sort()).toEqual(['destaques', 'futebol']);
    expect(out[0].image).toBe('x.jpg');
  });

  it('notícia nova vem antes da velha com o mesmo peso', () => {
    const r = rank([story('velha', 'Velha', 30, ['ciencia']), story('nova', 'Nova', 1, ['ciencia'])], NOW);
    expect(r.map((s) => s.id)).toEqual(['nova', 'velha']);
  });

  it('monta destaques e "para você" separados, e marca o que falhou', () => {
    const jobs = [
      { key: 'gn-top', tag: 'destaques', params: {} },
      { key: 'i:ciencia', tag: 'ciencia', params: {} },
      { key: 'f:g1', tag: 'fonte:g1', params: {}, sourceName: 'g1' },
    ];
    const item = (id: string, h: number): NewsItem => ({ id, title: 'Título ' + id, url: 'https://exemplo.test/' + id, source: 'x', published: hoursAgo(h) });
    const st = combine(
      jobs,
      [
        { status: 'fulfilled', value: [item('t1', 2)] },
        { status: 'fulfilled', value: [item('c1', 1)] },
        { status: 'rejected', reason: new Error('fora do ar') },
      ],
      NOW,
    );
    expect(st.status).toEqual({ 'gn-top': 'ok', 'i:ciencia': 'ok', 'f:g1': 'erro' });
    expect(st.top.map((s) => s.id)).toEqual(['t1']);
    expect(st.forYou.map((s) => s.id)).toEqual(['c1']);
  });

  it('assunto próprio vira busca com id estável', () => {
    expect(customInterest('  Fórmula   E ')).toEqual({ id: 'c-formula-e', label: 'Fórmula E', query: 'Fórmula E', bsky: 'Fórmula E' });
  });
});

describe('bluesky', () => {
  it('links e menções usam a posição em bytes (acentos e emoji contam mais de um)', () => {
    const text = 'Olá 👋 veja https://exemplo.test agora';
    const enc = new TextEncoder();
    const start = enc.encode('Olá 👋 veja ').length;
    const end = start + enc.encode('https://exemplo.test').length;
    const segs = segments(text, [{ index: { byteStart: start, byteEnd: end }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://exemplo.test' }] }]);
    const link = segs.find((s) => s.link);
    expect(link?.text).toBe('https://exemplo.test');
    expect(segs.map((s) => s.text).join('')).toBe(text);
  });
});

describe('xadrez', () => {
  it('monta a posição do problema e confere o primeiro lance', () => {
    const p = puzzleStart('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1', 10, ['g2e4', 'c4e2', 'd4f3']);
    expect(p.color).toBe('black');
    expect(p.lastMove).toEqual(['h1', 'f1']);
  });

  it('lê PGN com números de lance e comentários', () => {
    expect(sanTokens('1. e4 {abertura} e5 2. Nf3 Nc6 1-0')).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('aplica lances em UCI e para no primeiro inválido', () => {
    const { chess, last } = fromMoves('startpos', 'e2e4 e7e5 zzzz g1f3');
    expect(chess.history()).toEqual(['e4', 'e5']);
    expect(last?.to).toBe('e5');
  });

  it('texto do resultado do seu ponto de vista', () => {
    expect(statusText('mate', 'white', 'white')).toEqual({ text: 'Você venceu por xeque-mate', tone: 'good' });
    expect(statusText('resign', 'white', 'black').tone).toBe('bad');
    expect(statusText('stalemate', undefined, 'white').text).toBe('Empate (afogamento)');
  });

  it('separa as linhas do stream do Lichess mesmo cortadas no meio', () => {
    const a = splitNdjson('{"type":"gameFull"}\n{"type":"game');
    expect(a.lines).toEqual([{ type: 'gameFull' }]);
    const b = splitNdjson(a.rest + 'State"}\n\n');
    expect(b.lines).toEqual([{ type: 'gameState' }]);
    expect(b.rest).toBe('');
  });
});

describe('livros', () => {
  const books = [
    { id: 1, title: 'Dom Casmurro', authors: ['Machado de Assis'] },
    { id: 2, title: 'Iracema', authors: ['José de Alencar'] },
    { id: 3, title: 'Um livro qualquer', authors: ['Fulano'] },
    { id: 4, title: 'Os Lusíadas', authors: ['Luís de Camões'] },
  ];

  it('busca sem acento e por autor', () => {
    expect(norm('Lusíadas, Os!')).toBe('lusiadas os');
    expect(searchCatalog(books, 'lusiadas').map((b) => b.id)).toEqual([4]);
    expect(searchCatalog(books, 'alencar').map((b) => b.id)).toEqual([2]);
  });

  it('clássicos famosos primeiro, desconhecidos de fora', () => {
    const c = classics(books).map((b) => b.id);
    expect(c[0]).toBe(1);
    expect(c).not.toContain(3);
  });
});
