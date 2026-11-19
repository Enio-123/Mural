export type GnTopic = 'WORLD' | 'NATION' | 'BUSINESS' | 'TECHNOLOGY' | 'ENTERTAINMENT' | 'SPORTS' | 'SCIENCE' | 'HEALTH';

export interface Interest {
  id: string;
  label: string;
  /** seção do Google Notícias */
  topic?: GnTopic;
  /** busca no Google Notícias */
  query?: string;
  /** busca no Bluesky */
  bsky?: string;
}

export const INTERESTS: Interest[] = [
  { id: 'brasil', label: 'Brasil', topic: 'NATION' },
  { id: 'mundo', label: 'Mundo', topic: 'WORLD' },
  { id: 'politica', label: 'Política', query: 'política Brasil' },
  { id: 'economia', label: 'Economia', topic: 'BUSINESS' },
  { id: 'tecnologia', label: 'Tecnologia', topic: 'TECHNOLOGY', bsky: 'tecnologia' },
  { id: 'ia', label: 'Inteligência artificial', query: '"inteligência artificial"', bsky: 'inteligência artificial' },
  { id: 'ciencia', label: 'Ciência', topic: 'SCIENCE', bsky: 'ciência' },
  { id: 'espaco', label: 'Espaço', query: 'NASA OR astronomia OR espacial', bsky: 'astronomia' },
  { id: 'saude', label: 'Saúde', topic: 'HEALTH' },
  { id: 'esportes', label: 'Esportes', topic: 'SPORTS' },
  { id: 'futebol', label: 'Futebol', query: 'futebol', bsky: 'futebol' },
  { id: 'f1', label: 'Fórmula 1', query: '"Fórmula 1"', bsky: 'F1' },
  { id: 'xadrez', label: 'Xadrez', query: 'xadrez', bsky: 'xadrez' },
  { id: 'games', label: 'Games', query: 'games OR videogame', bsky: 'games' },
  { id: 'entretenimento', label: 'Entretenimento', topic: 'ENTERTAINMENT' },
  { id: 'cinema', label: 'Filmes e séries', query: 'filme OR série estreia', bsky: 'cinema' },
  { id: 'musica', label: 'Música', query: 'música lançamento', bsky: 'música' },
  { id: 'anime', label: 'Anime', query: 'anime', bsky: 'anime' },
  { id: 'robotica', label: 'Robótica', query: 'robótica', bsky: 'robótica' },
  { id: 'energia', label: 'Energia e clima', query: '"energia renovável" OR clima', bsky: 'clima' },
  { id: 'carros', label: 'Carros', query: 'carros lançamento', bsky: 'carros' },
  { id: 'celulares', label: 'Celulares', query: 'celular lançamento smartphone' },
  { id: 'educacao', label: 'Educação e ENEM', query: 'ENEM OR educação', bsky: 'ENEM' },
  { id: 'livros', label: 'Livros', query: 'livros lançamento literatura', bsky: 'livros' },
];

export function customInterest(label: string): Interest {
  const clean = label.trim().replace(/\s+/g, ' ').slice(0, 60);
  const id =
    'c-' +
    clean
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return { id, label: clean, query: clean, bsky: clean };
}

export function findInterest(id: string, custom: Interest[]): Interest | undefined {
  return INTERESTS.find((i) => i.id === id) ?? custom.find((i) => i.id === id);
}

export function ponteParams(i: Interest): Record<string, string> {
  if (i.topic) return { src: 'gn-topic', topic: i.topic };
  return { src: 'gn-search', q: i.query ?? i.label };
}
