/**
 * Le modèle des Dérapawards : les types du JSON (`derapawards-2026.json`) et les fonctions pures qui
 * en tirent ce que la page affiche. Tout le contenu vient du JSON ; ici, rien n'est écrit en dur sauf
 * les libellés de catégories.
 */

export const CRITERES = ['gravite', 'exposition', 'absurdite', 'excuses', 'recidive'] as const;
export type Critere = (typeof CRITERES)[number];

export interface Kilometrage {
  /** Note sur 10 : somme des cinq critères (minimum 1). */
  note: number;
  detail: Record<Critere, number>;
  justification: string;
}

export interface Citation {
  texte: string;
  source: string;
}

export interface LienHorsMois {
  sens: 'declenche' | 'declenchePar';
  mois: string;
  description: string;
}

export interface Candidat {
  id: string;
  titre: string;
  /** Date ISO (AAAA-MM-JJ). */
  date: string;
  qui: string;
  categorie: string;
  bord: string | null;
  citation: Citation | null;
  faits: string;
  statut: string;
  suites: string;
  /** Ids des dérapages que celui-ci a provoqués / qui l'ont provoqué. */
  declenchePar: string[];
  declenche: string[];
  liensHorsMois?: LienHorsMois[];
  /** Commentaire éditorial (optionnel) : une punchline affichée sur la fiche. */
  punchline?: string;
  /** Image d'illustration (optionnelle) : l'image de partage d'un article cité, et l'article. */
  image?: { url: string; source: string };
  kilometrage: Kilometrage;
  sources: string[];
}

export interface Mois {
  /** AAAA-MM */
  mois: string;
  /** Mois en cours : résultats provisoires, hors concours. */
  provisoire?: boolean;
  /** Ids du podium, dans l'ordre : lauréat, accessit d'argent, prix de bronze. */
  top3: string[];
  justificationTop3: string;
  /** Commentaire éditorial (optionnel) : une punchline affichée avec le lauréat du mois. */
  punchline?: string;
  candidats: Candidat[];
}

export interface Awards {
  meta: { titre: string; genere: string; verification?: string; note?: string };
  grille: {
    criteres: string[];
    bareme: Record<Critere, string>;
    calcul: string;
  };
  mois: Mois[];
}

/** Un candidat, avec le mois où il concourt (utile pour les liens d'un mois à l'autre). */
export interface Place {
  candidat: Candidat;
  mois: Mois;
}

const CATEGORIES: Record<string, string> = {
  'politique-fr': 'Politique française',
  'politique-intl': 'Politique internationale',
  'tech-ia': 'Tech & IA',
  sport: 'Sport',
  'medias-people': 'Médias & people',
  entreprise: 'Entreprise',
};

const BORDS: Record<string, string> = {
  gouvernement: 'Gouvernement',
  'RN-extreme-droite': 'RN / extrême droite',
  'bloc-central': 'Bloc central',
  LFI: 'LFI',
  'gauche-PS-eco-PCF': 'Gauche (PS, écolos, PCF)',
  'LR-droite': 'LR / droite',
  autre: 'Autre',
};

export const CRITERE_LABELS: Record<Critere, string> = {
  gravite: 'Gravité',
  exposition: 'Exposition',
  absurdite: 'Absurdité',
  excuses: 'Excuses',
  recidive: 'Récidive',
};

/** Libellé lisible d'une catégorie ; une catégorie inconnue (ajoutée dans le JSON) est affichée telle quelle. */
export const categorieLabel = (c: string) => CATEGORIES[c] ?? c;
export const bordLabel = (b: string) => BORDS[b] ?? b;

const ROMANS: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function roman(n: number): string {
  let rest = n;
  let out = '';
  for (const [value, symbol] of ROMANS) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

/** « 2026-03 » -> « mars 2026 ». */
export function monthLabel(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

/** « 2026-03 » -> « mars ». */
export function monthName(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date(y, m - 1, 1));
}

/** « 2026-03 » -> « mars », « 2026-07 » -> « juil. » (pour les pastilles de la barre des mois). */
export function monthShort(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(y, m - 1, 1));
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « 2026-03-14 » -> « 14 mars 2026 ». */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, d),
  );
}

/** Numéro de la cérémonie d'un mois : janvier est la première. */
export const ceremonyNumber = (awards: Awards, mois: string) =>
  awards.mois.findIndex((m) => m.mois === mois) + 1;

export const findMois = (awards: Awards, mois: string | null | undefined) =>
  awards.mois.find((m) => m.mois === mois);

/** Le podium d'un mois, dans l'ordre du `top3` du JSON. */
export function podium(mois: Mois): Candidat[] {
  return mois.top3
    .map((id) => mois.candidats.find((c) => c.id === id))
    .filter((c): c is Candidat => !!c);
}

/** Les mentions honorables : tout sauf le podium, du plus grand kilométrage au plus petit, puis du plus récent. */
export function mentions(mois: Mois): Candidat[] {
  const top = new Set(mois.top3);
  return mois.candidats
    .filter((c) => !top.has(c.id))
    .sort((a, b) => b.kilometrage.note - a.kilometrage.note || b.date.localeCompare(a.date));
}

/** Retrouve un candidat dans tout le palmarès. */
export function findCandidat(awards: Awards, id: string): Place | undefined {
  for (const mois of awards.mois) {
    const candidat = mois.candidats.find((c) => c.id === id);
    if (candidat) return { candidat, mois };
  }
  return undefined;
}

/** Nom du dérapeur, sans les précisions entre parenthèses ni les co-auteurs : « Donald Trump, président… » -> « Donald Trump ». */
export function shortName(qui: string): string {
  return qui.split(/[;,(]/)[0].trim();
}

/** Domaine d'une source, pour l'afficher : « https://www.lcp.fr/a/b » -> « lcp.fr ». */
export function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Cherche les incohérences du JSON, pour les retrouver avant de publier (liste vide : tout va bien). */
export function checkAwards(awards: Awards): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const mois of awards.mois) {
    for (const c of mois.candidats) {
      if (ids.has(c.id)) problems.push(`id en double : ${c.id}`);
      ids.add(c.id);
    }
  }
  for (const mois of awards.mois) {
    const here = new Set(mois.candidats.map((c) => c.id));
    for (const id of mois.top3) {
      if (!here.has(id)) problems.push(`${mois.mois} : le top 3 cite « ${id} », absent des candidats`);
    }
    for (const c of mois.candidats) {
      const somme = CRITERES.reduce((total, k) => total + (c.kilometrage.detail[k] ?? 0), 0);
      if (c.kilometrage.note !== Math.max(1, somme)) {
        problems.push(`${c.id} : note ${c.kilometrage.note} ≠ somme des critères ${somme}`);
      }
      for (const lien of [...c.declenche, ...c.declenchePar]) {
        if (!ids.has(lien)) problems.push(`${c.id} : lien vers « ${lien} », inconnu`);
      }
    }
  }
  return problems;
}
