import { segmentKey } from './network';

/** Ce qu'un incident bloque physiquement. */
export interface Footprint {
  /** Stations où aucune rame ne peut entrer ni repartir. */
  stations?: readonly number[];
  /** Tronçons (non orientés) que plus aucune rame ne franchit ; celles qui y sont restent sur place. */
  edges?: readonly (readonly [number, number])[];
  /** Coupure de courant : les rames de ces stations (et des tronçons qui les touchent) sont figées. */
  freeze?: boolean;
  /** Quais évacués (colis suspect, cortège, inondation) : simple indication pour l'affichage. */
  close?: boolean;
}

/**
 * Les obstructions physiques du moment, posées et levées par les incidents. Elles sont identiques chez le joueur
 * et chez le fantôme ; elles arrêtent ou figent les rames mais ne changent jamais les parcours (c'est le plan du
 * joueur qui le fait).
 */
export class Obstructions {
  private readonly items = new Map<string, Footprint>();
  readonly stations = new Set<number>();
  readonly edges = new Set<string>();
  readonly frozen = new Set<number>();
  readonly closed = new Set<number>();
  version = 0;

  set(id: string, fp: Footprint): void {
    this.items.set(id, fp);
    this.rebuild();
  }

  clear(id: string): void {
    if (this.items.delete(id)) this.rebuild();
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  blocksEdge(a: number, b: number): boolean {
    return this.edges.has(segmentKey(a, b));
  }

  private rebuild(): void {
    this.stations.clear();
    this.edges.clear();
    this.frozen.clear();
    this.closed.clear();
    for (const fp of this.items.values()) {
      for (const s of fp.stations ?? []) {
        this.stations.add(s);
        if (fp.freeze) this.frozen.add(s);
        if (fp.close) this.closed.add(s);
      }
      for (const [a, b] of fp.edges ?? []) this.edges.add(segmentKey(a, b));
    }
    this.version++;
  }
}
