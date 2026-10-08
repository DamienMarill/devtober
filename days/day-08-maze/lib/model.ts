import type { Value } from './expr';

/**
 * Les types du jeu. Deux familles : les définitions du contenu (`content/`, de la donnée pure) et l'état d'une
 * partie (pièces, dossiers), fait d'objets simples sérialisables pour la sauvegarde.
 */

export type StampId = 'VU' | 'RECU_LE' | 'CONFORME' | 'APPROUVE' | 'IRRECEVABLE' | 'ANNULE';
export type Ink = 'noir' | 'rouge' | 'bleu' | 'violet';
export type ServiceId = 'logement' | 'etat_civil' | 'credit';
export type Face = 'recto' | 'verso';
export type Format =
  'a4' | 'demi' | 'ticket' | 'carte' | 'photo' | 'etiquette' | 'bordereau' | 'fiche';
export type Papier = 'blanc' | 'jaune' | 'rose' | 'vert' | 'bleu' | 'kraft' | 'ticket';
/** Ce que le joueur survole : sert aux lignes du tutoriel qui s'allument. */
export type Station = 'stylo' | 'tampons' | 'memo' | 'sortant' | 'archives' | 'pile' | 'corbeille';

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ───────────────────────── Contenu ───────────────────────── */

/** Un dessin fixe sur une pièce (empreinte de patte, gribouillis, photo…). `valeur` le paramètre (cases remplies). */
export type Motif =
  | 'patte'
  | 'gribouillis'
  | 'photo'
  | 'baguette'
  | 'fidelite'
  | 'flacon'
  | 'goutte'
  | 'radiateur'
  | 'nageur'
  | 'aspirateur'
  | 'code-barres'
  | 'blason';

export type Bloc =
  | { t: 'titre'; texte: string }
  | { t: 'meta'; texte: string }
  | { t: 'texte'; texte: string; style?: 'manuscrit' | 'machine' | 'gras' | 'petit' }
  | { t: 'valeur'; label: string; valeur: string }
  | { t: 'champ'; id: string; label: string }
  | { t: 'case'; id: string; label: string }
  | { t: 'signature'; id: string; label: string }
  | { t: 'cachet'; id: string; label: string }
  | { t: 'pied'; signature: { id: string; label: string }; cachet: { id: string; label: string } }
  | { t: 'paraphe'; id: string }
  | { t: 'motif'; motif: Motif; valeur?: string; hauteur?: number }
  | { t: 'espace'; h: number }
  /** Une ligne numérotée du bordereau (une exigence). */
  | { t: 'ligne'; n: number; texte: string };

export interface PieceDef {
  id: string;
  /** Titre lisible (peut contenir des `{variables}`). */
  titre: string;
  format: Format;
  poids: number;
  papier?: Papier;
  recto: readonly Bloc[];
  verso?: readonly Bloc[];
  /** Petits caractères en bas du recto (corps 6 px : la loupe). */
  petits?: string;
  /** Nombre de filigranes COPIE (expression). */
  filigranes?: string;
  /** Un objet scellé : le retourner, c'est l'ouvrir. */
  scelle?: boolean;
  /** Variantes de titre pour les leurres des Archives (« … par soi-même »). */
  leurres?: readonly string[];
  /** Ce qu'on lit d'un coup d'œil aux Archives (nom, date) : expressions. */
  archive?: { nom: string; date: string };
}

/** Une variable de modèle : une liste (tirage uniforme, répéter pour pondérer), un intervalle ou une expression. */
export type VarSpec =
  | readonly Value[]
  | { min: number; max: number; pas?: number }
  | { expr: string }
  /** Une date jj/mm/aaaa : celle d'une autre variable décalée de `plus` jours (expression). */
  | { dateDe: string; plus: string }
  /** Une date au hasard entre deux années. */
  | { annees: readonly [number, number] }
  /** Une personne de plus : un prénom seul, un inconnu, ou un proche (même nom de famille que le demandeur). */
  | { personne: 'prenom' | 'complet' | 'famille' };

export interface PieceRef {
  cle: string;
  type: string;
  /** La pièce manque à la chemise : elle est classée aux Archives. */
  absente?: boolean;
  /** Variables propres à cette pièce (expressions évaluées dans la portée du dossier). */
  valeurs?: Readonly<Record<string, string>>;
  /** Pièce de pur décor (un leurre dans la chemise) : jamais exigée, jamais manquante. */
  decor?: boolean;
}

interface ExBase {
  /** Le texte du bordereau, en langue administrative (avec `{variables}`). */
  texte: string;
  /** Ligne qu'on peut retirer pour tenir le nombre de lignes du jour. */
  facultative?: boolean;
  /** L'objet du bureau qui allume la ligne au survol (tutoriel). */
  aide?: Station;
  /** Lignes interchangeables : une seule de celles qui partagent cette clé est retenue. */
  exclusif?: string;
}

export type ExigenceDef = ExBase &
  (
    | { geste: 'lire'; condition?: string }
    | {
        geste: 'tamponner';
        cible: string;
        tampon?: StampId;
        /** Condition explicite : `alors` si vraie, `sinon` sinon. */
        si?: string;
        /** `alors` si une des conditions des lignes « lire » retenues n'est pas remplie. */
        siConditions?: boolean;
        alors?: StampId;
        sinon?: StampId;
        rotation?: number;
        /** Pour REÇU LE : 'jour', 'demain', 'depot' ou une date. */
        date?: string;
        encre?: Ink;
        /** Nombre d'empreintes superposées exigées (« jusqu'à épuisement du doute »). */
        superposes?: number;
      }
    | { geste: 'signer'; cible: string; sens?: 'rtl'; encre?: Ink; apres?: string }
    | { geste: 'parapher'; cible: string }
    | { geste: 'cocher'; cible: string; attendu?: boolean | string; annuler?: boolean }
    | { geste: 'ecrire'; cible: string; valeur: string; format?: 'majuscules' }
    | { geste: 'joindre'; piece: string }
    | { geste: 'memo' }
    | { geste: 'transmettre' }
  );

export type Geste = ExigenceDef['geste'];

export interface DossierModel {
  id: string;
  service: ServiceId;
  jourMin: number;
  jourMax?: number;
  titre: string;
  /** Poids du tirage parmi les modèles du jour. */
  poids?: number;
  variables: Readonly<Record<string, VarSpec>>;
  pieces: readonly PieceRef[];
  exigences: readonly ExigenceDef[];
  /** Le dossier de prise de poste : jamais tiré au hasard. */
  tutoriel?: boolean;
}

/* ───────────────────────── Partie ───────────────────────── */

export type FieldKind = 'signature' | 'paraphe' | 'cachet' | 'champ' | 'case';

export interface Field {
  id: string;
  kind: FieldKind;
  label: string;
  face: Face;
  /** Le cadre (signature, cachet), la case ou la zone de saisie : la géométrie des règles. */
  rect: Rect;
  /** La zone cliquable (avec l'étiquette pour une case ou un champ). */
  zone: Rect;
}

/** Un bloc mis en page : texte interpolé et rectangle dans la pièce. */
export interface LaidBloc {
  bloc: Bloc;
  rect: Rect;
}

export interface Print {
  stamp: StampId;
  ink: Ink;
  /** Centre de l'empreinte, dans le repère de la pièce. */
  x: number;
  y: number;
  /** Rotation par rapport à la feuille (degrés). */
  rot: number;
  /** Faux pour la 4e empreinte d'un encrage : 50 % d'opacité, illisible. */
  nette: boolean;
  date?: string;
  face: Face;
  seq: number;
}

export interface Stroke {
  points: Pt[];
  ink: Ink;
  face: Face;
  /** Les traits d'une même signature partagent un groupe. */
  groupe: number;
  seq: number;
}

export interface TextField {
  chars: { c: string; barre: boolean }[];
  seq: number;
}

export interface CaseState {
  cochee: boolean;
  bascules: number;
  seq: number;
}

export type Lieu =
  'chemise' | 'sousmain' | 'bureau' | 'archives' | 'corbeille' | 'detruite' | 'egaree';

export interface Piece {
  uid: string;
  type: string;
  titre: string;
  format: Format;
  w: number;
  h: number;
  papier: Papier;
  poids: number;
  recto: LaidBloc[];
  verso: LaidBloc[] | null;
  fields: Field[];
  petits?: string;
  filigranes: number;
  scelle?: boolean;
  ouvert?: boolean;
  /** Le dossier d'origine (null : une feuille du fouillis des Archives). */
  dossier: string | null;
  /** Pourquoi c'est un leurre (« mauvaise date »…), ou rien. */
  leurre?: string;
  /** Ce qu'on lit d'un coup d'œil aux Archives. */
  nom?: string;
  date?: string;
  lieu: Lieu;
  /** Centre de la pièce sur la scène, rotation (degrés) et ordre d'empilement. */
  x: number;
  y: number;
  rot: number;
  z: number;
  flipped: boolean;
  prints: Print[];
  strokes: Stroke[];
  textes: Record<string, TextField>;
  cases: Record<string, CaseState>;
  /** Révision d'affichage : augmente à chaque geste sur la pièce (l'interface ne redessine que ce qui change). */
  v: number;
}

export interface Exigence {
  n: number;
  texte: string;
  geste: Geste;
  aide?: Station;
  piece?: string;
  champ?: string;
  face?: Face;
  tampon?: StampId;
  rotation?: number;
  date?: string;
  encre?: Ink;
  superposes?: number;
  sens?: 'rtl';
  apres?: { piece: string; champ: string };
  attendu?: boolean;
  annuler?: boolean;
  valeur?: string;
  format?: 'majuscules';
  joindre?: string;
  /** Visa et cachet du pied de bordereau (à partir du mardi). */
  pied?: boolean;
}

export type RetourType = 'R1' | 'R2' | 'R3' | 'NON_ACCUSE';

export interface RetourTrace {
  type: RetourType;
  motifs: string[];
  fiche: string;
}

export type DossierEtat = 'pile' | 'ouvert' | 'ferme' | 'transmis' | 'classe';

export interface Dossier {
  id: string;
  modele: string;
  service: ServiceId;
  titre: string;
  numero: string;
  nom: string;
  depot: string;
  urgent: boolean;
  jour: number;
  vars: Record<string, Value>;
  exigences: Exigence[];
  bordereau: string;
  /** Pièces exigées dans la chemise (bordereau et fiches de retour à part). */
  attendues: string[];
  fiches: string[];
  /** Le contenu de la chemise, dans l'ordre (fixé à la fermeture). */
  contenu: string[];
  epaisseur: number;
  retours: RetourTrace[];
  absurdes: RetourType[];
  etat: DossierEtat;
  /** Arrivée sur la pile (la dernière, pour un retour), en secondes de journée. */
  arrivee: number;
  prise: number | null;
  points: number;
  credite: boolean;
  tutoriel?: boolean;
  /** La note de service a été lue (survol du mémo) pendant que le dossier était ouvert. */
  memoLu?: boolean;
}
