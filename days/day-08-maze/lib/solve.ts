import { Seq, setCase, stamp, stroke, write } from './actions';
import type { Dossier, Face, Ink, Piece, Pt, Rect, StampId } from './model';
import { activePrintsIn, center, checkExigence, retourAccuse, type RuleContext } from './rules';

/**
 * Le solveur : pour un dossier, la liste des gestes qui le rendent conforme (ou qui réparent ce qu'un retour R1
 * a signalé). Il sert à la démo (touche T), aux bots du simulateur d'équilibrage et aux tests, qui vérifient que
 * chaque dossier généré est soluble.
 */
export type Action =
  | {
      k: 'stamp';
      piece: string;
      face: Face;
      stamp: StampId;
      ink: Ink;
      x: number;
      y: number;
      rot: number;
      date?: string;
    }
  | { k: 'sign'; piece: string; face: Face; strokes: Pt[][]; ink: Ink }
  | { k: 'check'; piece: string; champ: string; value: boolean }
  | { k: 'write'; piece: string; champ: string; text: string }
  | { k: 'attach'; piece: string }
  | { k: 'memo' };

/** Ramène des traits dans un rectangle (75 % de sa largeur, centrés), en gardant leurs proportions. */
export function fitStrokes(strokes: readonly Pt[][], box: Rect, fill = 0.75): Pt[][] {
  const pts = strokes.flat();
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const scale = Math.min((box.w * fill) / (maxX - minX || 1), (box.h * fill) / (maxY - minY || 1));
  const ox = box.x + (box.w - (maxX - minX) * scale) / 2;
  const oy = box.y + (box.h - (maxY - minY) * scale) / 2;
  return strokes.map((s) =>
    s.map((p) => ({ x: ox + (p.x - minX) * scale, y: oy + (p.y - minY) * scale })),
  );
}

/** Les mêmes traits, parcourus à l'envers : le premier point devient le dernier (signature de droite à gauche). */
export function reversed(strokes: readonly Pt[][]): Pt[][] {
  return [...strokes].reverse().map((s) => [...s].reverse());
}

/** Un paraphe : trois boucles serrées dans la case. */
export function parapheStroke(box: Rect): Pt[][] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push({
      x: box.x + box.w * (0.15 + 0.7 * t),
      y: box.y + box.h * (0.5 + 0.3 * Math.sin(t * Math.PI * 6)),
    });
  }
  return [pts];
}

/** Les gestes qui manquent au dossier, dans un ordre qui respecte « la seconde en premier ». */
export function solve(
  dossier: Dossier,
  pieces: ReadonlyMap<string, Piece>,
  ctx: RuleContext,
  present: ReadonlySet<string>,
): Action[] {
  const actions: Action[] = [];
  const firsts = new Set(
    dossier.exigences.flatMap((e) => (e.apres ? [`${e.apres.piece}.${e.apres.champ}`] : [])),
  );
  const ordered = [...dossier.exigences].sort((a, b) => {
    const fa = firsts.has(`${a.piece}.${a.champ}`) ? 0 : 1;
    const fb = firsts.has(`${b.piece}.${b.champ}`) ? 0 : 1;
    return fa - fb || a.n - b.n;
  });
  // Ce que le solveur attache passe « dans la chemise » pour les lignes suivantes.
  const inFolder = new Set(present);

  for (const uid of dossier.attendues) {
    if (!inFolder.has(uid)) {
      actions.push({ k: 'attach', piece: uid });
      inFolder.add(uid);
    }
  }

  for (const ex of ordered) {
    if (checkExigence(ex, dossier, pieces, ctx, inFolder, true) === null) continue;
    const piece = ex.piece ? pieces.get(ex.piece) : undefined;
    const field = piece?.fields.find((f) => f.id === ex.champ);
    switch (ex.geste) {
      case 'memo':
        actions.push({ k: 'memo' });
        break;
      case 'joindre':
        actions.push({ k: 'attach', piece: ex.joindre! });
        inFolder.add(ex.joindre!);
        break;
      case 'tamponner': {
        if (!piece || !field) break;
        for (const bad of activePrintsIn(piece, field, ctx.toleranceTampon)) {
          actions.push({
            k: 'stamp',
            piece: piece.uid,
            face: field.face,
            stamp: 'ANNULE',
            ink: 'noir',
            x: bad.x,
            y: bad.y,
            rot: 0,
          });
        }
        const c = center(field.rect);
        for (let i = 0; i < (ex.superposes ?? 1); i++) {
          actions.push({
            k: 'stamp',
            piece: piece.uid,
            face: field.face,
            stamp: ex.tampon!,
            ink: ex.encre ?? 'noir',
            x: c.x,
            y: c.y,
            rot: ex.rotation ?? 0,
            date: ex.date,
          });
        }
        break;
      }
      case 'signer': {
        if (!piece || !field || !ctx.specimen) break;
        let strokes = fitStrokes(ctx.specimen[0], field.rect);
        if (ex.sens === 'rtl') strokes = reversed(strokes);
        actions.push({
          k: 'sign',
          piece: piece.uid,
          face: field.face,
          strokes,
          ink: ex.encre ?? 'bleu',
        });
        break;
      }
      case 'parapher':
        if (piece && field)
          actions.push({
            k: 'sign',
            piece: piece.uid,
            face: field.face,
            strokes: parapheStroke(field.rect),
            ink: 'bleu',
          });
        break;
      case 'cocher':
        if (!piece || !field) break;
        if (Boolean(piece.cases[field.id]?.cochee) !== (ex.attendu ?? true)) {
          actions.push({
            k: 'check',
            piece: piece.uid,
            champ: field.id,
            value: ex.attendu ?? true,
          });
        }
        if (ex.annuler) {
          const c = center(field.rect);
          actions.push({
            k: 'stamp',
            piece: piece.uid,
            face: field.face,
            stamp: 'ANNULE',
            ink: 'noir',
            x: c.x + 30,
            y: c.y,
            rot: 0,
          });
        }
        break;
      case 'ecrire':
        if (piece && field)
          actions.push({
            k: 'write',
            piece: piece.uid,
            champ: field.id,
            text: ex.format === 'majuscules' ? ex.valeur!.toUpperCase() : ex.valeur!,
          });
        break;
      default:
        break;
    }
  }

  if (!retourAccuse(dossier, pieces, ctx)) {
    const fiche = pieces.get(dossier.fiches[dossier.fiches.length - 1])!;
    const c = center(fiche.fields.find((f) => f.id === 'vu')!.rect);
    actions.push({
      k: 'stamp',
      piece: fiche.uid,
      face: 'recto',
      stamp: 'VU',
      ink: 'noir',
      x: c.x,
      y: c.y,
      rot: 0,
    });
  }
  return actions;
}

/** Applique un geste du solveur (mêmes mutations que l'interface). */
export function applyAction(
  a: Action,
  dossier: Dossier,
  pieces: ReadonlyMap<string, Piece>,
  seq: Seq,
): void {
  switch (a.k) {
    case 'stamp':
      stamp(pieces.get(a.piece)!, seq, {
        stamp: a.stamp,
        ink: a.ink,
        x: a.x,
        y: a.y,
        rot: a.rot,
        nette: true,
        date: a.date,
        face: a.face,
      });
      break;
    case 'sign': {
      const piece = pieces.get(a.piece)!;
      const groupe = seq.next();
      for (const points of a.strokes)
        stroke(piece, seq, { points, ink: a.ink, face: a.face, groupe });
      break;
    }
    case 'check':
      setCase(pieces.get(a.piece)!, seq, a.champ, a.value);
      break;
    case 'write':
      write(pieces.get(a.piece)!, seq, a.champ, a.text);
      break;
    case 'attach':
      pieces.get(a.piece)!.lieu = 'sousmain';
      break;
    case 'memo':
      dossier.memoLu = true;
      break;
  }
}
