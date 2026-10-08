import { CONFIG } from './config';
import type { Ink, Piece, Print, StampId, Stroke } from './model';

/**
 * Les gestes, vus comme des mutations de l'état d'une pièce. L'interface, la démo et les bots passent tous par
 * ici : un tampon posé à la main ou par le solveur laisse exactement la même empreinte.
 */
export class Seq {
  value = 0;
  next(): number {
    return ++this.value;
  }
}

export function stamp(piece: Piece, seq: Seq, p: Omit<Print, 'seq'>): Print {
  const print: Print = { ...p, seq: seq.next() };
  piece.prints.push(print);
  return print;
}

export function stroke(piece: Piece, seq: Seq, s: Omit<Stroke, 'seq'>): Stroke {
  const out: Stroke = { ...s, points: s.points.map((p) => ({ ...p })), seq: seq.next() };
  piece.strokes.push(out);
  return out;
}

/** Tape un caractère dans un champ (`\b` : retour arrière, qui laisse une rature). */
export function type(piece: Piece, seq: Seq, champ: string, key: string): void {
  const field = (piece.textes[champ] ??= { chars: [], seq: 0 });
  if (key === '\b') {
    for (let i = field.chars.length - 1; i >= 0; i--) {
      if (!field.chars[i].barre) {
        field.chars[i].barre = true;
        break;
      }
    }
  } else {
    field.chars.push({ c: key, barre: false });
  }
  field.seq = seq.next();
}

/** Le texte du champ, ratures exclues. */
export function textOf(piece: Piece, champ: string): string {
  return (piece.textes[champ]?.chars ?? [])
    .filter((c) => !c.barre)
    .map((c) => c.c)
    .join('');
}

export function ratures(piece: Piece, champ: string): number {
  return (piece.textes[champ]?.chars ?? []).filter((c) => c.barre).length;
}

/** Écrit un texte entier : efface ce qui y est (ratures), puis tape. */
export function write(piece: Piece, seq: Seq, champ: string, text: string): void {
  const current = textOf(piece, champ);
  if (current === text) return;
  for (let i = 0; i < current.length; i++) type(piece, seq, champ, '\b');
  for (const c of text) type(piece, seq, champ, c);
}

export function toggle(piece: Piece, seq: Seq, champ: string): boolean {
  const c = (piece.cases[champ] ??= { cochee: false, bascules: 0, seq: 0 });
  c.cochee = !c.cochee;
  c.bascules++;
  c.seq = seq.next();
  return c.cochee;
}

export function setCase(piece: Piece, seq: Seq, champ: string, value: boolean): void {
  if (Boolean(piece.cases[champ]?.cochee) !== value) toggle(piece, seq, champ);
}

/** Un tampon en main : son encre et ce qu'il lui reste d'empreintes nettes. */
export interface StampTool {
  id: StampId;
  ink: Ink;
  charges: number;
}

export function newStampTool(id: StampId): StampTool {
  return { id, ink: 'noir', charges: CONFIG.tampon.empreintesParEncrage };
}

/** Une empreinte de plus : nette tant qu'il reste de l'encre, puis à 50 %. */
export function useStamp(tool: StampTool): boolean {
  const nette = tool.charges > 0;
  tool.charges = Math.max(0, tool.charges - 1);
  return nette;
}

export function reink(tool: StampTool, ink: Ink): void {
  tool.ink = ink;
  tool.charges = CONFIG.tampon.empreintesParEncrage;
}
