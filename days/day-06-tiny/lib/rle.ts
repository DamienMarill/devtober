/** Un motif : un rectangle d'états, ligne par ligne. */
export interface Pattern {
  width: number;
  height: number;
  cells: Uint8Array;
}

/** Un motif lu d'un fichier RLE, avec la règle de son en-tête si elle y est. */
export interface RlePattern extends Pattern {
  rule: string | null;
}

/** Valeur d'une balise d'état : `b`/`.` = 0, `o` = 1, `A`–`X` = 1–24, `pA`–`yO` = 25–255. */
function stateOf(prefix: string, letter: string): number | null {
  if (!prefix) {
    if (letter === 'b' || letter === '.') return 0;
    if (letter === 'o') return 1;
    if (letter >= 'A' && letter <= 'X') return letter.charCodeAt(0) - 64;
    return null;
  }
  if (letter < 'A' || letter > 'X') return null;
  const state = (prefix.charCodeAt(0) - 111) * 24 + letter.charCodeAt(0) - 64;
  return state <= 255 ? state : null;
}

/**
 * Lit le format RLE (Run Length Encoded) de LifeWiki et Golly :
 *
 * ```
 * #N Planeur
 * x = 3, y = 3, rule = B3/S23
 * bob$2bo$3o!
 * ```
 *
 * Les lignes `#` sont des commentaires ; l'en-tête est facultatif (le corps seul est accepté, la taille est
 * alors celle du motif). Un nombre devant une balise la répète, y compris `$` (fin de ligne). Tout ce qui suit
 * `!` est ignoré. Renvoie null si le texte n'est pas du RLE.
 */
export function parseRle(text: string): RlePattern | null {
  let width = 0;
  let height = 0;
  let rule: string | null = null;
  const body: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const header = /^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)(?:\s*,\s*rule\s*=\s*([^\s,]+))?/i.exec(line);
    if (header && !body.length) {
      width = Number(header[1]);
      height = Number(header[2]);
      rule = header[3]?.split(':')[0] ?? null;
      continue;
    }
    body.push(line);
  }

  const rows: number[][] = [[]];
  let run = '';
  let prefix = '';
  let ended = false;
  for (const c of body.join('')) {
    if (ended) break;
    if (c >= '0' && c <= '9') {
      if (prefix) return null;
      run += c;
      continue;
    }
    const count = run ? Number(run) : 1;
    run = '';
    if (c === '!') {
      ended = true;
    } else if (c === '$') {
      for (let i = 0; i < count; i++) rows.push([]);
    } else if (c >= 'p' && c <= 'y') {
      prefix = c;
      run = count > 1 ? String(count) : '';
    } else if (/\s/.test(c)) {
      continue;
    } else {
      const state = stateOf(prefix, c);
      prefix = '';
      if (state === null) return null;
      const row = rows[rows.length - 1];
      for (let i = 0; i < count; i++) row.push(state);
    }
  }
  while (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();

  width = Math.max(width, ...rows.map((r) => r.length));
  height = Math.max(height, rows.length);
  if (!width || !height) return null;
  const cells = new Uint8Array(width * height);
  rows.forEach((row, y) => row.forEach((s, x) => (cells[y * width + x] = s)));
  return { width, height, rule, cells };
}

/**
 * Écrit le corps RLE d'un motif à deux états (ce qui n'est pas 1 compte comme mort) : `bob$2bo$3o!`.
 * Les morts en fin de ligne et les lignes vides de la fin sont omis, comme le veut le format.
 */
export function encodeRle(pattern: Pattern): string {
  const { width, height, cells } = pattern;
  const tokens: string[] = [];
  const push = (count: number, tag: string) => {
    if (count > 0) tokens.push(count > 1 ? `${count}${tag}` : tag);
  };
  let pendingRows = 0;
  for (let y = 0; y < height; y++) {
    let last = -1;
    for (let x = 0; x < width; x++) if (cells[y * width + x] === 1) last = x;
    if (last < 0) {
      pendingRows++;
      continue;
    }
    if (tokens.length) push(pendingRows + 1, '$');
    else push(pendingRows, '$');
    pendingRows = 0;
    let x = 0;
    while (x <= last) {
      const alive = cells[y * width + x] === 1;
      let n = 0;
      while (x <= last && (cells[y * width + x] === 1) === alive) {
        n++;
        x++;
      }
      push(n, alive ? 'o' : 'b');
    }
  }
  return `${tokens.join('')}!`;
}

/** Le plus petit rectangle qui contient les cellules vivantes, ou null si tout est mort. */
export function boundingBox(
  cells: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y * width + x] !== 1) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Découpe un rectangle d'une grille. */
export function crop(
  cells: Uint8Array,
  width: number,
  box: { x: number; y: number; width: number; height: number },
): Pattern {
  const out = new Uint8Array(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      out[y * box.width + x] = cells[(box.y + y) * width + box.x + x];
    }
  }
  return { width: box.width, height: box.height, cells: out };
}
