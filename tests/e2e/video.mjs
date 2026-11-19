// Grava a animação de abertura entrando na tela inicial, num celular simulado.
// Uso: npm run build && node tests/e2e/video.mjs pasta-de-saida
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as D from './dados.mjs';
import { routes } from './rotas.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] || join(root, 'test-results');
mkdirSync(out, { recursive: true });
const PORT = 4181;
const BASE = `http://localhost:${PORT}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}

const raw = join(out, 'quadros');
rmSync(raw, { recursive: true, force: true });
mkdirSync(raw, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'pt-BR', timezoneId: 'America/Fortaleza', serviceWorkers: 'block' });
await routes(ctx, BASE, await D.makeEpub());
await ctx.addInitScript(() => {
  localStorage.setItem('mural:prefs', JSON.stringify({ onboarded: true, interests: ['tecnologia', 'ciencia', 'xadrez', 'games'], splash: true }));
});
const page = await ctx.newPage();

// quadros na resolução real do celular, com a hora de cada um
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', async (f) => {
  frames.push({ data: f.data, t: f.metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1100, maxHeight: 2300, everyNthFrame: 1 });
const startAt = Date.now() / 1000;
await page.goto(BASE);
await page.waitForTimeout(3900);
await page.locator('.screen').first().evaluate((el) => el.scrollTo({ top: 520, behavior: 'smooth' }));
await page.waitForTimeout(1400);
await page.locator('.screen').first().evaluate((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
await page.waitForTimeout(1200);
await cdp.send('Page.stopScreencast');
await ctx.close();
await browser.close();

// só os quadros depois de abrir o endereço do app (antes disso a aba está vazia)
const used = frames.filter((f) => f.t >= startAt - 0.05);
let list = 'ffconcat version 1.0\n';
used.forEach((f, i) => {
  const name = `q${String(i).padStart(4, '0')}.jpg`;
  writeFileSync(join(raw, name), Buffer.from(f.data, 'base64'));
  const next = used[i + 1]?.t ?? f.t + 0.5;
  list += `file ${name}\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
});
list += `file q${String(used.length - 1).padStart(4, '0')}.jpg\n`;
writeFileSync(join(raw, 'lista.txt'), list);
const mp4 = join(out, 'abertura-mural.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(raw, 'lista.txt'), '-vf', 'fps=30,scale=720:-2:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-crf', '20', mp4]);
rmSync(raw, { recursive: true, force: true });
console.log('ok', mp4, used.length, 'quadros');
process.exit(0);
