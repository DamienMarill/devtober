// Crée le dossier d'un jour du Devtober et l'enregistre dans le routing.
// Usage : npm run new-day -- 3        (sans argument : le jour d'aujourd'hui)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORDS = [
  'Pulse',
  'Loop',
  'Bloom',
  'Drift',
  'Chaos',
  'Tiny',
  'Swarm',
  'Maze',
  'Gravity',
  'Fold',
  'Ripple',
  'Lost',
  'Tangle',
  'Bounce',
  'Shadow',
  'Tide',
  'Orbit',
  'Glitch',
  'Echo',
  'Fragile',
  'Signal',
  'Mirror',
  'Spark',
  'Hidden',
  'Melt',
  'Machine',
  'Haunted',
  'Grow',
  'Infinite',
  'Collapse',
  'Wake',
];

const n = Number(process.argv[2] ?? new Date().getDate());
if (!Number.isInteger(n) || n < 1 || n > 31) {
  console.error('Numéro de jour invalide (1 à 31).');
  process.exit(1);
}

const word = WORDS[n - 1];
const nn = String(n).padStart(2, '0');
const slug = `day-${nn}-${word.toLowerCase()}`;
const className = `Day${nn}${word}`;
const daysDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'days');
const dir = join(daysDir, slug);

if (existsSync(dir)) {
  console.error(`${slug} existe déjà.`);
  process.exit(1);
}
mkdirSync(dir);

writeFileSync(
  join(dir, `${slug}.ts`),
  `import { Component } from '@angular/core';

@Component({
  selector: 'app-${slug}',
  host: { class: 'grid size-full place-items-center' },
  template: \`<p class="text-muted-foreground text-2xl">${word}</p>\`,
})
export default class ${className} {}
`,
);

writeFileSync(
  join(dir, 'README.md'),
  `# Jour ${n} : ${word}

<!-- Squelette : demande à Claude Code « documente le jour ${n} » (skill day-readme) pour le remplir à partir du code. -->

## L'idée

## Comment c'est codé

## Lien avec le mot

## Pour aller plus loin
`,
);

const registry = join(daysDir, 'registry.ts');
const marker = '  // new-day:insert';
const line = `  ${n}: {
    component: () => import('./${slug}/${slug}').then((m) => m.default),
    readme: () => import('./${slug}/README.md').then((m) => m.default),
    capture: { click: null, seconds: 10 },
  },
`;
writeFileSync(registry, readFileSync(registry, 'utf8').replace(marker, line + marker));

console.log(`✔ days/${slug} créé et ajouté au routing → http://localhost:4200/${slug}`);
console.log(`  GIF d'aperçu : règle « capture » dans days/registry.ts puis npm run gif -- ${n}`);
