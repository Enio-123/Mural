import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** No `npm run dev`, a ponte roda dentro do próprio Vite (na Vercel ela é a função api/ponte.ts). */
function ponteDev(): Plugin {
  return {
    name: 'mural-ponte-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/ponte', async (req, res) => {
        try {
          const mod = (await server.ssrLoadModule('/api/ponte.ts')) as { GET: (r: Request) => Promise<Response> };
          const url = new URL(req.originalUrl ?? '/', 'http://localhost');
          const r = await mod.GET(new Request(url));
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: { code: 'dev', message: String(e) } }));
        }
      });
    },
  };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/** Gera o sw.js no fim do build com a lista de arquivos do app, para abrir sem internet. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mural-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      const files = listFiles(outDir)
        .map((f) => '/' + relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== '/sw.js' && f !== '/index.html' && !f.endsWith('.map') && !f.endsWith('.txt'))
        .sort();
      const precache = ['/', ...files];
      const hash = createHash('sha256');
      for (const f of files) hash.update(f);
      const version = `${Date.now().toString(36)}-${hash.digest('hex').slice(0, 8)}`;
      writeFileSync(join(outDir, 'sw.js'), swSource(version, precache));
    },
  };
}

function swSource(version: string, precache: string[]): string {
  return `/* Mural: guarda o app no celular para abrir rápido e sem internet. Gerado no build. */
const CACHE = 'mural-${version}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // guarda a versão anterior também, para quem ainda está com a página antiga aberta
      const ours = (await caches.keys()).filter((k) => k.startsWith('mural-') && k !== CACHE).sort().reverse();
      await Promise.all(ours.slice(1).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function fromNetwork(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('lento')), ms);
    fetch(request).then(
      (r) => {
        clearTimeout(t);
        resolve(r);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fromNetwork(req, 4000).catch(async () => (await caches.match('/', { ignoreSearch: true })) || fetch(req)),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.startsWith('/assets/')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
}

export default defineConfig({
  plugins: [react(), ponteDev(), serviceWorker()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
