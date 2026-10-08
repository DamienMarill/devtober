import { describe, expect, it } from 'vitest';
import { Seq, newStampTool, stamp, stroke, useStamp } from './actions';
import { blankPiece } from './generate';
import type { Field, Piece, Pt } from './model';
import { checkStamp, DEFAULT_RULES, normalizeText, signatureGroup } from './rules';
import { chooseSpecimen, resemblance, similarity } from './signature';
import { signatureOf } from './signature-samples';
import { fitStrokes, reversed } from './solve';

function sheet(): { piece: Piece; frame: Field; seq: Seq } {
  const piece = blankPiece('p1', 'test', 'Test', 'a4', [
    { t: 'titre', texte: 'TEST' },
    { t: 'cachet', id: 'cachet', label: 'Cachet' },
    { t: 'signature', id: 'sig', label: 'Signature' },
  ]);
  return { piece, frame: piece.fields.find((f) => f.id === 'cachet')!, seq: new Seq() };
}

const at = (frame: Field, dx = 0, dy = 0) => ({
  x: frame.rect.x + frame.rect.w / 2 + dx,
  y: frame.rect.y + frame.rect.h / 2 + dy,
});

describe('tamponner', () => {
  const put = (
    piece: Piece,
    seq: Seq,
    s: Parameters<typeof stamp>[2]['stamp'],
    p: Pt,
    extra: Partial<Parameters<typeof stamp>[2]> = {},
  ) =>
    stamp(piece, seq, {
      stamp: s,
      ink: 'noir',
      x: p.x,
      y: p.y,
      rot: 0,
      nette: true,
      face: 'recto',
      ...extra,
    });

  it('dans le cadre, à 12 px près', () => {
    const { piece, frame, seq } = sheet();
    put(piece, seq, 'VU', at(frame, frame.rect.w / 2 + 10, 0));
    expect(checkStamp(piece, frame, { tampon: 'VU' }, DEFAULT_RULES)).toBeNull();
  });

  it('hors du cadre', () => {
    const { piece, frame, seq } = sheet();
    put(piece, seq, 'VU', at(frame, 0, 120));
    expect(checkStamp(piece, frame, { tampon: 'VU' }, DEFAULT_RULES)).toBe('tampon hors cadre');
  });

  it('la 4e empreinte sort à 50 % : illisible', () => {
    const tool = newStampTool('VU');
    expect([useStamp(tool), useStamp(tool), useStamp(tool), useStamp(tool)]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    const { piece, frame, seq } = sheet();
    put(piece, seq, 'VU', at(frame), { nette: false });
    expect(checkStamp(piece, frame, { tampon: 'VU' }, DEFAULT_RULES)).toMatch(/illisible/);
  });

  it('un mauvais tampon reste, sauf sous un ANNULÉ net posé après', () => {
    const { piece, frame, seq } = sheet();
    put(piece, seq, 'CONFORME', at(frame));
    expect(checkStamp(piece, frame, { tampon: 'IRRECEVABLE' }, DEFAULT_RULES)).toMatch(
      /mauvais tampon/,
    );
    put(piece, seq, 'ANNULE', at(frame, 4, 2), { nette: false });
    expect(checkStamp(piece, frame, { tampon: 'IRRECEVABLE' }, DEFAULT_RULES)).toMatch(
      /mauvais tampon/,
    );
    put(piece, seq, 'ANNULE', at(frame, 4, 2));
    put(piece, seq, 'IRRECEVABLE', at(frame));
    expect(checkStamp(piece, frame, { tampon: 'IRRECEVABLE' }, DEFAULT_RULES)).toBeNull();
  });

  it('la rotation, à 10° près, et la date du dateur', () => {
    const { piece, frame, seq } = sheet();
    put(piece, seq, 'VU', at(frame), { rot: 30 });
    expect(checkStamp(piece, frame, { tampon: 'VU' }, DEFAULT_RULES)).toMatch(/de travers/);
    const s2 = sheet();
    put(s2.piece, s2.seq, 'VU', at(s2.frame), { rot: 45 });
    expect(
      checkStamp(s2.piece, s2.frame, { tampon: 'VU', rotation: 45 }, DEFAULT_RULES),
    ).toBeNull();
    const s3 = sheet();
    put(s3.piece, s3.seq, 'RECU_LE', at(s3.frame), { date: '06/10/2026' });
    expect(
      checkStamp(s3.piece, s3.frame, { tampon: 'RECU_LE', date: '07/10/2026' }, DEFAULT_RULES),
    ).toMatch(/date/);
  });
});

describe('signer', () => {
  it('ressemble à son propre spécimen, pas à un zigzag, un trait ou un gribouillis', () => {
    const zigzag = [Array.from({ length: 30 }, (_, i) => ({ x: i * 5, y: i % 2 ? 0 : 40 }))];
    const trait = [
      [
        { x: 0, y: 20 },
        { x: 150, y: 22 },
      ],
    ];
    const gribouillis = [
      Array.from({ length: 60 }, (_, i) => ({ x: (i * 37) % 150, y: (i * 53) % 40 })),
    ];
    for (let m = 1; m <= 10; m++) {
      for (let e = 1; e <= 5; e++)
        expect(similarity(signatureOf(m, e), signatureOf(m, 0))).toBeGreaterThanOrEqual(
          DEFAULT_RULES.seuilSignature,
        );
      for (const fake of [zigzag, trait, gribouillis])
        expect(similarity(fake, signatureOf(m, 0))).toBeLessThan(DEFAULT_RULES.seuilSignature);
    }
  });

  it('une signature tassée dans un cadre étroit ressemble toujours au spécimen', () => {
    const specimen = [signatureOf(4, 1), signatureOf(4, 2), signatureOf(4, 3)];
    for (let e = 4; e <= 9; e++) {
      // Deux fois plus étroite, comme dans un petit cadre : seules les proportions changent.
      const squeezed = signatureOf(4, e).map((s) => s.map((p) => ({ x: p.x * 0.45, y: p.y })));
      expect(resemblance(squeezed, specimen)).toBeGreaterThanOrEqual(DEFAULT_RULES.seuilSignature);
    }
  });

  it('le nuage $P ignore le sens du tracé et la position', () => {
    const s = signatureOf(2, 0);
    expect(similarity(reversed(s), s)).toBeGreaterThan(0.95);
    expect(similarity(fitStrokes(s, { x: 300, y: 80, w: 60, h: 20 }), s)).toBeGreaterThan(0.95);
  });

  it('le spécimen du lundi : trois signatures qui se ressemblent, sinon on recommence', () => {
    expect(
      chooseSpecimen([signatureOf(3, 1), signatureOf(3, 2), signatureOf(3, 3)]),
    ).not.toBeNull();
    // Un gribouillis en dents de scie n'a rien d'une signature cursive.
    const zigzag = [Array.from({ length: 30 }, (_, i) => ({ x: i * 5, y: i % 2 ? 0 : 40 }))];
    expect(chooseSpecimen([signatureOf(3, 1), zigzag, signatureOf(3, 3)])).toBeNull();
  });

  it('les traits d’une signature se regroupent dans leur cadre', () => {
    const { piece, seq } = sheet();
    const field = piece.fields.find((f) => f.id === 'sig')!;
    for (const points of fitStrokes(signatureOf(1, 0), field.rect))
      stroke(piece, seq, { points, ink: 'bleu', face: 'recto', groupe: 7 });
    stroke(piece, seq, {
      points: [
        { x: 5, y: 5 },
        { x: 40, y: 5 },
      ],
      ink: 'bleu',
      face: 'recto',
      groupe: 8,
    });
    expect(signatureGroup(piece, field)!.every((s) => s.groupe === 7)).toBe(true);
  });
});

describe('écrire', () => {
  it('tolère espaces, casse, accents, milliers et formats de date', () => {
    expect(normalizeText('140 000 €')).toBe(normalizeText('140000'));
    expect(normalizeText('140.000')).toBe(normalizeText('140000'));
    expect(normalizeText('Gérard')).toBe(normalizeText('GERARD'));
    expect(normalizeText('3-4-1987')).toBe(normalizeText('03/04/1987'));
    expect(normalizeText('1 400')).not.toBe(normalizeText('14 000'));
  });
});
