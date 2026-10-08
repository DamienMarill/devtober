/** Dates administratives jj/mm/aaaa, calculées en UTC (pas de fuseau ni d'heure d'été au guichet). */
export function parseDate(text: string): Date {
  const [d, m, y] = text.split('/').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

export function addDays(text: string, days: number): string {
  const date = parseDate(text);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return formatDate(date);
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « lundi 5 octobre 2026 ». */
export function longDate(text: string): string {
  const date = parseDate(text);
  return `${JOURS[date.getUTCDay()]} ${date.getUTCDate()} ${MOIS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Les trois molettes du dateur : jour, mois, année. */
export function splitDate(text: string): [number, number, number] {
  const [d, m, y] = text.split('/').map(Number);
  return [d, m, y];
}

export function joinDate([d, m, y]: readonly [number, number, number]): string {
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
