export interface Source {
  id: string;
  name: string;
  url: string;
  /** já vem ligada na primeira vez */
  on?: boolean;
}

/** Sites com RSS próprio. Agência Brasil e Olhar Digital foram conferidos em 18/11/2026. */
export const SOURCES: Source[] = [
  { id: 'agencia-brasil', name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', on: true },
  { id: 'g1', name: 'g1', url: 'https://g1.globo.com/rss/g1/', on: true },
  { id: 'bbc-brasil', name: 'BBC News Brasil', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml', on: true },
  { id: 'olhar-digital', name: 'Olhar Digital', url: 'https://olhardigital.com.br/feed/' },
  { id: 'ge', name: 'ge', url: 'https://ge.globo.com/rss/ge/' },
  { id: 'tecmundo', name: 'Tecmundo', url: 'https://rss.tecmundo.com.br/feed' },
  { id: 'canaltech', name: 'Canaltech', url: 'https://canaltech.com.br/rss/' },
  { id: 'cnn-brasil', name: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/' },
  { id: 'dw-brasil', name: 'DW Brasil', url: 'https://rss.dw.com/rdf/rss-br-all' },
  { id: 'poder360', name: 'Poder360', url: 'https://www.poder360.com.br/feed/' },
];

export function allSources(extra: Source[]): Source[] {
  return [...SOURCES, ...extra];
}
