import {
  BackSide,
  FrontSide,
  Side,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Scene,
  Texture,
  WebGLRenderer,
} from 'three';

/**
 * L'environnement qui se reflète dans l'or et le marbre : une salle de gala aux murs chauds, un plafond
 * lumineux, un sol qui renvoie la lumière, et quelques boîtes à lumière (une chaude en haut à gauche,
 * un liseré froid derrière). Sur du métal, ce sont ces grandes surfaces qui donnent les bandes de
 * reflet d'une vraie photo de statuette : sans elles, l'or reflète du noir et paraît noir.
 */
export function studioEnvironment(renderer: WebGLRenderer): Texture {
  const scene = new Scene();
  const add = (w: number, h: number, d: number, color: Color, x: number, y: number, z: number, side: Side = FrontSide) => {
    const m = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ color, side }));
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };

  add(44, 30, 44, new Color(0.2, 0.13, 0.08), 0, 8, 0, BackSide); // murs : un brun chaud, pas du noir
  add(40, 0.3, 40, new Color(2.6, 2.2, 1.6), 0, 15, 0); // plafond lumineux
  add(40, 0.3, 40, new Color(0.95, 0.62, 0.34), 0, -4, 0); // sol : rebond chaud

  const panel = (w: number, h: number, color: Color, x: number, y: number, z: number) => {
    const m = add(w, h, 0.2, color, x, y, z);
    m.lookAt(0, 3, 0);
  };
  panel(9, 12, new Color(8, 6.4, 4.4), -11, 8, 10); // clé chaude, devant à gauche
  panel(3, 14, new Color(2.4, 3.4, 5.2), 12, 6, -9); // liseré froid, derrière à droite
  panel(7, 9, new Color(3.2, 2.2, 1.4), 13, 4, 9); // rappel chaud, devant à droite
  panel(24, 4, new Color(1.8, 1.4, 1), 0, 2, 16); // grande bande basse devant
  panel(4, 10, new Color(2.6, 2.2, 1.8), -14, 5, -6); // liseré derrière à gauche

  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
  });
  return texture;
}
