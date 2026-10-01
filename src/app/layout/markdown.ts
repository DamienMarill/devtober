import { Marked, type Tokens } from 'marked';

const REPO = 'DamienMarill/devtober';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main/`;
const BLOB_BASE = `https://github.com/${REPO}/blob/main/`;

const isRelative = (href: string) => !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href);

/** Résout `href` par rapport au dossier `dir` du repo (gère `./` et `../`). */
function repoPath(dir: string, href: string): string {
  const base = `https://repo.local/${dir ? `${dir}/` : ''}`;
  const url = new URL(href, base);
  return url.pathname.slice(1) + url.search + url.hash;
}

/**
 * Convertit un README en HTML pour la modale.
 * Les chemins relatifs (images, liens vers le code) pointent vers GitHub,
 * puisque le site ne sert pas les fichiers source du repo.
 *
 * @param dir dossier du README dans le repo, ex: `days/day-01-pulse` ('' pour la racine)
 */
export function renderReadme(markdown: string, dir: string): string {
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type !== 'link' && token.type !== 'image') return;
      const t = token as Tokens.Link | Tokens.Image;
      if (!isRelative(t.href)) return;
      t.href = (token.type === 'image' ? RAW_BASE : BLOB_BASE) + repoPath(dir, t.href);
    },
    renderer: {
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const external = !href.startsWith('#');
        return `<a href="${href}"${title ? ` title="${title}"` : ''}${
          external ? ' target="_blank" rel="noopener"' : ''
        }>${text}</a>`;
      },
    },
  });
  return marked.parse(markdown, { async: false });
}
