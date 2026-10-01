// Aperçus des liens partagés (Open Graph, X…) : écrit, pour chaque jour, une page HTML statique qui porte ses
// balises de partage. Les robots des réseaux sociaux n'exécutent pas le JavaScript d'Angular : sans ça, tous les
// liens du site afficheraient le même aperçu.
//
// Lancé par `npm run build:pages`, après `ng build`. Pour chaque dossier days/day-NN-mot :
//   - dist/…/day-NN-mot/index.html : l'index de l'app avec le titre, la description (le 1er paragraphe du README)
//     et, si le jour a un `preview-embed.gif`, son image (copiée dans dist/…/previews/).
//   - GitHub Pages sert ce fichier à l'adresse /day-NN-mot/ ; l'app Angular s'y charge normalement.
//
// L'image vient de `npm run gif -- <jour>` (preview-embed.gif, sous 5 Mo : au-delà, X, LinkedIn et Slack l'ignorent).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'devtober', 'browser');
const SITE = (process.env.SITE_URL ?? 'https://damienmarill.github.io/devtober').replace(/\/$/, '');
const SITE_NAME = 'Devtober 2026';

const indexFile = join(DIST, 'index.html');
if (!existsSync(indexFile)) {
  console.error('dist/devtober/browser/index.html est introuvable : lance « ng build » avant ce script.');
  process.exit(1);
}
const baseHtml = readFileSync(indexFile, 'utf8');

const escapeAttr = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Titre et description d'un jour, tirés de son README (`# Jour N : Mot`, puis le premier paragraphe). */
function readDay(slug) {
  const nn = slug.match(/^day-(\d+)-/)[1];
  const readme = existsSync(join(ROOT, 'days', slug, 'README.md')) ? readFileSync(join(ROOT, 'days', slug, 'README.md'), 'utf8') : '';
  const h1 = readme.match(/^#\s+Jour\s+\d+\s*:\s*(.+)$/m);
  const word = h1 ? h1[1].trim() : slug.replace(/^day-\d+-/, '');
  const paragraph = readme
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith('#') && !block.startsWith('![') && !block.startsWith('```'));
  let description = (paragraph ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [texte](lien) -> texte
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (description.length > 200) description = description.slice(0, 199).replace(/\s+\S*$/, '') + '…';
  return { title: `Devtober · ${nn.padStart(2, '0')} ${word}`, description: description || 'Un mot par jour, une création en code.' };
}

/** Dimensions d'un GIF, lues dans son en-tête (octets 6 à 9). */
function gifSize(file) {
  const head = readFileSync(file).subarray(0, 10);
  return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
}

/** Retire les balises du site (titre, description, Open Graph, X, canonical) pour mettre celles du jour. */
function stripShareTags(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
}

let written = 0;
for (const slug of readdirSync(join(ROOT, 'days')).filter((name) => /^day-\d+-/.test(name))) {
  const { title, description } = readDay(slug);
  const url = `${SITE}/${slug}/`;
  const gif = join(ROOT, 'days', slug, 'preview-embed.gif');
  const hasImage = existsSync(gif);

  const tags = [
    `<title>${escapeAttr(title)}</title>`,
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    // L'aperçu est un carré : `summary_large_image` le recadrerait en 2:1 et couperait le bandeau.
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
  ];
  if (hasImage) {
    const image = `${SITE}/previews/${slug}.gif`;
    const { width, height } = gifSize(gif);
    const alt = escapeAttr(`Aperçu animé de ${title}`);
    tags.push(
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:image:type" content="image/gif" />`,
      `<meta property="og:image:width" content="${width}" />`,
      `<meta property="og:image:height" content="${height}" />`,
      `<meta property="og:image:alt" content="${alt}" />`,
      `<meta name="twitter:image" content="${image}" />`,
      `<meta name="twitter:image:alt" content="${alt}" />`,
    );
    mkdirSync(join(DIST, 'previews'), { recursive: true });
    copyFileSync(gif, join(DIST, 'previews', `${slug}.gif`));
  }

  const html = stripShareTags(baseHtml).replace(/<\/head>/i, `    ${tags.join('\n    ')}\n  </head>`);
  mkdirSync(join(DIST, slug), { recursive: true });
  writeFileSync(join(DIST, slug, 'index.html'), html);
  written++;
  console.log(`✔ ${slug}/index.html · ${title}${hasImage ? ' · image ' + (readFileSync(gif).length / 1024 / 1024).toFixed(1) + ' Mo' : ' · sans image (npm run gif -- ' + Number(slug.match(/\d+/)[0]) + ')'}`);
}
console.log(`${written} page(s) de partage écrite(s) pour ${SITE}`);
