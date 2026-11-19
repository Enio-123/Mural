// Conteúdo de EXEMPLO para testar as telas sem internet. Nada daqui vai para o app publicado.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60_000).toISOString();

export function img(seed, w = 800, h = 450) {
  return `https://img.exemplo.test/${seed}.svg?w=${w}&h=${h}`;
}

export function svgImage(url) {
  const u = new URL(url);
  const seed = u.pathname.replace(/\W/g, '');
  let hsh = 0;
  for (const c of seed) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  const a = hsh % 360;
  const w = Number(u.searchParams.get('w') || 800);
  const h = Number(u.searchParams.get('h') || 450);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 45% 42%)"/><stop offset="1" stop-color="hsl(${(a + 50) % 360} 40% 18%)"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${w * 0.72}" cy="${h * 0.38}" r="${h * 0.22}" fill="rgba(255,255,255,.14)"/>
  <rect x="${w * 0.08}" y="${h * 0.62}" width="${w * 0.5}" height="${h * 0.08}" rx="${h * 0.04}" fill="rgba(255,255,255,.18)"/>
</svg>`;
}

const TITLES = [
  ['Exemplo de manchete de tecnologia com duas linhas para ver o corte do texto', 'Site de exemplo A', 'tecnologia'],
  ['Exemplo: resultado de uma pesquisa científica explicado em poucas palavras', 'Site de exemplo B', 'ciencia'],
  ['Exemplo de notícia de xadrez sobre um torneio importante', 'Site de exemplo C', 'xadrez'],
  ['Exemplo de lançamento de jogo com data marcada', 'Site de exemplo D', 'games'],
  ['Exemplo de destaque do dia no Brasil', 'Site de exemplo A', 'destaques'],
  ['Exemplo de notícia do mundo com um título um pouco maior do que os outros para testar', 'Site de exemplo E', 'destaques'],
  ['Exemplo de matéria sobre economia', 'Site de exemplo B', 'destaques'],
  ['Exemplo de novidade em celulares', 'Site de exemplo F', 'tecnologia'],
  ['Exemplo de descoberta sobre o espaço', 'Site de exemplo C', 'ciencia'],
  ['Exemplo de campeonato de games no Brasil', 'Site de exemplo D', 'games'],
];

export function newsItems(tag) {
  return TITLES.map(([title, source, t], i) => ({
    id: 'n' + i + '-' + (tag || 'x'),
    title,
    url: `https://site-exemplo.test/materia-${i}`,
    source,
    published: iso(18 + i * 37),
    image: i % 3 === 2 ? undefined : img('noticia' + i),
    summary: 'Resumo de exemplo da notícia, com uma ou duas frases sobre o assunto.',
    related: i === 0 ? [{ title: 'Outra cobertura de exemplo sobre o mesmo assunto', url: 'https://outro-exemplo.test/a', source: 'Site de exemplo B' }] : undefined,
    _t: t,
  }))
    .filter((it) => !tag || tag === 'destaques' || it._t === tag || tag === 'rss')
    .map(({ _t, ...it }) => it);
}

export const article = {
  url: 'https://site-exemplo.test/materia-0',
  title: 'Exemplo de manchete de tecnologia com duas linhas para ver o corte do texto',
  byline: 'Redação de exemplo',
  site: 'Site de exemplo A',
  published: iso(18),
  image: img('noticia0', 1200, 675),
  minutes: 3,
  html:
    '<p>Este é um texto de exemplo para testar a leitura dentro do Mural. Quando o app estiver no ar, aqui aparece o texto da notícia de verdade, sem propaganda e com a letra no tamanho que você escolher.</p>' +
    '<h2>Um intertítulo de exemplo</h2>' +
    '<p>O leitor tira menus, banners e caixas de comentário. Fica só o título, a foto principal e os parágrafos. Links continuam funcionando e abrem no navegador.</p>' +
    '<blockquote>Uma citação de exemplo aparece assim, com a barra do lado.</blockquote>' +
    '<p>Se a página do site não deixar ler por aqui, o botão "Abrir no site" leva direto para a matéria original.</p>',
};

export const catalog = {
  books: [
    { id: 55752, title: 'Dom Casmurro', authors: ['Machado de Assis'] },
    { id: 54829, title: 'Memorias Posthumas de Braz Cubas', authors: ['Machado de Assis'] },
    { id: 3333, title: 'Os Lusíadas', authors: ['Luís de Camões'] },
    { id: 67740, title: 'Iracema', authors: ['José de Alencar'] },
    { id: 55682, title: 'Quincas Borba', authors: ['Machado de Assis'] },
    { id: 57001, title: 'O Alienista', authors: ['Machado de Assis'] },
    { id: 18220, title: 'A Cidade e as Serras', authors: ['Eça de Queirós'] },
    { id: 55320, title: 'O Primo Bazilio', authors: ['Eça de Queirós'] },
    { id: 31509, title: 'Os Maias', authors: ['Eça de Queirós'] },
    { id: 17072, title: 'Amor de Perdição', authors: ['Camilo Castelo Branco'] },
    { id: 23055, title: 'Senhora', authors: ['José de Alencar'] },
    { id: 9301, title: 'Um livro qualquer de exemplo', authors: ['Autor de exemplo'] },
  ],
};

const author = (n) => ({ did: 'did:plc:exemplo' + n, handle: `exemplo${n}.bsky.social`, displayName: `Conta de exemplo ${n}`, avatar: img('avatar' + n, 96, 96) });

export function post(n, extra = {}) {
  return {
    uri: `at://did:plc:exemplo${n}/app.bsky.feed.post/p${n}`,
    cid: 'cid' + n,
    author: author(n),
    record: { $type: 'app.bsky.feed.post', text: extra.text ?? `Post de exemplo número ${n}, para ver como o texto, a foto e os números aparecem no Mural. #exemplo`, createdAt: iso(5 + n * 11) },
    embed: n % 2 === 1 ? { $type: 'app.bsky.embed.images#view', images: [{ thumb: img('post' + n, 600, 400), fullsize: img('post' + n, 1200, 800), alt: 'Imagem de exemplo', aspectRatio: { width: 3, height: 2 } }] } : undefined,
    replyCount: n * 3,
    repostCount: n * 5,
    likeCount: n * 21,
    indexedAt: iso(5 + n * 11),
  };
}

export const bskyFeed = { feed: [1, 2, 3, 4, 5, 6].map((n) => ({ post: post(n) })), cursor: 'pagina2' };
export const bskyThread = {
  thread: {
    $type: 'app.bsky.feed.defs#threadViewPost',
    post: post(1),
    replies: [2, 4].map((n) => ({ $type: 'app.bsky.feed.defs#threadViewPost', post: post(n, { text: `Resposta de exemplo ${n}.` }) })),
  },
};

// Armadilha clássica (Blackburne Shilling): as pretas dão mate em 2.
export const dailyPuzzle = {
  game: { id: 'exemplo1', pgn: 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1', clock: '10+0' },
  puzzle: { id: 'exemploP1', rating: 1320, plays: 48211, initialPly: 10, solution: ['g2e4', 'c4e2', 'd4f3'], themes: ['mateIn2', 'opening', 'short'] },
};

export const account = {
  id: 'exemplo',
  username: 'Exemplo',
  perfs: { rapid: { rating: 1512, games: 34 }, blitz: { rating: 1430, games: 12 }, puzzle: { rating: 1688, games: 210 } },
};

export const playing = {
  nowPlaying: [
    {
      gameId: 'jogo0001',
      fullId: 'jogo0001abcd',
      color: 'white',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      isMyTurn: true,
      lastMove: 'b8c6',
      opponent: { id: null, username: 'Computador', ai: 3 },
      speed: 'correspondence',
    },
  ],
};

export const gameFull = {
  type: 'gameFull',
  id: 'jogo0001',
  initialFen: 'startpos',
  white: { id: 'exemplo', name: 'Exemplo', rating: 1512 },
  black: { aiLevel: 3 },
  state: { type: 'gameState', moves: 'e2e4 e7e5 g1f3 b8c6', wtime: 2147483647, btime: 2147483647, winc: 0, binc: 0, status: 'started' },
};

export const recentGames = [
  {
    id: 'jogo0000',
    rated: false,
    speed: 'rapid',
    perf: 'rapid',
    createdAt: now - 86_400_000,
    status: 'mate',
    winner: 'white',
    moves: 'e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
    opening: { name: "Partida de exemplo: Mate do pastor" },
    players: { white: { user: { name: 'Exemplo' }, rating: 1500 }, black: { aiLevel: 2 } },
  },
];

const PARAS = [
  'Este é um livro de exemplo, feito só para testar o leitor do Mural. Ele tem três capítulos curtos e texto suficiente para virar algumas páginas.',
  'O farol ficava no fim de uma ponta de pedra, onde o vento chegava antes de todo mundo. Quem cuidava dele contava os navios pelo barulho das ondas e anotava tudo num caderno de capa azul.',
  'Toda noite a luz girava devagar, e cada volta parecia uma pergunta feita ao mar. Às vezes o mar respondia com neblina; às vezes, com um silêncio tão grande que dava para ouvir o próprio coração.',
  'No caderno havia datas, nomes de barcos e pequenas observações: “céu limpo”, “chuva fina”, “um pássaro cansado pousou na grade”. Ninguém lia aquilo, mas ele escrevia como se alguém fosse ler um dia.',
  'Num inverno comprido, chegou uma carta. A letra era miúda e inclinada, e o papel cheirava a sal. Dizia apenas que alguém, muito longe, também olhava para a mesma luz.',
  'Daquele dia em diante, o faroleiro passou a escrever duas linhas a mais em cada página: uma para o mar e outra para a pessoa da carta.',
];

function chapter(n, title) {
  const paras = [];
  for (let i = 0; i < 14; i++) paras.push(PARAS[(i + n) % PARAS.length]);
  return { title, paras };
}

export async function makeEpub({ title = 'Livro de exemplo', author = 'Mural (teste)' } = {}) {
  const chapters = [chapter(0, 'Capítulo 1. O farol'), chapter(1, 'Capítulo 2. O caderno azul'), chapter(2, 'Capítulo 3. A carta')];
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  const items = chapters.map((_, i) => `<item id="c${i + 1}" href="c${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">mural-exemplo-${title.length}</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>pt-BR</dc:language><meta property="dcterms:modified">2026-11-19T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}</manifest><spine>${spine}</spine></package>`,
  );
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Índice</title></head><body><nav epub:type="toc"><ol>${chapters
      .map((c, i) => `<li><a href="c${i + 1}.xhtml">${c.title}</a></li>`)
      .join('')}</ol></nav></body></html>`,
  );
  chapters.forEach((c, i) =>
    zip.file(
      `OEBPS/c${i + 1}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${c.title}</title></head><body><h1>${c.title}</h1>${c.paras.map((p) => `<p>${p}</p>`).join('')}</body></html>`,
    ),
  );
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}
