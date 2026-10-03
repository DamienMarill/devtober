/** Paramètre d'adresse qui porte le titre partagé : `?track=<id Deezer>`. */
export const TRACK_PARAM = 'track';

/** Identifiant Deezer lu dans le paramètre, ou null s'il est absent ou invalide. */
export function parseTrackId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
