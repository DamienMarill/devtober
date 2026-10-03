import { parseTrackId } from './shared-track';

describe('parseTrackId', () => {
  it('lit un identifiant Deezer valide', () => {
    expect(parseTrackId('3540533651')).toBe(3540533651);
  });

  it('renvoie null quand le paramètre est absent ou vide', () => {
    expect(parseTrackId(null)).toBeNull();
    expect(parseTrackId(undefined)).toBeNull();
    expect(parseTrackId('')).toBeNull();
  });

  it('rejette ce qui n’est pas un entier positif', () => {
    for (const bad of ['abc', '-5', '0', '12.5', '1e3', '12abc', '99999999999999999999']) {
      expect(parseTrackId(bad)).toBeNull();
    }
  });
});
