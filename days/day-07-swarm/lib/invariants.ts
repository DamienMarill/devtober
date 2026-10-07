import { Sim } from './sim';

/**
 * Les comptes internes de la simulation sont-ils cohérents ? Chaque rame en route est dans la liste de son tronçon
 * et une seule fois, chaque rame à quai tient un quai, les compteurs de quais sont justes, et les positions restent
 * dans leur parcours. Renvoie la liste des problèmes (vide si tout va bien) ; utilisé par les tests.
 */
export function checkInvariants(sim: Sim): string[] {
  const errors: string[] = [];
  const { segments, platforms } = sim.debugBooks();
  const seen = new Map<number, number>();
  for (const [key, list] of segments) {
    for (const t of list) {
      seen.set(t.id, (seen.get(t.id) ?? 0) + 1);
      if (t.state !== 'run' || t.seg !== key) errors.push(`rame ${t.id} listée sur ${key} à tort`);
    }
  }
  const held = new Map<string, number>();
  for (const t of sim.trams) {
    if (t.k < 0 || t.k >= t.path.stations.length)
      errors.push(`rame ${t.id} : rang ${t.k} hors parcours`);
    if (t.p < 0 || t.p > 1) errors.push(`rame ${t.id} : avancement ${t.p}`);
    if (t.state === 'run') {
      if ((seen.get(t.id) ?? 0) !== 1)
        errors.push(`rame ${t.id} vue ${seen.get(t.id) ?? 0} fois sur les tronçons`);
      if (t.platform) errors.push(`rame ${t.id} en route mais tient le quai ${t.platform}`);
    } else {
      if (!t.platform) errors.push(`rame ${t.id} à quai sans quai`);
      else held.set(t.platform, (held.get(t.platform) ?? 0) + 1);
    }
  }
  for (const [key, n] of platforms) {
    if ((held.get(key) ?? 0) !== n)
      errors.push(`quai ${key} : compteur ${n}, rames ${held.get(key) ?? 0}`);
    if (!key.endsWith(':T') && n > 1) errors.push(`quai ${key} : ${n} rames`);
  }
  for (const [key, n] of held)
    if ((platforms.get(key) ?? 0) !== n) errors.push(`quai ${key} non compté`);
  return errors;
}
