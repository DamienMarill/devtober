import { density, RHO0, soundSpeed } from './atmosphere';
import { CONFIG, G0 } from './config';
import { Rng } from './rng';

/**
 * Le vol, réduit à l'essentiel pour une trajectoire dans un plan vertical : un point matériel de 118 t
 * avec sa vitesse V, sa pente γ (l'angle de la trajectoire) et son incidence α (l'angle entre le nez et la
 * trajectoire). Quatre forces : le poids, la portance (perpendiculaire à la trajectoire), la traînée
 * (opposée) et la poussée (dans l'axe du fuselage).
 *
 *   m·dV/dt   = T·cos α − D − m·g·sin γ
 *   m·V·dγ/dt = L + T·sin α − m·g·cos γ
 *
 * Ce que ressentent les passagers, c'est tout sauf le poids : la « force spécifique » (L + D + T) / m,
 * exprimée dans les axes de la cabine. Son facteur normal n_z vaut 1 en palier, 1,8 dans la ressource, et 0
 * quand portance et traînée sont annulées : l'avion tombe alors comme une pierre lancée, et tout ce qu'il
 * contient tombe avec lui, à la même vitesse.
 */

const A = CONFIG.aircraft;
const EARTH_RADIUS = 6_371_000;

/** La gravité baisse un peu avec l'altitude : à 8 500 m, elle ne vaut plus que 9,78 m/s². */
export const gravity = (h: number) => G0 * (EARTH_RADIUS / (EARTH_RADIUS + h)) ** 2;

/** Poussée maximale : un réacteur à double flux perd de la poussée quand l'air se raréfie et quand il va vite. */
export const thrustMax = (h: number, mach: number) =>
  A.thrustMax * (density(h) / RHO0) ** 0.8 * (1 - 0.35 * mach);

export type ThrottleMode = 'speed' | 'drag';

export class Flight {
  /** Temps (s), distance parcourue (m) et altitude (m). */
  t = 0;
  x = 0;
  h: number;
  /** Vitesse vraie (m/s), pente et incidence (rad). */
  V: number;
  gamma = 0;
  alpha: number;
  thrust: number;
  /** Position du manche, de −1 (poussé à fond) à 1 (tiré à fond). 0 : l'incidence du palier de départ. */
  stick = 0;
  throttle: ThrottleMode = 'speed';

  /** Facteurs de charge ressentis en cabine : normal (vers le plancher) et longitudinal (vers l'avant). */
  nz = 1;
  nx = 0;
  /** Vitesse de tangage (rad/s). */
  pitchRate = 0;
  /** Les protections ont rogné la commande (le manche demande plus que ce que l'avion accepte). */
  limited = false;
  lift = 0;
  drag = 0;

  /** Incidence du palier de départ : la position neutre du manche. */
  readonly alphaRef: number;
  /** Rafale verticale (m/s) : un bruit corrélé, pour les quelques centièmes de g d'un vol réel. */
  gust = 0;
  private readonly rng: Rng;

  constructor(h: number = CONFIG.cruise.altitude, V: number = CONFIG.cruise.speed, seed = 1) {
    this.rng = new Rng(seed);
    this.h = h;
    this.V = V;
    this.alphaRef = this.alphaForN(1);
    this.alpha = this.alphaRef;
    this.thrust = this.dragAt(this.alpha);
    this.lift = this.liftAt(this.alpha);
    this.drag = this.thrust;
  }

  /** Assiette : l'angle du fuselage avec l'horizontale. */
  get theta(): number {
    return this.gamma + this.alpha;
  }

  /** Pression dynamique ½ρV² (Pa). */
  get q(): number {
    return 0.5 * density(this.h) * this.V * this.V;
  }

  get vs(): number {
    return this.V * Math.sin(this.gamma);
  }

  get mach(): number {
    return this.V / soundSpeed(this.h);
  }

  /**
   * Pente de portance corrigée de la compressibilité (Prandtl-Glauert) : à Mach 0,7, l'aile porte 40 % de
   * plus par degré d'incidence qu'à basse vitesse.
   */
  get clAlpha(): number {
    return A.clAlpha / Math.sqrt(1 - Math.min(0.8, this.mach) ** 2);
  }

  liftAt(alpha: number): number {
    return this.q * A.wingArea * this.clAlpha * (alpha - A.alpha0);
  }

  dragAt(alpha: number): number {
    const cl = this.clAlpha * (alpha - A.alpha0);
    return this.q * A.wingArea * (A.cd0 + A.k * cl * cl);
  }

  /** L'incidence qui donne un facteur de charge `n` à la vitesse actuelle (sans compter la poussée). */
  alphaForN(n: number): number {
    return A.alpha0 + (n * A.mass * gravity(this.h)) / (this.q * A.wingArea * this.clAlpha);
  }

  /** La position du manche qui commande l'incidence `alpha`. */
  stickForAlpha(alpha: number): number {
    return (alpha - this.alphaRef) / CONFIG.stick.gain;
  }

  /** Avance d'un pas `dt`. */
  step(dt: number): void {
    const g = gravity(this.h);
    const E = CONFIG.envelope;

    // Le manche commande l'incidence ; les protections la bornent au facteur de charge permis et avant le
    // décrochage. Puis l'incidence suit la commande avec un peu de retard.
    const wanted = this.alphaRef + this.stick * CONFIG.stick.gain;
    const hi = Math.min(this.alphaForN(E.nMax), A.alphaStall);
    const lo = this.alphaForN(E.nMin);
    const cmd = Math.max(lo, Math.min(hi, wanted));
    this.limited = cmd !== wanted;
    this.alpha += (cmd - this.alpha) * (1 - Math.exp(-dt / A.alphaLag));

    // La turbulence : une rafale verticale change l'incidence vue par l'aile (processus d'Ornstein-Uhlenbeck).
    const T_GUST = 1.5;
    this.gust +=
      (-this.gust / T_GUST) * dt + A.turbulence * Math.sqrt((2 * dt) / T_GUST) * this.rng.gauss();
    const q = this.q;
    const cl = this.clAlpha * (this.alpha + this.gust / this.V - A.alpha0);
    const L = q * A.wingArea * cl;
    const D = q * A.wingArea * (A.cd0 + A.k * cl * cl);
    this.lift = L;
    this.drag = D;

    // La poussée : le troisième pilote. Il anticipe sur le manche : dès que la portance commandée tombe, il
    // réduit pour compenser juste la traînée, et rien ne glisse vers l'avant ou l'arrière. Le reste du temps,
    // il tient la vitesse de croisière, sans dépasser 0,1 g vers l'arrière dans la ressource.
    const sinA = Math.sin(this.alpha);
    const cosA = Math.cos(this.alpha);
    const tMax = thrustMax(this.h, this.mach);
    const liftCmd = q * A.wingArea * this.clAlpha * (cmd - A.alpha0);
    this.throttle = liftCmd / (A.mass * g) < 0.5 ? 'drag' : 'speed';
    // En apesanteur, il surveille aussi l'accéléromètre longitudinal et corrige ce qui reste.
    const want =
      this.throttle === 'drag'
        ? D / cosA - 2.5 * A.mass * G0 * this.nx
        : Math.min(
            (D + 0.1 * A.mass * G0) / cosA,
            D + A.mass * (g * Math.sin(this.gamma) + 0.35 * (CONFIG.cruise.speed - this.V)),
          );
    const target = Math.max(A.idle * tMax, Math.min(tMax, want));
    // Les réacteurs réduisent plus vite qu'ils n'accélèrent.
    const spool = target < this.thrust ? A.spool * 0.35 : A.spool;
    this.thrust += (target - this.thrust) * (1 - Math.exp(-dt / spool));
    const T = this.thrust;

    // Les équations du mouvement, sur la trajectoire.
    const fAlong = (T * cosA - D) / A.mass;
    const fNormal = (L + T * sinA) / A.mass;
    const theta0 = this.theta;
    this.V = Math.max(40, this.V + (fAlong - g * Math.sin(this.gamma)) * dt);
    this.gamma += ((fNormal - g * Math.cos(this.gamma)) / this.V) * dt;
    this.h += this.V * Math.sin(this.gamma) * dt;
    this.x += this.V * Math.cos(this.gamma) * dt;
    this.t += dt;
    this.pitchRate = (this.theta - theta0) / dt;

    // Ce que ressent la cabine : la force spécifique projetée sur les axes du fuselage.
    this.nx = (fAlong * cosA + fNormal * sinA) / G0;
    this.nz = (fNormal * cosA - fAlong * sinA) / G0;
  }
}
