import {
  CatmullRomCurve3,
  Group,
  InstancedMesh,
  LatheGeometry,
  Material,
  Matrix4,
  Mesh,
  BoxGeometry,
  Quaternion,
  SplineCurve,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';

/** Hauteur du dessus du socle, là où le pied de la coupe se pose. */
export const BASE_Y = 1.3;
/** Hauteur du couvercle de la coupe : la banane s'y tient. */
export const LID_Y = 4;

/** Le pied, le fût, la coupe et son couvercle : une coupe de Grand Prix, tournée au tour. */
function cupProfile(): Vector2[] {
  const pts: [number, number][] = [
    [0, BASE_Y],
    [0.95, BASE_Y],
    [0.95, 1.42],
    [0.82, 1.5],
    [0.5, 1.62],
    [0.33, 1.78],
    [0.3, 1.95],
    [0.3, 2.55],
    [0.42, 2.66],
    [0.46, 2.78],
    [0.42, 2.9],
    [0.3, 3.0],
    [0.3, 3.12],
    [0.52, 3.3],
    [0.86, 3.5],
    [1.04, 3.75],
    [1.08, 3.92],
    [1.12, 3.97],
    [1.0, LID_Y - 0.02],
    [0.7, LID_Y + 0.01],
    [0.3, LID_Y + 0.06],
    [0, LID_Y + 0.08],
  ];
  return new SplineCurve(pts.map(([r, y]) => new Vector2(r, y))).getPoints(220);
}

/** Une anse en oreille, de la panse de la coupe jusqu'au bord. */
function handle(gold: Material): Mesh {
  const curve = new CatmullRomCurve3([
    new Vector3(0.45, 3.28, 0),
    new Vector3(0.98, 3.08, 0),
    new Vector3(1.55, 3.26, 0),
    new Vector3(1.7, 3.64, 0),
    new Vector3(1.4, 3.88, 0),
    new Vector3(0.98, 3.8, 0),
  ]);
  return new Mesh(new TubeGeometry(curve, 64, 0.075, 14), gold);
}

/**
 * Une trace de pneu en spirale autour du fût : une chenille de petites barrettes dorées, comme les
 * sculptures d'un pneu. C'est le « drift » du trophée.
 */
function tireTrack(gold: Material): InstancedMesh {
  const turns = 2.6;
  const count = 80;
  const y0 = 1.88;
  const y1 = 2.62;
  const radius = 0.3;
  const mesh = new InstancedMesh(new BoxGeometry(0.035, 0.05, 0.17), gold, count);
  const m = new Matrix4();
  const q = new Quaternion();
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const a = t * turns * Math.PI * 2;
    const p = new Vector3(Math.cos(a) * radius, y0 + (y1 - y0) * t, Math.sin(a) * radius);
    // La barrette est posée en travers de la spirale, à plat sur le fût.
    const tangent = new Vector3(-Math.sin(a), (y1 - y0) / (turns * Math.PI * 2 * radius), Math.cos(a)).normalize();
    const normal = new Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new Vector3().crossVectors(tangent, normal).normalize();
    m.makeBasis(tangent, normal, side);
    q.setFromRotationMatrix(m);
    m.compose(p, q, new Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function buildCup(gold: Material): Group {
  const group = new Group();
  group.add(new Mesh(new LatheGeometry(cupProfile(), 128), gold));
  const left = handle(gold);
  const right = handle(gold);
  right.rotation.y = Math.PI;
  group.add(left, right, tireTrack(gold));
  return group;
}
