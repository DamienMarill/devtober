import { CONFIG } from './config';
import { Network } from './network';
import { Notice } from './sim';

export type Tone = 'info' | 'alert' | 'event' | 'joke';

export interface FeedItem {
  id: number;
  /** Minute de la journée. */
  time: number;
  text: string;
  tone: Tone;
  line?: number;
  station?: number;
  /** Mouvements de flotte regroupés (même type, même ligne) et leur nombre. */
  group?: string;
  count?: number;
}

/**
 * Répliques du PC, réservées aux situations qui s'y prêtent. Au plus une par tranche de `CONFIG.feed.jokeEvery`
 * minutes simulées : le reste du temps, le fil reste sobre.
 */
const JOKES = {
  bunching: [
    'L{line} : {count} rames à la queue leu leu, puis plus rien. Les trams aussi aiment voyager en groupe.',
    'L{line} : {count} rames collées près de {station}. Vue d’en haut, on dirait une chenille processionnaire.',
  ],
  crowd: [
    '{station} : {count} personnes à quai. On commence à s’y dire bonjour.',
    '{station} : {count} personnes à quai. Le record de la Comédie un soir de Fête de la musique est menacé.',
    '{station} : quai plein. Un voyageur demande s’il peut finir à la nage par le Lez.',
  ],
  morning: ['{station} : {count} personnes à quai, et le café n’est même pas fini.'],
  loop: [
    'L4 : la ligne tourne en rond, c’est normal, c’est une boucle. Les {count} voyageurs de {station}, eux, n’ont pas bougé.',
  ],
  free: [
    'Gare Saint-Roch : {count} personnes à quai. La gratuité attire du monde. Toute la ville, apparemment.',
  ],
} as const;

export class Feed {
  readonly items: FeedItem[] = [];
  private nextId = 1;
  private lastJoke = -Infinity;
  private lastDepotEmpty = -Infinity;
  /** Incidents en cours qui imposent un ton sobre. */
  private readonly sober = new Set<string>();

  constructor(
    private readonly net: Network,
    private readonly rng: () => number = Math.random,
  ) {}

  /** Transforme un avis de la simulation en ligne du fil (ou rien) ; renvoie l'élément ajouté ou mis à jour. */
  push(notice: Notice, time: number): FeedItem | null {
    const name = (s: number) => this.net.stations[s].name;
    switch (notice.kind) {
      case 'announce':
        return this.add(time, notice.event.text, 'event');
      case 'start':
        return notice.event.lead > 0
          ? null
          : this.add(time, notice.event.text, 'alert', { station: notice.station });
      case 'end':
        return notice.event.done
          ? this.add(time, notice.event.done, 'info', { station: notice.station })
          : null;
      case 'crowd': {
        const count = notice.count * CONFIG.riderSize;
        const lines = this.net.stations[notice.station].lines;
        const pool: readonly string[] =
          notice.station === this.net.byId.get('gare-saint-roch')
            ? JOKES.free
            : lines.length === 1 && lines[0] === 4
              ? JOKES.loop
              : time < 9 * 60 + 30
                ? JOKES.morning
                : JOKES.crowd;
        const joke = notice.count >= CONFIG.crowd.saturated ? this.joke(time, pool) : null;
        const vars = { station: name(notice.station), count: String(count) };
        return this.add(
          time,
          fill(joke ?? '{station} : {count} voyageurs à quai.', vars),
          joke ? 'joke' : 'alert',
          {
            station: notice.station,
          },
        );
      }
      case 'bunching': {
        const vars = {
          line: String(notice.line),
          count: String(notice.count),
          station: name(notice.station),
        };
        const joke = this.joke(time, JOKES.bunching);
        return this.add(
          time,
          fill(
            joke ?? 'L{line} : {count} rames se suivent à moins de 4 minutes, près de {station}.',
            vars,
          ),
          joke ? 'joke' : 'alert',
          { line: notice.line, station: notice.station },
        );
      }
      case 'deploy':
      case 'retire':
        return this.fleetMove(notice.kind, notice.line, time);
      case 'cancel':
        return this.cancelDeploy(notice.line, time);
      case 'depot-empty':
        if (time - this.lastDepotEmpty < 10) return null;
        this.lastDepotEmpty = time;
        return this.add(
          time,
          'Dépôt vide : retire une rame d’une ligne calme pour en renforcer une autre.',
          'info',
        );
      case 'incident': {
        if (notice.sober) {
          if (notice.stage === 'end') this.sober.delete(notice.id);
          else this.sober.add(notice.id);
        }
        const tone: Tone =
          notice.stage === 'announce' ? 'event' : notice.stage === 'start' ? 'alert' : 'info';
        return this.add(time, notice.text, tone, { station: notice.station, line: notice.line });
      }
      case 'plan':
        return this.add(time, planText(notice, name), 'info', {
          station: 'station' in notice ? notice.station : undefined,
          line: 'line' in notice ? notice.line : undefined,
        });
      case 'order': {
        const text = orderText(notice, name);
        return text
          ? this.add(time, text, 'info', { station: notice.station, line: notice.line })
          : null;
      }
      case 'watchdog':
        return this.add(
          time,
          `L${notice.line} : rame bloquée près de ${name(notice.station)}, rentrée au dépôt.`,
          'alert',
          {
            station: notice.station,
            line: notice.line,
          },
        );
    }
  }

  /** Les mouvements de flotte rapprochés se regroupent : « L1 : 3 rames sortent du dépôt ». */
  private fleetMove(kind: 'deploy' | 'retire', line: number, time: number): FeedItem {
    const group = `${kind}:${line}`;
    const text = (n: number) => (kind === 'deploy' ? deployText(line, n) : retireText(line, n));
    const head = this.items[0];
    if (head?.group === group && time - head.time < 3) {
      head.count = (head.count ?? 1) + 1;
      head.text = text(head.count);
      head.time = time;
      return head;
    }
    return this.add(time, text(1), 'info', { line, group, count: 1 });
  }

  /** Une sortie de dépôt annulée : on décompte le dernier regroupement, ou on le dit. */
  private cancelDeploy(line: number, time: number): FeedItem | null {
    const head = this.items[0];
    if (head?.group === `deploy:${line}`) {
      head.count = (head.count ?? 1) - 1;
      if (head.count <= 0) {
        this.items.shift();
        return null;
      }
      head.text = deployText(line, head.count);
      return head;
    }
    return this.add(time, `L${line} : sortie de dépôt annulée.`, 'info', { line });
  }

  private joke(time: number, pool: readonly string[]): string | null {
    // Pas de plaisanterie pendant un incident sérieux (épisode de pluie, inondation).
    if (this.sober.size) return null;
    if (time - this.lastJoke < CONFIG.feed.jokeEvery) return null;
    this.lastJoke = time;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  private add(time: number, text: string, tone: Tone, extra: Partial<FeedItem> = {}): FeedItem {
    const item: FeedItem = { id: this.nextId++, time, text, tone, ...extra };
    this.items.unshift(item);
    if (this.items.length > 40) this.items.length = 40;
    return item;
  }
}

type PlanNotice = Extract<Notice, { kind: 'plan' }>;
type OrderNotice = Extract<Notice, { kind: 'order' }>;

function planText(n: PlanNotice, name: (s: number) => string): string {
  switch (n.change) {
    case 'cut':
      return `${name(n.station)} : circulation interrompue, les lignes sont coupées de part et d’autre.`;
    case 'uncut':
      return `${name(n.station)} : circulation rétablie.`;
    case 'skip':
      return `${name(n.station)} : station non desservie, les rames passent sans s’arrêter.`;
    case 'unskip':
      return `${name(n.station)} : desserte rétablie.`;
    case 'deviation-on':
      return `L${n.line} : itinéraire bis via Les Aubes et Pompignane.`;
    case 'deviation-off':
      return `L${n.line} : retour à l’itinéraire normal.`;
    case 'cut-edge':
      return `${name(n.station)} – ${name(n.to)} : circulation interrompue sur ce tronçon.`;
    case 'uncut-edge':
      return `${name(n.station)} – ${name(n.to)} : circulation rétablie sur ce tronçon.`;
  }
}

const ORDER_LABELS = {
  hold: 'retenue 2 min à',
  turnBack: 'demi-tour à',
  deadhead: 'haut-le-pied après',
  deviate: 'déviée via Pompignane depuis',
  depot: 'rentre au dépôt après',
} as const;

function orderText(n: OrderNotice, name: (s: number) => string): string | null {
  if (n.stage === 'done' && n.order !== 'deviate') return null;
  if (n.stage === 'cancelled') return `L${n.line} · rame ${n.tram} : ordre annulé.`;
  return `L${n.line} · rame ${n.tram} : ${ORDER_LABELS[n.order]} ${name(n.station)}.`;
}

const deployText = (line: number, n: number) =>
  `L${line} : ${n > 1 ? `${n} rames sortent` : 'une rame sort'} du dépôt.`;
const retireText = (line: number, n: number) =>
  `L${line} : ${n > 1 ? `${n} rames rentreront` : 'une rame rentrera'} au dépôt après le terminus.`;

/** Remplace les `{clés}` d'un gabarit. */
export function fill(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}
