import { DOSSIERS } from '../content/dossiers';
import { NOMS, PRENOMS } from '../content/noms';
import { FOUILLIS, PIECES } from '../content/pieces';
import { SERVICES } from '../content/services';
import { CONFIG, type DayParams } from './config';
import { addDays, formatDate } from './dates';
import { evaluate, interpolate, type Value } from './expr';
import { FORMATS, layoutBlocs } from './layout';
import type {
  Bloc,
  Dossier,
  DossierModel,
  Exigence,
  ExigenceDef,
  Field,
  Format,
  Piece,
  PieceDef,
  ServiceId,
} from './model';
import { Rng } from './rng';

/**
 * La fabrique à dossiers : un modèle + une graine = un dossier complet (chemise, bordereau, pièces, et pièces
 * manquantes classées aux Archives avec leurs leurres). Même graine, même dossier : les bugs se reproduisent.
 */
export interface GenContext {
  jour: DayParams;
  /** Numéro d'arrivée dans la journée (sert au numéro de dossier). */
  index: number;
  uid: (prefix: string) => string;
}

export interface Generated {
  dossier: Dossier;
  /** Toutes les pièces créées : celles de la chemise, le bordereau, et celles des Archives (dont les leurres). */
  pieces: Piece[];
}

export const nomComplet = (prenom: string, nom: string) => `${prenom} ${nom.toUpperCase()}`;

/** Épaisseur d'un dossier dans la pile selon son nombre de feuilles. */
export function epaisseur(feuilles: number): number {
  const [a, b] = CONFIG.pile.epaisseurs;
  return feuilles <= a ? 1 : feuilles <= b ? 2 : 3;
}

function randomDate(rng: Rng, [from, to]: readonly [number, number]): string {
  const start = Date.UTC(from, 0, 1);
  const end = Date.UTC(to, 11, 31);
  return formatDate(
    new Date(start + Math.floor(rng.float() * ((end - start) / 86400000)) * 86400000),
  );
}

function drawVar(
  spec: DossierModel['variables'][string],
  rng: Rng,
  scope: Record<string, Value>,
): Value {
  if (Array.isArray(spec)) return rng.pick(spec);
  const s = spec as Exclude<typeof spec, readonly Value[]>;
  if ('min' in s) {
    const pas = s.pas ?? 1;
    return s.min + pas * rng.int(0, Math.floor((s.max - s.min) / pas));
  }
  if ('expr' in s) return evaluate(s.expr, scope);
  if ('dateDe' in s) return addDays(String(scope[s.dateDe]), Number(evaluate(s.plus, scope)));
  if ('annees' in s) return randomDate(rng, s.annees);
  const prenom = rng.pick(PRENOMS.filter((p) => p !== scope['prenom']));
  if (s.personne === 'prenom') return prenom;
  if (s.personne === 'famille') return nomComplet(prenom, String(scope['nomFamille']));
  return nomComplet(prenom, rng.pick(NOMS));
}

/** Les variables communes à tous les dossiers, puis celles du modèle, dans leur ordre. */
export function drawScope(model: DossierModel, rng: Rng, ctx: GenContext): Record<string, Value> {
  const prenom = rng.pick(PRENOMS);
  const nomFamille = rng.pick(NOMS);
  const scope: Record<string, Value> = {
    prenom,
    nomFamille,
    nom: nomComplet(prenom, nomFamille),
    date: ctx.jour.date,
    demain: addDays(ctx.jour.date, 1),
    depot: addDays(ctx.jour.date, -rng.int(1, 24)),
    numero: `2026-07B-${String(400 + ctx.jour.numero * 100 + ctx.index).padStart(5, '0')}`,
    age: rng.int(19, 88),
  };
  for (const [name, spec] of Object.entries(model.variables))
    scope[name] = drawVar(spec, rng, scope);
  return scope;
}

function interpolateBloc(bloc: Bloc, scope: Record<string, Value>): Bloc {
  switch (bloc.t) {
    case 'titre':
    case 'meta':
    case 'texte':
    case 'ligne':
      return { ...bloc, texte: interpolate(bloc.texte, scope) };
    case 'valeur':
      return {
        ...bloc,
        label: interpolate(bloc.label, scope),
        valeur: interpolate(bloc.valeur, scope),
      };
    case 'motif':
      return bloc.valeur === undefined
        ? bloc
        : { ...bloc, valeur: interpolate(bloc.valeur, scope) };
    default:
      return bloc;
  }
}

/** Une feuille vierge de toute action, hors de la scène (l'interface la place). */
export function blankPiece(
  uid: string,
  type: string,
  titre: string,
  format: Format,
  recto: readonly Bloc[],
  opts: Partial<
    Pick<
      Piece,
      | 'papier'
      | 'poids'
      | 'dossier'
      | 'petits'
      | 'filigranes'
      | 'scelle'
      | 'nom'
      | 'date'
      | 'lieu'
      | 'leurre'
    >
  > & {
    verso?: readonly Bloc[];
    hauteur?: 'auto';
  } = {},
): Piece {
  const base = FORMATS[format];
  let h = base.h;
  let laid = layoutBlocs(recto, format, 'recto');
  if (opts.hauteur === 'auto') {
    h = Math.max(Math.round(base.h * 0.7), Math.ceil(laid.bottom + base.pad));
    laid = layoutBlocs(recto, format, 'recto', h);
  }
  const verso = opts.verso ? layoutBlocs(opts.verso, format, 'verso', h) : null;
  const fields: Field[] = [...laid.fields, ...(verso?.fields ?? [])];
  return {
    uid,
    type,
    titre,
    format,
    w: base.w,
    h,
    papier: opts.papier ?? 'blanc',
    poids: opts.poids ?? 5,
    recto: laid.laid,
    verso: verso?.laid ?? null,
    fields,
    petits: opts.petits,
    filigranes: opts.filigranes ?? 0,
    scelle: opts.scelle,
    dossier: opts.dossier ?? null,
    leurre: opts.leurre,
    nom: opts.nom,
    date: opts.date,
    lieu: opts.lieu ?? 'chemise',
    x: 0,
    y: 0,
    rot: 0,
    z: 0,
    flipped: false,
    prints: [],
    strokes: [],
    textes: {},
    cases: {},
  };
}

/** Construit une pièce du catalogue dans la portée donnée ; `titre` remplace le titre (leurre de type). */
export function buildPiece(
  def: PieceDef,
  scope: Record<string, Value>,
  uid: string,
  dossier: string | null,
  titre?: string,
): Piece {
  const realTitle = interpolate(def.titre, scope);
  let recto = def.recto.map((b) => interpolateBloc(b, scope));
  if (titre) {
    let done = false;
    recto = recto.map((b) => {
      if (!done && b.t === 'titre') {
        done = true;
        return { ...b, texte: titre.toUpperCase() };
      }
      return b;
    });
  }
  return blankPiece(uid, def.id, titre ?? realTitle, def.format, recto, {
    verso: def.verso?.map((b) => interpolateBloc(b, scope)),
    papier: def.papier,
    poids: def.poids,
    dossier,
    petits: def.petits ? interpolate(def.petits, scope) : undefined,
    filigranes: def.filigranes ? Number(evaluate(def.filigranes, scope)) : 0,
    scelle: def.scelle,
    nom: String(def.archive ? scope[def.archive.nom] : scope['nom']),
    date: String(def.archive ? scope[def.archive.date] : scope['depot']),
  });
}

/** Les lignes retenues : une par groupe exclusif, les obligatoires, puis des facultatives jusqu'au compte du jour. */
export function chooseLines(model: DossierModel, rng: Rng, jour: DayParams): ExigenceDef[] {
  const exclusive = new Map<string, ExigenceDef>();
  for (const key of new Set(model.exigences.map((e) => e.exclusif).filter(Boolean))) {
    exclusive.set(key!, rng.pick(model.exigences.filter((e) => e.exclusif === key)));
  }
  const pool = model.exigences.filter((e) => !e.exclusif || exclusive.get(e.exclusif) === e);
  if (model.tutoriel) return pool;
  const footer = jour.numero >= 2 ? 2 : 0;
  const target = rng.int(jour.lignes[0], jour.lignes[1]);
  const kept = new Set(pool.filter((e) => !e.facultative));
  const optional = rng.shuffle(pool.filter((e) => e.facultative));
  // Une ligne qui vise le pied de bordereau remplace la case correspondante : elle ne compte pas en plus.
  const countOf = (set: Set<ExigenceDef>) =>
    set.size +
    footer -
    [...set].filter((e) => 'cible' in e && e.cible.startsWith('bordereau.')).length;
  for (const e of optional) {
    if (countOf(kept) >= target) break;
    kept.add(e);
  }
  return pool.filter((e) => kept.has(e));
}

function resolveTarget(cible: string, byKey: Map<string, Piece>): { piece: Piece; field: Field } {
  const [cle, champ] = cible.split('.');
  const piece = byKey.get(cle);
  const field = piece?.fields.find((f) => f.id === champ);
  if (!piece || !field) throw new Error(`Cible introuvable : ${cible}`);
  return { piece, field };
}

function resolveDate(spec: string | undefined, scope: Record<string, Value>): string {
  if (!spec || spec === 'jour') return String(scope['date']);
  if (spec === 'demain') return String(scope['demain']);
  if (spec === 'depot') return String(scope['depot']);
  return interpolate(spec, scope);
}

/** Les pièces du bordereau : en-tête, lignes numérotées, puis le pied (visa et cachet) à partir du mardi. */
function bordereauBlocs(
  service: ServiceId,
  titre: string,
  scope: Record<string, Value>,
  lines: string[],
  pied: boolean,
): Bloc[] {
  const blocs: Bloc[] = [
    { t: 'meta', texte: `CAUFD · ${SERVICES[service].nom} · Guichet 7B` },
    { t: 'titre', texte: 'BORDEREAU DE TRAITEMENT' },
    { t: 'valeur', label: 'Objet', valeur: titre },
    { t: 'valeur', label: 'Demandeur', valeur: String(scope['nom']) },
    { t: 'valeur', label: 'Réf.', valeur: `${scope['numero']} · déposé le ${scope['depot']}` },
    { t: 'espace', h: 2 },
    ...lines.map((texte, i): Bloc => ({ t: 'ligne', n: i + 1, texte })),
  ];
  if (pied) {
    blocs.push({ t: 'espace', h: 2 });
    blocs.push({
      t: 'pied',
      signature: { id: 'visa', label: "Visa de l'agent" },
      cachet: { id: 'cachet', label: 'Cachet du service (VU)' },
    });
  }
  return blocs;
}

export function genererDossier(model: DossierModel, rng: Rng, ctx: GenContext): Generated {
  const scope = drawScope(model, rng, ctx);
  const id = ctx.uid('d');
  const defs = chooseLines(model, rng, ctx.jour);
  const pieces: Piece[] = [];
  const byKey = new Map<string, Piece>();

  for (const ref of model.pieces) {
    const def = PIECES[ref.type];
    if (!def) throw new Error(`Type de pièce inconnu : ${ref.type}`);
    const pscope = { ...scope };
    for (const [k, expr] of Object.entries(ref.valeurs ?? {})) pscope[k] = evaluate(expr, scope);
    const piece = buildPiece(def, pscope, ctx.uid('p'), id);
    if (ref.absente) {
      piece.lieu = 'archives';
      pieces.push(...decoys(def, pscope, rng, ctx, id));
    }
    pieces.push(piece);
    byKey.set(ref.cle, piece);
  }

  const pied = ctx.jour.numero >= 2 && !model.tutoriel;
  const texts = defs.map((e) => interpolate(e.texte, scope));
  const titre = interpolate(model.titre, scope);
  const bordereau = blankPiece(
    ctx.uid('b'),
    'bordereau',
    'Bordereau de traitement',
    'bordereau',
    bordereauBlocs(model.service, titre, scope, texts, pied),
    {
      dossier: id,
      poids: 6,
      hauteur: 'auto',
    },
  );
  byKey.set('bordereau', bordereau);
  pieces.push(bordereau);

  // Les conditions des lignes « lire » retenues, pour les tampons « siConditions ».
  const conditions = defs.flatMap((e) => (e.geste === 'lire' && e.condition ? [e.condition] : []));
  const allOk = conditions.every((c) => Boolean(evaluate(c, scope)));

  const exigences: Exigence[] = defs.map((def, i) => {
    const ex: Exigence = { n: i + 1, texte: texts[i], geste: def.geste, aide: def.aide };
    switch (def.geste) {
      case 'tamponner': {
        const { piece, field } = resolveTarget(def.cible, byKey);
        ex.piece = piece.uid;
        ex.champ = field.id;
        ex.face = field.face;
        ex.tampon =
          def.tampon ??
          (def.siConditions
            ? allOk
              ? def.sinon
              : def.alors
            : Boolean(evaluate(def.si!, scope))
              ? def.alors
              : def.sinon);
        ex.rotation = def.rotation;
        ex.encre = def.encre;
        ex.superposes = def.superposes;
        if (ex.tampon === 'RECU_LE') ex.date = resolveDate(def.date, scope);
        break;
      }
      case 'signer': {
        const { piece, field } = resolveTarget(def.cible, byKey);
        ex.piece = piece.uid;
        ex.champ = field.id;
        ex.face = field.face;
        ex.sens = def.sens;
        ex.encre = def.encre;
        if (def.apres) {
          const before = resolveTarget(def.apres, byKey);
          ex.apres = { piece: before.piece.uid, champ: before.field.id };
        }
        break;
      }
      case 'parapher':
      case 'cocher':
      case 'ecrire': {
        const { piece, field } = resolveTarget(def.cible, byKey);
        ex.piece = piece.uid;
        ex.champ = field.id;
        ex.face = field.face;
        if (def.geste === 'cocher') {
          ex.attendu =
            typeof def.attendu === 'string'
              ? Boolean(evaluate(def.attendu, scope))
              : (def.attendu ?? true);
          ex.annuler = def.annuler;
        }
        if (def.geste === 'ecrire') {
          ex.valeur = interpolate(def.valeur, scope);
          ex.format = def.format;
        }
        break;
      }
      case 'joindre': {
        const piece = byKey.get(def.piece);
        if (!piece) throw new Error(`Pièce à joindre inconnue : ${def.piece}`);
        ex.joindre = piece.uid;
        break;
      }
      default:
        break;
    }
    return ex;
  });

  if (pied) {
    let n = exigences.length;
    if (!defs.some((e) => 'cible' in e && e.cible === 'bordereau.visa')) {
      exigences.push({
        n: ++n,
        texte: "Visa de l'agent (pied de bordereau)",
        geste: 'signer',
        piece: bordereau.uid,
        champ: 'visa',
        face: 'recto',
        pied: true,
      });
    }
    if (!defs.some((e) => 'cible' in e && e.cible === 'bordereau.cachet')) {
      exigences.push({
        n: ++n,
        texte: 'Cachet du service, tampon VU (pied de bordereau)',
        geste: 'tamponner',
        piece: bordereau.uid,
        champ: 'cachet',
        face: 'recto',
        tampon: 'VU',
        pied: true,
      });
    }
  }

  const inFolder = model.pieces.filter((r) => !r.absente).length;
  const dossier: Dossier = {
    id,
    modele: model.id,
    service: model.service,
    titre,
    numero: String(scope['numero']),
    nom: String(scope['nom']),
    depot: String(scope['depot']),
    urgent: !model.tutoriel && rng.chance(CONFIG.urgent.probabilite),
    jour: ctx.jour.numero,
    vars: scope,
    exigences,
    bordereau: bordereau.uid,
    attendues: model.pieces.filter((r) => !r.decor).map((r) => byKey.get(r.cle)!.uid),
    fiches: [],
    contenu: [
      bordereau.uid,
      ...model.pieces.filter((r) => !r.absente).map((r) => byKey.get(r.cle)!.uid),
    ],
    epaisseur: epaisseur(inFolder + 1),
    retours: [],
    absurdes: [],
    etat: 'pile',
    arrivee: 0,
    prise: null,
    points: 0,
    credite: false,
    tutoriel: model.tutoriel,
  };
  return { dossier, pieces };
}

/** Les leurres d'une pièce manquante : chacun diffère d'un seul critère (date, nom ou type). */
function decoys(
  def: PieceDef,
  scope: Record<string, Value>,
  rng: Rng,
  ctx: GenContext,
  dossier: string,
): Piece[] {
  const out: Piece[] = [];
  const kinds = rng.shuffle(['date', 'nom', 'type'] as const).slice(0, rng.int(2, 3));
  for (const kind of kinds) {
    const s = { ...scope };
    let titre: string | undefined;
    let leurre: string;
    if (kind === 'date') {
      const key = def.archive?.date ?? 'depot';
      s[key] = addDays(String(s[key]), rng.pick([-365, -30, -7, -1, 1, 7, 31]));
      leurre = 'mauvaise date';
    } else if (kind === 'nom') {
      const key = def.archive?.nom ?? 'nom';
      s[key] = nomComplet(rng.pick(PRENOMS), rng.pick(NOMS.filter((n) => n !== s['nomFamille'])));
      leurre = 'mauvais nom';
    } else {
      if (!def.leurres?.length) continue;
      titre = interpolate(rng.pick(def.leurres), s);
      leurre = 'mauvais type de pièce';
    }
    const piece = buildPiece(def, s, ctx.uid('p'), dossier, titre);
    piece.lieu = 'archives';
    piece.leurre = leurre;
    out.push(piece);
  }
  return out;
}

/** Les modèles tirables un jour donné (sans le tutoriel). */
export function modelsFor(jour: number): DossierModel[] {
  return DOSSIERS.filter((m) => !m.tutoriel && m.jourMin <= jour && (m.jourMax ?? 99) >= jour);
}

/** Tire un modèle, en évitant de reprendre le précédent. */
export function pickModel(jour: number, rng: Rng, previous?: string): DossierModel {
  const pool = modelsFor(jour).filter((m) => m.id !== previous);
  return rng.weighted(
    pool,
    pool.map((m) => m.poids ?? 1),
  );
}

/** Une feuille du fouillis : une vraie pièce d'un dossier imaginaire, ou un titre absurde. */
export function fillerPiece(jour: DayParams, rng: Rng, uid: (p: string) => string): Piece {
  if (rng.chance(0.55)) {
    const model = pickModel(jour.numero, rng);
    const scope = drawScope(model, rng, { jour, index: 99, uid });
    const ref = rng.pick(model.pieces);
    const def = PIECES[ref.type];
    const pscope = { ...scope };
    for (const [k, expr] of Object.entries(ref.valeurs ?? {})) pscope[k] = evaluate(expr, scope);
    const piece = buildPiece(def, pscope, uid('f'), null);
    piece.lieu = 'archives';
    return piece;
  }
  const titre = rng.pick(FOUILLIS);
  const nom = nomComplet(rng.pick(PRENOMS), rng.pick(NOMS));
  const date = addDays(jour.date, -rng.int(30, 4000));
  return blankPiece(
    uid('f'),
    'fouillis',
    titre,
    'a4',
    [
      { t: 'meta', texte: 'CAUFD · Archives · carton 7B' },
      { t: 'titre', texte: titre.toUpperCase() },
      { t: 'valeur', label: 'Concerne', valeur: nom },
      { t: 'valeur', label: 'Date', valeur: date },
      { t: 'texte', texte: 'Pièce conservée au titre de la conservation des pièces.' },
    ],
    {
      lieu: 'archives',
      nom,
      date,
      papier: rng.pick(['blanc', 'jaune', 'rose', 'vert', 'bleu'] as const),
    },
  );
}

/** La fiche de retour agrafée sur la chemise : motifs, et un cadre pour le VU d'accusé de réception. */
export function ficheRetour(uid: string, dossier: Dossier, motifs: string[], heure: string): Piece {
  return blankPiece(
    uid,
    'fiche',
    'Fiche de retour',
    'fiche',
    [
      { t: 'meta', texte: `Courrier interne · retour du ${heure}` },
      { t: 'titre', texte: 'FICHE DE RETOUR' },
      { t: 'valeur', label: 'Dossier', valeur: dossier.numero },
      ...motifs.map((m): Bloc => ({ t: 'texte', style: 'machine', texte: `› ${m}` })),
      { t: 'cachet', id: 'vu', label: 'Accusé de réception : VU' },
    ],
    { papier: 'rose', dossier: dossier.id, poids: 2, hauteur: 'auto' },
  );
}
