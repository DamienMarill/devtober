import { describe, expect, it } from 'vitest';
import { drawText, textPattern, textWidth, toFont } from './font';

describe('font', () => {
  it('ramène le texte aux glyphes connus', () => {
    expect(toFont('Cités fortifiées')).toBe('CITES FORTIFIEES');
    expect(toFont('Brian’s Brain')).toBe("BRIAN'S BRAIN");
    expect(toFont('é~')).toBe('E ');
  });

  it('mesure 4 points par lettre, moins le dernier espace', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('B3/S23')).toBe(23);
  });

  it('dessine dans une grille en coupant ce qui dépasse', () => {
    const grid = new Uint8Array(4 * 5);
    const next = drawText(grid, 4, 5, 0, 0, 'I', 1);
    expect(next).toBe(4);
    expect([...grid.slice(0, 4)]).toEqual([1, 1, 1, 0]);
    expect([...grid.slice(4, 8)]).toEqual([0, 1, 0, 0]);
    expect(() => drawText(grid, 4, 5, 2, 3, 'WIDE', 1)).not.toThrow();
  });

  it('agrandit un texte en motif de cellules', () => {
    const p = textPattern('TINY', 4);
    expect([p.width, p.height]).toEqual([15 * 4, 20]);
    // Le haut du T : 3 points allumés, soit 12 cellules sur les 4 premières lignes.
    expect([...p.cells.slice(0, 12)].every((c) => c === 1)).toBe(true);
    expect(p.cells[12]).toBe(0);
  });
});
