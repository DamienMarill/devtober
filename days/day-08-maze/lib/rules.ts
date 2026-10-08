import { textOf } from './actions';
import { CONFIG } from './config';
import type { Dossier, Exigence, Field, Piece, Print, Pt, Rect, StampId, Stroke } from './model';
import { similarity, strokesLength } from './signature';

/**
 * La validation : une fonction pure par geste, qui prend l'état des pièces et rend `null` (conforme) ou un motif.
 * Les motifs vont tels quels sur les fiches de retour : « Ligne 2 : tampon hors cadre ».
 */
export interface RuleContext {
  specimen: Pt[][] | null;
  seuilSignature: number;
  toleranceTampon: number;
  toleranceRotation: number;
}

export const DEFAULT_RULES: Omit<RuleContext, 'specimen'> = {
  seuilSignature: CONFIG.signature.seuil,
  toleranceTampon: CONFIG.tampon.tolerance,
  toleranceRotation: CONFIG.tampon.toleranceRotation,
};

export const STAMP_LABEL: Record<StampId, string> = {
  VU: 'VU',
  RECU_LE: 'REÇU LE',
  CONFORME: 'CONFORME',
  APPROUVE: 'APPROUVÉ',
  IRRECEVABLE: 'IRRECEVABLE',
  ANNULE: 'ANNULÉ',
};

export const expand = (r: Rect, m: number): Rect => ({
  x: r.x - m,
  y: r.y - m,
  w: r.w + 2 * m,
  h: r.h + 2 * m,
});
export const inRect = (p: Pt, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Écart d'angle ramené dans [-180, 180]. */
export function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Une empreinte recouverte, après coup, par un ANNULÉ net (mémo n° 4). */
export function neutralized(piece: Piece, print: Print): boolean {
  return piece.prints.some(
    (q) =>
      q.stamp === 'ANNULE' &&
      q.nette &&
      q.face === print.face &&
      q.seq > print.seq &&
      Math.hypot(q.x - print.x, q.y - print.y) <= CONFIG.tampon.rayonAnnule,
  );
}

/** Les empreintes encore valables dont le centre tombe dans le cadre (ANNULÉ exclus : il neutralise). */
export function activePrintsIn(piece: Piece, field: Field, tolerance: number): Print[] {
  const zone = expand(field.rect, tolerance);
  return piece.prints.filter(
    (p) =>
      p.face === field.face && p.stamp !== 'ANNULE' && inRect(p, zone) && !neutralized(piece, p),
  );
}

interface StampSpec {
  tampon: StampId;
  rotation?: number;
  date?: string;
  encre?: Exigence['encre'];
  superposes?: number;
}

/** Ce qui ne va pas avec une empreinte attendue, ou null. */
function printFault(p: Print, spec: StampSpec, ctx: Omit<RuleContext, 'specimen'>): string | null {
  if (p.stamp !== spec.tampon)
    return `mauvais tampon (${STAMP_LABEL[p.stamp]} au lieu de ${STAMP_LABEL[spec.tampon]})`;
  if (!p.nette) return 'empreinte illisible, tampon mal encré';
  const rot = spec.rotation ?? 0;
  if (Math.abs(angleDiff(p.rot, rot)) > ctx.toleranceRotation) {
    return `tampon de travers (${Math.round(((p.rot % 360) + 360) % 360)}° au lieu de ${rot}°)`;
  }
  if (spec.encre && p.ink !== spec.encre) return `encre ${p.ink} au lieu de ${spec.encre}`;
  if (spec.tampon === 'RECU_LE' && spec.date && p.date !== spec.date) {
    return `date du REÇU LE erronée (${p.date} au lieu du ${spec.date})`;
  }
  return null;
}

export function checkStamp(
  piece: Piece,
  field: Field,
  spec: StampSpec,
  ctx: Omit<RuleContext, 'specimen'>,
): string | null {
  const active = activePrintsIn(piece, field, ctx.toleranceTampon);
  const faults = active.map((p) => printFault(p, spec, ctx));
  const bad = faults.find((f) => f !== null);
  if (bad) return bad;
  const good = active.filter((_, i) => faults[i] === null);
  if (good.length === 0) {
    const outside = piece.prints.some(
      (p) => p.stamp === spec.tampon && p.face === field.face && !neutralized(piece, p),
    );
    return outside ? 'tampon hors cadre' : `tampon ${STAMP_LABEL[spec.tampon]} absent`;
  }
  const k = spec.superposes ?? 1;
  if (k > 1) {
    const cx = good.reduce((s, p) => s + p.x, 0) / good.length;
    const cy = good.reduce((s, p) => s + p.y, 0) / good.length;
    const tight = good.filter(
      (p) => Math.hypot(p.x - cx, p.y - cy) <= CONFIG.tampon.toleranceSuperposition,
    );
    if (good.length < k) return `${k} empreintes superposées exigées (${good.length} sur ${k})`;
    if (tight.length < good.length) return 'empreintes mal superposées';
  }
  return null;
}

/** Les traits d'une signature : le dernier groupe dont la moitié des points tombe dans le cadre. */
export function signatureGroup(piece: Piece, field: Field): Stroke[] | null {
  const zone = expand(field.rect, 6);
  const groups = new Map<number, Stroke[]>();
  for (const s of piece.strokes) {
    if (s.face !== field.face) continue;
    const list = groups.get(s.groupe) ?? [];
    list.push(s);
    groups.set(s.groupe, list);
  }
  let best: Stroke[] | null = null;
  let bestSeq = -1;
  for (const list of groups.values()) {
    const pts = list.flatMap((s) => s.points);
    const inside = pts.filter((p) => inRect(p, zone)).length;
    if (pts.length === 0 || inside / pts.length < 0.5) continue;
    const seq = Math.max(...list.map((s) => s.seq));
    if (seq > bestSeq) {
      bestSeq = seq;
      best = list;
    }
  }
  return best ? [...best].sort((a, b) => a.seq - b.seq) : null;
}

function checkSignature(
  ex: Exigence,
  piece: Piece,
  field: Field,
  pieces: ReadonlyMap<string, Piece>,
  ctx: RuleContext,
): string | null {
  const group = signatureGroup(piece, field);
  if (!group) return `signature absente (${field.label})`;
  const pts = group.flatMap((s) => s.points);
  const zone = expand(field.rect, 4);
  if (pts.filter((p) => inRect(p, zone)).length / pts.length < CONFIG.signature.dansCadre)
    return 'signature débordant du cadre';
  const strokes = group.map((s) => s.points);
  if (strokesLength(strokes) < CONFIG.signature.longueurMin) return 'signature trop courte';
  if (ex.encre && group.some((s) => s.ink !== ex.encre))
    return `signature à l'encre ${group[0].ink} au lieu de ${ex.encre}`;
  if (ctx.specimen && similarity(strokes, ctx.specimen) < ctx.seuilSignature)
    return 'signature non conforme au spécimen';
  if (ex.sens === 'rtl') {
    const first = group[0].points[0];
    const lastStroke = group[group.length - 1].points;
    const last = lastStroke[lastStroke.length - 1];
    if (!(first.x > last.x))
      return 'signature tracée de gauche à droite (circulaire sur l’égalité des sens de lecture)';
  }
  if (ex.apres) {
    const other = pieces.get(ex.apres.piece);
    const otherField = other?.fields.find((f) => f.id === ex.apres!.champ);
    const before = other && otherField ? signatureGroup(other, otherField) : null;
    if (before && Math.min(...group.map((s) => s.seq)) < Math.max(...before.map((s) => s.seq))) {
      return 'ordre des visas non respecté (la seconde en premier)';
    }
  }
  return null;
}

function checkParaphe(piece: Piece, field: Field): string | null {
  const zone = expand(field.rect, 3);
  let length = 0;
  for (const s of piece.strokes) {
    if (s.face !== field.face) continue;
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1];
      const b = s.points[i];
      if (inRect(a, zone) && inRect(b, zone)) length += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return length >= CONFIG.paraphe.longueurMin ? null : 'paraphe absent';
}

function checkCase(ex: Exigence, piece: Piece, field: Field): string | null {
  const state = piece.cases[field.id];
  const checked = Boolean(state?.cochee);
  if (checked !== (ex.attendu ?? true))
    return checked ? `case « ${field.label} » cochée à tort` : `case « ${field.label} » non cochée`;
  if (ex.annuler) {
    const c = center(field.rect);
    const ok = piece.prints.some(
      (p) =>
        p.stamp === 'ANNULE' &&
        p.nette &&
        p.face === field.face &&
        p.seq > (state?.seq ?? 0) &&
        Math.hypot(p.x - c.x, p.y - c.y) <= CONFIG.tampon.rayonAnnule + 8,
    );
    if (!ok) return 'case contradictoire cochée mais non annulée (mémo n° 1)';
  }
  return null;
}

/** Normalisation des saisies : espaces, casse et accents tolérés ; dates et milliers sous plusieurs formes. */
export function normalizeText(text: string): string {
  let s = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s  ]/g, '')
    .replace(/(€|euros?|eur)$/, '');
  const date = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/.exec(s);
  if (date) s = `${Number(date[1])}/${Number(date[2])}/${date[3]}`;
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  return s;
}

function checkText(ex: Exigence, piece: Piece, field: Field): string | null {
  const value = textOf(piece, field.id);
  if (!value.trim()) return `champ « ${field.label} » non renseigné`;
  if (normalizeText(value) !== normalizeText(ex.valeur ?? ''))
    return `champ « ${field.label} » mal recopié`;
  if (ex.format === 'majuscules' && value !== value.toUpperCase())
    return `champ « ${field.label} » à écrire en MAJUSCULES`;
  return null;
}

/** Les pièces considérées « dans la chemise » : son contenu une fois fermée, ou ce qui est sur le sous-main. */
export type Presence = ReadonlySet<string>;

/** Vérifie une ligne ; `transmis` vaut vrai au moment de la transmission (la ligne « transmettre » est alors acquise). */
export function checkExigence(
  ex: Exigence,
  dossier: Dossier,
  pieces: ReadonlyMap<string, Piece>,
  ctx: RuleContext,
  present: Presence,
  transmis = false,
): string | null {
  const motif = rawCheck(ex, dossier, pieces, ctx, present, transmis);
  if (!motif) return null;
  return `${ex.pied ? 'Pied de bordereau' : `Ligne ${ex.n}`} : ${motif}`;
}

function rawCheck(
  ex: Exigence,
  dossier: Dossier,
  pieces: ReadonlyMap<string, Piece>,
  ctx: RuleContext,
  present: Presence,
  transmis: boolean,
): string | null {
  switch (ex.geste) {
    case 'lire':
      return null;
    case 'memo':
      return dossier.memoLu ? null : 'note de service non lue';
    case 'transmettre':
      return transmis ? null : 'dossier non transmis';
    case 'joindre': {
      const target = pieces.get(ex.joindre!)!;
      if (present.has(target.uid)) return null;
      const wrong = [...present]
        .map((uid) => pieces.get(uid))
        .find((p) => p && p.dossier === dossier.id && p.leurre);
      if (wrong) return `mauvaise pièce jointe (« ${wrong.titre} », ${wrong.leurre})`;
      return `pièce non jointe (« ${target.titre} »)`;
    }
  }
  const piece = pieces.get(ex.piece!);
  const field = piece?.fields.find((f) => f.id === ex.champ);
  if (!piece || !field) return 'cible introuvable';
  switch (ex.geste) {
    case 'tamponner':
      return checkStamp(
        piece,
        field,
        {
          tampon: ex.tampon!,
          rotation: ex.rotation,
          date: ex.date,
          encre: ex.encre,
          superposes: ex.superposes,
        },
        ctx,
      );
    case 'signer':
      return checkSignature(ex, piece, field, pieces, ctx);
    case 'parapher':
      return checkParaphe(piece, field);
    case 'cocher':
      return checkCase(ex, piece, field);
    case 'ecrire':
      return checkText(ex, piece, field);
    default:
      return null;
  }
}

/** La fiche de retour la plus récente porte-t-elle son VU ? */
export function retourAccuse(
  dossier: Dossier,
  pieces: ReadonlyMap<string, Piece>,
  ctx: Omit<RuleContext, 'specimen'>,
): boolean {
  const last = dossier.fiches[dossier.fiches.length - 1];
  if (!last) return true;
  const fiche = pieces.get(last)!;
  const field = fiche.fields.find((f) => f.id === 'vu')!;
  return checkStamp(fiche, field, { tampon: 'VU' }, ctx) === null;
}

/**
 * Tout ce qui ne va pas dans un dossier qu'on transmet : pièces manquantes ou étrangères, retour non accusé,
 * objet scellé ouvert, puis chaque ligne du bordereau. La liste complète, jamais une seule faute à la fois.
 */
export function checkDossier(
  dossier: Dossier,
  pieces: ReadonlyMap<string, Piece>,
  ctx: RuleContext,
): string[] {
  const present = new Set(dossier.contenu);
  const motifs: string[] = [];
  if (!retourAccuse(dossier, pieces, ctx))
    motifs.push('Retour non accusé : fiche de retour sans tampon VU (mémo n° 3)');
  const joined = new Set(dossier.exigences.flatMap((e) => (e.joindre ? [e.joindre] : [])));
  for (const uid of dossier.attendues) {
    if (!present.has(uid) && !joined.has(uid))
      motifs.push(`Pièce manquante : « ${pieces.get(uid)!.titre} »`);
  }
  for (const uid of dossier.contenu) {
    const p = pieces.get(uid)!;
    if (p.dossier !== dossier.id) motifs.push(`Pièce étrangère au dossier : « ${p.titre} »`);
    else if (p.scelle && p.ouvert) motifs.push(`Objet scellé ouvert par l'agent : « ${p.titre} »`);
  }
  const leurres = dossier.contenu
    .map((uid) => pieces.get(uid)!)
    .filter((p) => p.dossier === dossier.id && p.leurre);
  if (leurres.length && joined.size === 0) {
    for (const p of leurres) motifs.push(`Pièce non conforme : « ${p.titre} » (${p.leurre})`);
  }
  for (const ex of dossier.exigences) {
    const m = checkExigence(ex, dossier, pieces, ctx, present, true);
    if (m) motifs.push(m);
  }
  return motifs;
}
