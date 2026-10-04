// Socle commun des scripts qui filment ou photographient la page `/capture/<jour>` (gif.mjs, thumbnail.mjs) :
// dossier du jour, build de l'app, petit serveur de dist/ et lancement de Chrome.
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIST = join(ROOT, 'dist', 'devtober', 'browser');

/** Le jour demandé en ligne de commande (`npm run … -- 3`) : numéro, nom du dossier et chemin. Quitte si introuvable. */
export function resolveDay(args, usage) {
  const dayNumber = Number(args.find((a) => /^\d+$/.test(a)));
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
    console.error(usage);
    process.exit(1);
  }
  const nn = String(dayNumber).padStart(2, '0');
  const slug = readdirSync(join(ROOT, 'days')).find((name) => name.startsWith(`day-${nn}-`));
  if (!slug) {
    console.error(`Aucun dossier days/day-${nn}-… : crée-le avec « npm run new-day -- ${dayNumber} ».`);
    process.exit(1);
  }
  return { dayNumber, slug, dayDir: join(ROOT, 'days', slug) };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Sert dist/ avec le repli SPA (toute adresse sans fichier renvoie index.html, comme sur GitHub Pages). */
export function serveDist() {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = normalize(join(DIST, pathname));
      if (!file.startsWith(DIST + sep) && file !== DIST) file = join(DIST, 'index.html');
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => done({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** Construit l'app (`ng build`) sauf si `skipBuild` et qu'un build existe déjà. */
export function ensureBuild(skipBuild) {
  if (skipBuild && existsSync(join(DIST, 'index.html'))) return;
  console.log("→ Construction de l'app (ng build)…");
  // `ng` lancé par Node directement : pas de shell, donc pas d'arguments à échapper.
  const ng = join(ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  const build = spawnSync(process.execPath, [ng, 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

/** Adresse de l'app à filmer : `--url` si fourni, sinon dist/ servi en local (`server` à fermer ensuite). */
export async function openApp({ url, skipBuild }) {
  if (url) return { server: undefined, baseUrl: url.replace(/\/$/, '') };
  ensureBuild(skipBuild);
  const { server, url: local } = await serveDist();
  return { server, baseUrl: local };
}

/** Lance Google Chrome ; le clic de la capture fournit le geste exigé par l'autoplay, le son est coupé. */
export async function launchChrome(server) {
  try {
    return await chromium.launch({
      channel: 'chrome',
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    });
  } catch (error) {
    console.error(`Impossible de lancer Google Chrome (${error.message.split('\n')[0]}). Installe Chrome, ou adapte « channel » dans scripts/lib/capture-env.mjs.`);
    server?.close();
    process.exit(1);
  }
}

/** Charge `/capture/<jour>`, attend que le jour soit prêt et renvoie ses réglages (attributs `data-*` de `#capture`). */
export async function loadCapture(page, baseUrl, slug) {
  console.log(`→ Chargement de ${baseUrl}/capture/${slug}`);
  await page.goto(`${baseUrl}/capture/${slug}`);
  await page.waitForSelector('#capture[data-ready="true"]', { timeout: 30_000 });
  const cfg = await page.$eval('#capture', (el) => ({
    seconds: Number(el.dataset.seconds),
    settle: Number(el.dataset.settle),
    thumbnailFocus: el.dataset.thumbnailFocus === undefined ? null : Number(el.dataset.thumbnailFocus),
    thumbnailAt: el.dataset.thumbnailAt === undefined ? null : Number(el.dataset.thumbnailAt),
    click: el.dataset.clickX === undefined ? null : { x: Number(el.dataset.clickX), y: Number(el.dataset.clickY) },
    key: el.dataset.key ?? null,
  }));
  await page.waitForTimeout(cfg.settle);
  return cfg;
}

/** Lance l'animation : clic et/ou touche du registre. Renvoie vrai si l'un des deux existe. */
export async function trigger(page, cfg) {
  if (cfg.click) {
    console.log(`→ Clic en (${cfg.click.x}, ${cfg.click.y})`);
    await page.mouse.click(cfg.click.x, cfg.click.y);
  }
  if (cfg.key) {
    console.log(`→ Touche « ${cfg.key} »`);
    await page.keyboard.press(cfg.key);
  }
  if (!cfg.click && !cfg.key) {
    console.log('→ Ni clic ni touche définis : on filme dès que la page est chargée');
  }
}
