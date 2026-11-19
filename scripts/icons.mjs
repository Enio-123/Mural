// Gera os ícones PNG do app a partir do desenho em public/icons/icon.svg.
// Uso: node scripts/icons.mjs (precisa do Playwright com o Chromium).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Playwright pode estar instalado fora do projeto (NODE_PATH); o require acha nos dois casos.
const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icons/icon.svg'), 'utf8');
// conteúdo do desenho sem o quadrado de fundo, para o ícone "maskable" (fundo inteiro)
const inner = svg.replace(/<rect x="2"[^>]*\/>/, '');

const jobs = [
  { file: 'icon-192.png', size: 192, html: svg, pad: 0 },
  { file: 'icon-512.png', size: 512, html: svg, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, html: inner, pad: 0.12, bg: '#15181d' },
  { file: 'maskable-512.png', size: 512, html: inner, pad: 0.2, bg: '#15181d' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const j of jobs) {
  const box = Math.round(j.size * (1 - j.pad * 2));
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(
    `<html><body style="margin:0;width:${j.size}px;height:${j.size}px;display:grid;place-items:center;background:${j.bg ?? 'transparent'}">` +
      j.html.replace('<svg ', `<svg width="${box}" height="${box}" `) +
      `</body></html>`,
  );
  await page.screenshot({ path: join(root, 'public/icons', j.file), omitBackground: !j.bg });
  console.log('ok', j.file);
}
await browser.close();
