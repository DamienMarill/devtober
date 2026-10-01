import { findExplosions, isExploding, spectralRichness } from './explosion-detector';

const RATE = 44_100;

/** Signal de `seconds` s, construit par `fn(t)`. */
function signal(seconds: number, fn: (t: number, i: number) => number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / RATE, i);
  return out;
}

// Bruit reproductible (LCG), pour des tests stables.
const noise = (() => {
  let seed = 42;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 31 - 1;
  };
})();

describe('spectralRichness', () => {
  it('est faible pour une note pure et forte pour du bruit large bande', () => {
    const tone = signal(1, (t) => Math.sin(2 * Math.PI * 440 * t));
    const rich = signal(1, () => noise());
    expect(spectralRichness(tone, 20_000, RATE)).toBeLessThan(0.05);
    expect(spectralRichness(rich, 20_000, RATE)).toBeGreaterThan(0.8);
  });
});

describe('findExplosions', () => {
  it('repère un passage qui devient d’un coup plus fort ET plus riche', () => {
    // 8 s de note tenue discrète, puis 8 s de tout le spectre à fond.
    const track = signal(16, (t) => (t < 8 ? 0.05 * Math.sin(2 * Math.PI * 440 * t) : 0.5 * noise()));
    const [explosion, ...rest] = findExplosions(track, RATE);
    expect(rest).toHaveLength(0);
    expect(explosion.start).toBeGreaterThan(7);
    expect(explosion.start).toBeLessThan(9);
    expect(explosion.end).toBeGreaterThan(13);
  });

  it('ignore un crescendo de note seule : fort mais pauvre en instruments', () => {
    const track = signal(16, (t) => (t < 8 ? 0.05 : 0.5) * Math.sin(2 * Math.PI * 440 * t));
    expect(findExplosions(track, RATE)).toEqual([]);
  });

  it('sans repli, un extrait uniformément dense n’a aucune hausse à montrer', () => {
    expect(findExplosions(signal(16, () => 0.3 * noise()), RATE, { sustained: false })).toEqual([]);
    expect(findExplosions(signal(12, () => 0.5 * noise()), RATE, { sustained: false })).toEqual([]);
  });
});

describe('findExplosions : extrait déjà à fond (repli)', () => {
  it('compte comme explosion un extrait dense ET fort du début à la fin', () => {
    const [explosion, ...rest] = findExplosions(signal(16, () => 0.5 * noise()), RATE);
    expect(rest).toHaveLength(0);
    expect(explosion.start).toBeLessThan(2.5);
    expect(explosion.end).toBeGreaterThan(13.5);
  });

  it('ne détecte rien dans un extrait sobre, même fort (une note n’explose pas)', () => {
    expect(findExplosions(signal(16, (t) => 0.7 * Math.sin(2 * Math.PI * 440 * t)), RATE)).toEqual([]);
  });

  it('ne détecte rien dans un extrait dense mais faible', () => {
    expect(findExplosions(signal(16, () => 0.02 * noise()), RATE)).toEqual([]);
  });

  it('ne s’applique pas quand une vraie explosion a déjà été trouvée', () => {
    const track = signal(16, (t) => (t < 8 ? 0.05 * Math.sin(2 * Math.PI * 440 * t) : 0.5 * noise()));
    expect(findExplosions(track, RATE)).toEqual(findExplosions(track, RATE, { sustained: false }));
  });

  it('un trou bref ne coupe pas l’explosion', () => {
    const track = signal(16, (t) => (t >= 8 && t < 8.5 ? 0.02 : 0.5) * noise());
    expect(findExplosions(track, RATE)).toHaveLength(1);
  });
});

describe('findExplosions : drops répétés', () => {
  /**
   * Un morceau dense en continu, comme un morceau pop compressé : 8 s à bas niveau (−8 dB sous la suite,
   * ce qui laisse la 1re explosion se terminer à son premier trou), puis du bruit large bande avec
   * un trou net (0,6 s très atténué) avant chaque retour.
   */
  const dense = (holes: number[], calm = 8) =>
    signal(30, (t) => {
      if (t < calm) return 0.16 * noise();
      const inHole = holes.some((h) => t >= h && t < h + 0.6);
      return (inHole ? 0.08 : 0.4) * noise();
    });

  it('rattache les drops répétés à l’explosion en cours : un seul passage, sans coupure aux trous', () => {
    const found = findExplosions(dense([14, 18, 22]), RATE);
    expect(found).toHaveLength(1);
    expect(found[0].start).toBeGreaterThan(7);
    expect(found[0].start).toBeLessThan(9);
    expect(found[0].end).toBeGreaterThan(27); // jusqu’à la fin de l’extrait (moins le fondu)
  });

  it('sans la seconde passe, chaque trou coupe l’explosion et la suite est perdue', () => {
    const found = findExplosions(dense([14, 18, 22]), RATE, { holeDb: 0 });
    expect(found).toHaveLength(1);
    expect(found[0].end).toBeLessThan(15); // s’arrête au 1er trou
  });

  it('ne cherche pas de drop répété tant qu’aucune explosion n’a eu lieu (repli désactivé)', () => {
    const track = signal(20, (t) => (t >= 9 && t < 9.6 ? 0.08 : 0.4) * noise());
    expect(findExplosions(track, RATE, { sustained: false })).toEqual([]);
  });

  it('ne modifie jamais le début des explosions de la première passe, ni ne les raccourcit', () => {
    const track = dense([14, 18, 22]);
    const first = findExplosions(track, RATE, { holeDb: 0 });
    const all = findExplosions(track, RATE);
    for (const e of first) {
      const merged = all.find((x) => x.start === e.start);
      expect(merged).toBeDefined();
      expect(merged!.end).toBeGreaterThanOrEqual(e.end);
    }
  });

  it('ignore un trou suivi d’un éclair qui ne tient pas', () => {
    // après le trou à 14 s, seulement 0,3 s de bruit puis le retour du calme
    const track = signal(24, (t) => {
      if (t < 8) return 0.03 * Math.sin(2 * Math.PI * 440 * t);
      if (t < 14) return 0.4 * noise();
      if (t < 14.6) return 0.08 * noise();
      if (t < 14.9) return 0.4 * noise();
      return 0.03 * Math.sin(2 * Math.PI * 440 * t);
    });
    const found = findExplosions(track, RATE);
    expect(found.some((e) => e.start >= 14.3)).toBe(false);
  });
});

describe('isExploding', () => {
  const list = [{ start: 5, end: 9 }];
  it('teste l’appartenance de l’instant à un passage', () => {
    expect(isExploding(list, 4.9)).toBe(false);
    expect(isExploding(list, 5)).toBe(true);
    expect(isExploding(list, 8.99)).toBe(true);
    expect(isExploding(list, 9)).toBe(false);
  });
});
