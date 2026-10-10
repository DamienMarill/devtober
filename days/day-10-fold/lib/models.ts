import { v, Vec2 } from './geometry';
import { sheet, Step, world } from './paper';

const S = Math.SQRT2;
const H = S / 2;

/** Un point à `r` de `o`, dans la direction `deg` (degrés, sens trigonométrique). */
const polar = (o: Vec2, deg: number, r = 0.5) => {
  const a = (deg * Math.PI) / 180;
  return world(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r);
};

/** Ce qu'on dessine sur le modèle fini (les yeux du chien), en coordonnées de table, sur la pose à plat. */
export interface Decal {
  readonly kind: 'eye' | 'nose';
  readonly at: Vec2;
  readonly size: number;
}

export interface OrigamiModel {
  readonly id: string;
  readonly name: string;
  /** Avec l'article, pour les phrases : « ton chien ». */
  readonly the: string;
  readonly level: 1 | 2 | 3;
  readonly sheet: 'square' | 'diamond';
  /** Face colorée vers le haut au départ ? (sinon, face blanche dessus : le motif finit à l'extérieur) */
  readonly colorUp: boolean;
  readonly steps: readonly Step[];
  /** Comment on le présente une fois plié. */
  readonly finale: 'stand' | 'beat' | 'fly';
  readonly decals?: readonly Decal[];
}

/** Le chien : cinq plis, deux oreilles qui tombent et un museau blanc. */
const DOG: OrigamiModel = {
  id: 'chien',
  name: 'Chien',
  the: 'ton chien',
  level: 1,
  sheet: 'diamond',
  colorUp: false,
  finale: 'stand',
  decals: [
    { kind: 'eye', at: v(-0.3, -0.4), size: 0.07 },
    { kind: 'eye', at: v(0.3, -0.4), size: 0.07 },
    { kind: 'nose', at: v(0, -0.7), size: 0.1 },
  ],
  steps: [
    {
      kind: 'fold',
      id: 'half',
      text: 'Plie la pointe du haut sur la pointe du bas : un grand triangle.',
      folds: [{ from: sheet(0, S), to: sheet(0, -S) }],
    },
    {
      kind: 'fold',
      id: 'earL',
      text: 'Rabats le coin gauche vers le bas, en biais : une oreille qui tombe.',
      folds: [{ from: sheet(-S, 0), to: world(-0.78, -1) }],
    },
    {
      kind: 'fold',
      id: 'earR',
      text: 'Pareil à droite : la deuxième oreille.',
      folds: [{ from: sheet(S, 0), to: world(0.78, -1) }],
    },
    {
      kind: 'fold',
      id: 'nose',
      text: 'Remonte la pointe du bas, une seule épaisseur : voilà le museau.',
      folds: [{ from: sheet(0, S), to: world(0, -0.62), only: ['half'] }],
    },
    {
      kind: 'fold',
      id: 'chin',
      text: 'Replie la pointe qui dépasse derrière, vers l’arrière.',
      folds: [{ from: sheet(0, -S), to: world(0, -0.62), mountain: true, except: ['half'] }],
    },
  ],
};

/** Le gobelet : le coin droit va sur le bord gauche, rabat bien horizontal (calcul : t = 2√2 − 2). */
const CUP: OrigamiModel = {
  id: 'gobelet',
  name: 'Gobelet',
  the: 'ton gobelet',
  level: 1,
  sheet: 'diamond',
  colorUp: false,
  finale: 'stand',
  steps: [
    {
      kind: 'fold',
      id: 'half',
      text: 'Plie la pointe du bas sur la pointe du haut.',
      folds: [{ from: sheet(0, -S), to: sheet(0, S) }],
    },
    {
      kind: 'fold',
      id: 'right',
      text: 'Amène le coin droit sur le bord gauche : le haut du rabat doit être bien horizontal.',
      folds: [{ from: sheet(S, 0), to: world(S - 2, 2 * S - 2) }],
    },
    {
      kind: 'fold',
      id: 'left',
      text: 'Pareil avec le coin gauche, par-dessus.',
      folds: [{ from: sheet(-S, 0), to: world(2 - S, 2 * S - 2) }],
    },
    {
      kind: 'fold',
      id: 'front',
      text: 'Rabats le triangle du dessus vers l’avant et glisse-le dans la poche, sous les deux rabats.',
      folds: [
        { from: sheet(0, -S), to: world(0, 3 * S - 4), only: ['half'], tuck: ['right', 'left'] },
      ],
    },
    {
      kind: 'fold',
      id: 'back',
      text: 'Rabats l’autre triangle vers l’arrière. Il ne reste qu’à l’ouvrir !',
      folds: [{ from: sheet(0, S), to: world(0, 3 * S - 4), mountain: true, except: ['half'] }],
    },
  ],
};

/** Le cœur : un rectangle replié, deux lobes, puis on arrondit les pointes derrière. */
const HEART: OrigamiModel = {
  id: 'coeur',
  name: 'Cœur',
  the: 'ton cœur',
  level: 2,
  sheet: 'square',
  colorUp: false,
  finale: 'beat',
  steps: [
    {
      kind: 'fold',
      id: 'creaseH',
      crease: true,
      text: 'Plie la feuille en deux de haut en bas, puis déplie : on marque le milieu.',
      folds: [{ from: sheet(-1, 1), to: sheet(-1, -1) }],
    },
    {
      kind: 'fold',
      id: 'creaseV',
      crease: true,
      text: 'Pareil de gauche à droite : deux plis en croix.',
      folds: [{ from: sheet(-1, 1), to: sheet(1, 1) }],
    },
    {
      kind: 'fold',
      id: 'top',
      text: 'Rabats le bord du haut sur le pli du milieu.',
      folds: [{ from: sheet(-1, 1), to: world(-1, 0) }],
    },
    {
      kind: 'fold',
      id: 'bottom',
      text: 'Remonte le bord du bas jusqu’en haut.',
      folds: [{ from: sheet(-1, -1), to: world(-1, 0.5) }],
    },
    {
      kind: 'fold',
      id: 'lobeR',
      text: 'Remonte la moitié droite le long du pli du milieu : le premier lobe.',
      folds: [{ from: sheet(1, -0.25), to: world(0, 0.75) }],
    },
    {
      kind: 'fold',
      id: 'lobeL',
      text: 'Pareil à gauche : le deuxième lobe.',
      folds: [{ from: sheet(-1, -0.25), to: world(0, 0.75) }],
    },
    { kind: 'flip', id: 'flip', text: 'Retourne le modèle.' },
    {
      kind: 'fold',
      id: 'round',
      text: 'Replie les quatre pointes du haut vers l’arrière pour arrondir le cœur.',
      folds: [
        { through: [world(0.5, 0.75), world(0.75, 0.5)], side: world(0.75, 0.75), mountain: true },
        {
          through: [world(-0.5, 0.75), world(-0.75, 0.5)],
          side: world(-0.75, 0.75),
          mountain: true,
        },
        {
          through: [world(0, 0.53), world(0.22, 0.75)],
          side: world(0, 0.75),
          mountain: true,
          within: (p) => p.x > 0,
        },
        {
          through: [world(0, 0.53), world(-0.22, 0.75)],
          side: world(0, 0.75),
          mountain: true,
          within: (p) => p.x < 0,
        },
      ],
    },
  ],
};

/** L'avion (la flèche) : sur un carré, il est trapu, mais il vole. */
const WING_TAIL = 2 * Math.tan(Math.PI / 16);
const WING: readonly [ReturnType<typeof world>, ReturnType<typeof world>] = [
  world(0, 1),
  world(WING_TAIL, -1),
];
const PLANE: OrigamiModel = {
  id: 'avion',
  name: 'Avion',
  the: 'ton avion',
  level: 2,
  sheet: 'square',
  colorUp: false,
  finale: 'fly',
  steps: [
    {
      kind: 'fold',
      id: 'crease',
      crease: true,
      text: 'Plie la feuille en deux de gauche à droite, puis déplie : le pli du milieu sert de repère.',
      folds: [{ from: sheet(-1, 1), to: sheet(1, 1) }],
    },
    {
      kind: 'fold',
      id: 'cornerL',
      text: 'Rabats le coin en haut à gauche sur le pli du milieu.',
      folds: [{ from: sheet(-1, 1), to: world(0, 0) }],
    },
    {
      kind: 'fold',
      id: 'cornerR',
      text: 'Pareil avec le coin en haut à droite.',
      folds: [{ from: sheet(1, 1), to: world(0, 0) }],
    },
    {
      kind: 'fold',
      id: 'edgeL',
      text: 'Rabats encore le bord gauche, en biais, sur le pli du milieu.',
      folds: [{ from: sheet(-1, 0), to: world(0, 1 - S) }],
    },
    {
      kind: 'fold',
      id: 'edgeR',
      text: 'Pareil à droite : le nez devient bien pointu.',
      folds: [{ from: sheet(1, 0), to: world(0, 1 - S) }],
    },
    {
      kind: 'fold',
      id: 'half',
      text: 'Plie l’avion en deux vers l’arrière, le long du pli du milieu.',
      folds: [{ through: [world(0, 1), world(0, -1)], side: world(-0.5, 0), mountain: true }],
    },
    {
      kind: 'fold',
      id: 'wingL',
      text: 'Rabats l’aile du dessus : son bord en biais vient sur le pli du milieu.',
      folds: [{ through: WING, side: world(0.7, -0.9), where: (p) => p.x > 0 }],
    },
    {
      kind: 'fold',
      id: 'wingR',
      text: 'Rabats l’autre aile vers l’arrière, de la même façon.',
      folds: [{ through: WING, side: world(0.7, -0.9), where: (p) => p.x < 0, mountain: true }],
    },
    {
      kind: 'bend',
      id: 'open',
      text: 'Ouvre les ailes à l’horizontale : prêt pour le décollage !',
      bends: [
        { through: WING, side: world(0.1, -0.9), angle: Math.PI / 2, only: ['wingL'] },
        { through: WING, side: world(0.1, -0.9), angle: -Math.PI / 2, only: ['wingR'] },
      ],
    },
  ],
};

/** Le kabuto, le casque de samouraï qu'on plie au Japon pour le Kodomo no hi. */
const HORN_L = polar(v(0, -H), 105);
const HORN_R = polar(v(0, -H), 75);
const BRIM: readonly [ReturnType<typeof world>, ReturnType<typeof world>] = [
  world(-1, -H),
  world(1, -H),
];
const KABUTO: OrigamiModel = {
  id: 'kabuto',
  name: 'Kabuto',
  the: 'ton kabuto',
  level: 3,
  sheet: 'diamond',
  colorUp: false,
  finale: 'stand',
  steps: [
    {
      kind: 'fold',
      id: 'half',
      text: 'Plie la pointe du haut sur celle du bas : un grand triangle.',
      folds: [{ from: sheet(0, S), to: sheet(0, -S) }],
    },
    {
      kind: 'fold',
      id: 'cornerL',
      text: 'Amène le coin gauche sur la pointe du bas.',
      folds: [{ from: sheet(-S, 0), to: sheet(0, -S) }],
    },
    {
      kind: 'fold',
      id: 'cornerR',
      text: 'Pareil avec le coin droit : un carré posé sur la pointe.',
      folds: [{ from: sheet(S, 0), to: sheet(0, -S) }],
    },
    {
      kind: 'fold',
      id: 'tipL',
      text: 'Remonte la pointe du rabat gauche jusqu’en haut.',
      folds: [{ from: sheet(-S, 0), to: world(0, 0), only: ['cornerL'] }],
    },
    {
      kind: 'fold',
      id: 'tipR',
      text: 'Pareil avec le rabat droit.',
      folds: [{ from: sheet(S, 0), to: world(0, 0), only: ['cornerR'] }],
    },
    {
      kind: 'fold',
      id: 'hornL',
      text: 'Plie cette pointe vers l’extérieur, en biais : une corne !',
      folds: [{ through: [world(0, -H), HORN_L], side: sheet(-S, 0), only: ['tipL'] }],
    },
    {
      kind: 'fold',
      id: 'hornR',
      text: 'Et la deuxième corne.',
      folds: [{ through: [world(0, -H), HORN_R], side: sheet(S, 0), only: ['tipR'] }],
    },
    {
      kind: 'fold',
      id: 'brim',
      text: 'Remonte la pointe du bas, une seule épaisseur, au-dessus de la base des cornes.',
      folds: [{ from: sheet(0, S), to: world(0, -0.32), only: ['half'] }],
    },
    {
      kind: 'fold',
      id: 'brim2',
      text: 'Replie encore vers le haut, le long de la base des cornes : la visière.',
      folds: [{ through: BRIM, side: world(0, -1), only: ['half'] }],
    },
    {
      kind: 'fold',
      id: 'back',
      text: 'Replie la pointe de derrière vers l’arrière (ou rentre-la dans le casque).',
      folds: [{ through: BRIM, side: world(0, -1), except: ['half'], mountain: true }],
    },
  ],
};

export const MODELS: readonly OrigamiModel[] = [DOG, CUP, HEART, PLANE, KABUTO];
