import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Feed, fill } from './feed';
import { buildNetwork } from './network';
import { WEDNESDAY } from './scenario';

const net = buildNetwork();
const corum = net.byId.get('corum')!;

describe('Feed', () => {
  it('annonce les événements prévus', () => {
    const feed = new Feed(net);
    const match = WEDNESDAY.find((e) => e.id === 'match-retour')!;
    expect(feed.push({ kind: 'announce', event: match }, 21 * 60)?.text).toBe(match.text);
    expect(feed.push({ kind: 'start', event: match }, 21 * 60 + 50)).toBeNull();
  });

  it('donne le nombre de voyageurs (points × 10) d’une foule', () => {
    const feed = new Feed(net);
    const item = feed.push({ kind: 'crowd', station: corum, count: 50 }, 12 * 60)!;
    expect(item.text).toBe('Corum : 500 voyageurs à quai.');
    expect(item.tone).toBe('alert');
  });

  it('se permet une réplique de temps en temps, pas plus', () => {
    const feed = new Feed(net, () => 0);
    const big = CONFIG.crowd.saturated;
    const first = feed.push({ kind: 'crowd', station: corum, count: big }, 12 * 60)!;
    const second = feed.push({ kind: 'crowd', station: corum, count: big }, 12 * 60 + 10)!;
    expect(first.tone).toBe('joke');
    expect(second.tone).toBe('alert');
    const later = feed.push(
      { kind: 'crowd', station: corum, count: big },
      12 * 60 + CONFIG.feed.jokeEvery + 1,
    )!;
    expect(later.tone).toBe('joke');
  });

  it('regroupe les sorties de dépôt rapprochées', () => {
    const feed = new Feed(net);
    feed.push({ kind: 'deploy', line: 1 }, 400);
    feed.push({ kind: 'deploy', line: 1 }, 400.5);
    feed.push({ kind: 'deploy', line: 1 }, 401);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].text).toBe('L1 : 3 rames sortent du dépôt.');
    feed.push({ kind: 'deploy', line: 2 }, 401);
    expect(feed.items).toHaveLength(2);
  });

  it('décompte une sortie de dépôt annulée', () => {
    const feed = new Feed(net);
    feed.push({ kind: 'deploy', line: 1 }, 400);
    feed.push({ kind: 'deploy', line: 1 }, 400);
    feed.push({ kind: 'cancel', line: 1 }, 400.2);
    expect(feed.items[0].text).toBe('L1 : une rame sort du dépôt.');
    feed.push({ kind: 'cancel', line: 1 }, 400.3);
    expect(feed.items).toHaveLength(0);
  });

  it('raconte les changements du plan d’exploitation', () => {
    const feed = new Feed(net);
    const comedie = net.byId.get('comedie')!;
    const text = (n: Parameters<Feed['push']>[0]) => feed.push(n, 600)!.text;
    expect(text({ kind: 'plan', change: 'cut', station: comedie })).toMatch(
      /^Comédie : circulation interrompue/,
    );
    expect(text({ kind: 'plan', change: 'cut-edge', station: corum, to: comedie })).toBe(
      'Corum – Comédie : circulation interrompue sur ce tronçon.',
    );
    expect(
      text({ kind: 'plan', change: 'deviation-on', deviation: 'l1-pompignane', line: 1 }),
    ).toBe('L1 : itinéraire bis via Les Aubes et Pompignane.');
  });

  it('reste sobre pendant un incident sérieux', () => {
    const feed = new Feed(net, () => 0);
    const rain = {
      kind: 'incident',
      id: 'rain',
      title: 'Pluie',
      text: 'Fortes pluies.',
      sober: true,
    } as const;
    feed.push({ ...rain, stage: 'start' }, 12 * 60);
    const crowd = { kind: 'crowd', station: corum, count: CONFIG.crowd.saturated } as const;
    expect(feed.push(crowd, 12 * 60 + 1)!.tone).toBe('alert');
    feed.push({ ...rain, stage: 'end' }, 13 * 60);
    expect(feed.push(crowd, 13 * 60 + 1)!.tone).toBe('joke');
  });
});

describe('fill', () => {
  it('remplace les clés connues et laisse les autres', () => {
    expect(fill('{a} et {b}', { a: '1' })).toBe('1 et {b}');
  });
});
