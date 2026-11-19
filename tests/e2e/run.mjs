// Teste das telas num celular simulado (Pixel 7), sem internet: tudo de fora é respondido com conteúdo de exemplo.
// Uso: npm run build && node tests/e2e/run.mjs [pasta-das-fotos]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as D from './dados.mjs';
import { routes as baseRoutes } from './rotas.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = process.argv[2] || join(root, 'test-results', 'telas');
mkdirSync(shots, { recursive: true });
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}

const epub = await D.makeEpub();
const routes = (ctx) => baseRoutes(ctx, BASE, epub);
const failures = [];
const problems = [];
let step = 0;

function check(cond, what) {
  if (!cond) failures.push(what);
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + what);
}

function watch(page, label) {
  page.on('pageerror', (e) => problems.push(`${label}: erro na página: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|ERR_FAILED|404/.test(t)) return; // capas do Gutenberg respondem 404 de propósito
    problems.push(`${label}: console: ${t}`);
  });
}

async function shot(page, name) {
  step++;
  const file = join(shots, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** Nenhuma tela pode ter rolagem para o lado. */
async function noSideScroll(page, what) {
  const r = await page.evaluate(() => {
    const screens = [...document.querySelectorAll('.screen')];
    const top = screens[screens.length - 1];
    if (!top) return { ok: true };
    const bad = [...top.querySelectorAll('*')].filter((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width) return false;
      if (el.closest('.row-scroll, .chips, .reader, .epub-host')) return false;
      return b.right > innerWidth + 1 || b.left < -1;
    });
    return { ok: top.scrollWidth <= top.clientWidth + 1 && bad.length === 0, extra: bad.slice(0, 3).map((e) => e.className || e.tagName) };
  });
  check(r.ok, `sem rolagem para o lado: ${what}${r.ok ? '' : ' ' + JSON.stringify(r.extra)}`);
}

const topScreen = (page) => page.locator('.screen').last();

async function squareCenter(page, sq, orientation) {
  const box = await topScreen(page).locator('cg-board').boundingBox();
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  const x = orientation === 'white' ? file : 7 - file;
  const y = orientation === 'white' ? 7 - rank : rank;
  return { x: box.x + (x + 0.5) * (box.width / 8), y: box.y + (y + 0.5) * (box.height / 8) };
}

async function playMove(page, from, to, orientation) {
  const a = await squareCenter(page, from, orientation);
  const b = await squareCenter(page, to, orientation);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(120);
  await page.mouse.click(b.x, b.y);
}

const browser = await chromium.launch();
const phone = { ...devices['Pixel 7'], locale: 'pt-BR', timezoneId: 'America/Fortaleza', serviceWorkers: 'block' };

/* ------------------------------------------------- 1. primeira abertura */
{
  const ctx = await browser.newContext(phone);
  await routes(ctx);
  const page = await ctx.newPage();
  watch(page, 'primeira abertura');
  await page.goto(BASE);
  await page.waitForTimeout(950);
  await shot(page, 'abertura-desenhando');
  await page.waitForTimeout(900);
  await shot(page, 'abertura-nome');
  await page.locator('.splash').waitFor({ state: 'detached', timeout: 4000 });
  check(true, 'animação de abertura termina sozinha');
  await page.getByRole('heading', { name: 'Do que você gosta?' }).waitFor();
  await shot(page, 'boas-vindas');
  const go = page.getByRole('button', { name: /Escolha mais 3/ });
  check(await go.isDisabled(), 'botão começar travado até escolher 3 assuntos');
  for (const n of ['Tecnologia', 'Ciência', 'Xadrez', 'Games']) await page.getByRole('button', { name: n, exact: true }).click();
  await page.getByPlaceholder('Outro assunto').fill('Minecraft');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  check(await page.getByRole('button', { name: 'Minecraft', exact: true }).getAttribute('aria-pressed') === 'true', 'assunto próprio entra marcado');
  await page.getByRole('button', { name: 'Começar' }).click();

  /* tela inicial */
  await page.locator('.ncard').first().waitFor({ timeout: 8000 });
  await page.locator('.pcard').first().waitFor({ timeout: 8000 });
  await page.locator('.tile cg-board').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  await shot(page, 'inicio');
  const order = await page.locator('.section h2').allTextContents();
  check(JSON.stringify(order) === JSON.stringify(['Xadrez', 'Livros', 'Notícias', 'Bluesky']), 'ordem do desenho: Xadrez, Livros, Notícias, Bluesky (' + order.join(', ') + ')');
  check((await page.locator('.chess-tiles .tile').count()) === 2, 'dois quadrados do xadrez');
  check((await page.locator('.section').nth(1).locator('.cover').count()) >= 4, 'estante com pelo menos 4 capas');
  await noSideScroll(page, 'início');
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 420));
  await page.waitForTimeout(300);
  await shot(page, 'inicio-rolado');

  /* notícias */
  await page.locator('.section').nth(2).getByRole('button', { name: /Ver todas/ }).click();
  await page.locator('.nrow').first().waitFor();
  await shot(page, 'noticias');
  await noSideScroll(page, 'notícias');
  await page.locator('.nrow').first().click();
  await page.locator('.reading').last().waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'materia');
  await noSideScroll(page, 'matéria');
  await page.goBack();
  await page.goBack();
  await page.waitForTimeout(400);
  check((await page.locator('.screen').count()) === 1, 'voltar do celular fecha as telas uma a uma');

  /* bluesky */
  await page.locator('.section').nth(3).getByRole('button', { name: /Descobrir/ }).click();
  await page.locator('.post').first().waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'bluesky');
  await noSideScroll(page, 'bluesky');
  await topScreen(page).locator('.post .post-text').first().click();
  await page.locator('.thread-main').waitFor();
  await shot(page, 'bluesky-post');
  await page.goBack();
  await page.goBack();
  await page.waitForTimeout(300);

  /* problema do dia */
  await page.getByRole('button', { name: 'Problema do dia' }).click();
  await topScreen(page).locator('cg-board').waitFor();
  await page.waitForTimeout(400);
  await shot(page, 'problema');
  await playMove(page, 'g2', 'e4', 'black');
  await page.waitForTimeout(900);
  await playMove(page, 'd4', 'f3', 'black');
  await page.waitForTimeout(500);
  const status = await topScreen(page).locator('.status-line').textContent();
  check(/Resolvido de primeira/.test(status ?? ''), 'resolve o problema com os lances certos (' + status + ')');
  await shot(page, 'problema-resolvido');
  await page.goBack();
  await page.waitForTimeout(300);
  check(/Resolvido/.test(await page.locator('.tile-cap').first().textContent()), 'quadrado do início mostra "Resolvido"');

  /* xadrez sem conta */
  await page.locator('.section').first().getByRole('button', { name: /Abrir/ }).click();
  await page.getByRole('button', { name: 'Entrar com o Lichess' }).waitFor();
  await shot(page, 'xadrez-sem-conta');
  await page.goBack();
  await page.waitForTimeout(300);

  /* livros */
  await page.locator('.section').nth(1).getByRole('button', { name: /Ver clássicos|Estante/ }).click();
  await page.locator('.book-row').first().waitFor();
  await shot(page, 'livros');
  await noSideScroll(page, 'livros');
  await topScreen(page).locator('input[type=file]').setInputFiles({ name: 'livro-de-exemplo.epub', mimeType: 'application/epub+zip', buffer: epub });
  await page.getByText('está na sua estante').waitFor({ timeout: 8000 });
  await topScreen(page).locator('.book-grid .cover').first().waitFor();
  check((await topScreen(page).locator('.book-grid .cover').count()) === 1, 'ePub importado aparece na estante');
  await topScreen(page).locator('.book-grid .cover-img').first().click();
  await page.locator('.reader iframe').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot(page, 'leitor');
  const frameText = async () => page.frameLocator('.reader iframe').locator('body').innerText();
  check(/farol/.test(await frameText()), 'leitor mostra o texto do livro');
  const vw = page.viewportSize().width;
  const vh = page.viewportSize().height;
  const scrollX = () => page.locator('.epub-container').evaluate((el) => el.scrollLeft);
  const before = await scrollX();
  await page.mouse.click(vw * 0.88, vh * 0.5);
  await page.waitForTimeout(700);
  const after = await scrollX();
  await shot(page, 'leitor-pagina-2');
  check(after > before, `toque à direita vira a página (${before} -> ${after})`);
  await page.mouse.click(vw * 0.1, vh * 0.5);
  await page.waitForTimeout(600);
  check((await scrollX()) === before, 'toque à esquerda volta a página');
  await page.mouse.click(vw * 0.88, vh * 0.5);
  await page.waitForTimeout(600);
  await page.mouse.click(vw * 0.5, vh * 0.5);
  await page.waitForTimeout(400);
  await shot(page, 'leitor-controles');
  await page.getByRole('button', { name: 'Capítulos' }).click();
  await page.getByRole('button', { name: /Capítulo 3/ }).click();
  await page.waitForTimeout(900);
  check(/carta/.test(await frameText()), 'índice leva ao capítulo 3');
  await page.mouse.click(vw * 0.5, vh * 0.5);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Texto e cores' }).click();
  await page.getByRole('button', { name: 'Sépia' }).click();
  await page.getByRole('button', { name: 'Letra maior' }).click();
  await page.waitForTimeout(500);
  await shot(page, 'leitor-ajuste-texto');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.mouse.click(vw * 0.5, vh * 0.5);
  await page.waitForTimeout(300);
  await shot(page, 'leitor-sepia');
  await page.goBack();
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mural:livros') || '[]')[0]);
  check(!!saved?.cfi, 'posição de leitura guardada (' + (saved?.chapter ?? '') + ')');

  /* baixar um clássico */
  await topScreen(page).locator('.book-row').first().click();
  await page.locator('.reader iframe').waitFor({ timeout: 10000 });
  check(true, 'baixar um clássico abre no leitor');
  await page.goBack();
  await page.waitForTimeout(400);
  await page.goBack();
  await page.waitForTimeout(400);
  await shot(page, 'inicio-com-livros');

  /* ajustes */
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('heading', { name: 'Ajustes' }).waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'ajustes');
  await noSideScroll(page, 'ajustes');
  await topScreen(page).evaluate((el) => el.scrollTo(0, 1050));
  await page.waitForTimeout(200);
  await shot(page, 'ajustes-2');
  await topScreen(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(200);
  await shot(page, 'ajustes-3');
  await page.getByRole('button', { name: 'Claro', exact: true }).click();
  await page.waitForTimeout(200);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'claro', 'tema claro liga');
  await page.goBack();
  await page.waitForTimeout(400);
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 0));
  await shot(page, 'inicio-claro');
  await ctx.close();
}

/* ----------------------------------------- 2. com conta no Lichess */
{
  const ctx = await browser.newContext(phone);
  await routes(ctx);
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('mural:prefs', JSON.stringify({ onboarded: true, interests: ['tecnologia', 'xadrez', 'games'], splash: false }));
    localStorage.setItem('mural:lichess', JSON.stringify({ token: 'token-de-exemplo', username: 'Exemplo' }));
  });
  const page = await ctx.newPage();
  watch(page, 'com Lichess');
  await page.goto(BASE);
  await page.locator('.tile cg-board').nth(1).waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  check(/Sua vez/.test(await page.locator('.tile-cap').nth(1).textContent()), 'quadrado mostra a partida em andamento');
  await shot(page, 'inicio-com-partida');
  await page.getByRole('button', { name: 'Continuar a partida' }).click();
  await topScreen(page).locator('cg-board').waitFor();
  await page.waitForTimeout(500);
  await shot(page, 'partida');
  check(/Sua vez/.test(await topScreen(page).locator('.status-line').textContent()), 'partida carregada pelo Lichess, sua vez');
  await page.goBack();
  await page.waitForTimeout(300);
  await page.locator('.section').first().getByRole('button', { name: /Abrir/ }).click();
  await page.getByText('Jogar contra o computador').waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'xadrez-com-conta');
  await topScreen(page).getByRole('button', { name: /Suas últimas partidas/ }).click();
  await page.locator('.game-row').first().waitFor();
  await shot(page, 'partidas');
  await ctx.close();
}

await browser.close();
stop();

writeFileSync(join(shots, 'resultado.json'), JSON.stringify({ failures, problems }, null, 2));
console.log('\nproblemas no console:', problems.length ? '\n' + problems.join('\n') : 'nenhum');
console.log(failures.length ? `\n${failures.length} FALHA(S)` : '\ntudo certo');
process.exit(failures.length || problems.length ? 1 : 0);
