// Respostas de exemplo para tudo que o app busca fora (ponte, Lichess, Bluesky, imagens).
import * as D from './dados.mjs';

export async function routes(ctx, BASE, epub) {
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.origin === BASE) {
      if (url.pathname !== '/api/ponte') return route.continue();
      const fn = url.searchParams.get('fn');
      if (fn === 'news') {
        const src = url.searchParams.get('src');
        const tag = src === 'gn-top' ? 'destaques' : src === 'rss' ? 'rss' : url.searchParams.get('q')?.split(' ')[0]?.toLowerCase().replace('ê', 'e') || (url.searchParams.get('topic') === 'TECHNOLOGY' ? 'tecnologia' : url.searchParams.get('topic') === 'SCIENCE' ? 'ciencia' : 'destaques');
        return json({ items: D.newsItems(tag), fetchedAt: new Date().toISOString() });
      }
      if (fn === 'meta') return json({ image: null });
      if (fn === 'article') return json(D.article);
      if (fn === 'catalog') return json(D.catalog);
      if (fn === 'busca') return json(D.library(url.searchParams.get('q'), url.searchParams.get('lang')));
      if (fn === 'book') return route.fulfill({ status: 200, contentType: 'application/epub+zip', body: epub });
      if (fn === 'bsky') return json(D.bskyFeed);
      return json({ error: { code: 'fn', message: 'desconhecida' } }, 400);
    }
    if (url.hostname === 'img.exemplo.test') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: D.svgImage(req.url()) });
    if (url.hostname === 'public.api.bsky.app') {
      const m = url.pathname.split('/').pop();
      if (m === 'app.bsky.feed.getFeed') return json(url.searchParams.get('cursor') ? { feed: [] } : D.bskyFeed);
      if (m === 'app.bsky.feed.getPostThread') return json(D.bskyThread);
      if (m === 'app.bsky.feed.searchPosts') return json({ posts: D.bskyFeed.feed.map((i) => i.post) });
      return json({ error: 'NotFound' }, 404);
    }
    if (url.hostname === 'lichess.org') {
      const p = url.pathname;
      if (p === '/api/puzzle/daily') return json(D.dailyPuzzle);
      if (p === '/api/account') return json(D.account);
      if (p === '/api/account/playing') return json(D.playing);
      if (p.startsWith('/api/board/game/stream/')) return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: JSON.stringify(D.gameFull) + '\n' });
      if (p.startsWith('/api/games/user/')) return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: D.recentGames.map((g) => JSON.stringify(g)).join('\n') + '\n' });
      return json({ error: 'not found' }, 404);
    }
    if (url.hostname === 'www.gutenberg.org' || url.hostname === 'gutenberg.pglaf.org') return route.fulfill({ status: 404, body: '' });
    return route.abort();
  });
}

