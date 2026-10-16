import * as THREE from 'three';
import { Fireplace } from './Fireplace.js';
import {
  createFloorTexture,
  createNightSkyTexture,
  createRugTexture,
  createWainscotTexture,
  createWallpaperTexture,
  createWoodTexture,
} from './textures.js';

/** Габариты зала в метрах. Задняя стена — там, где стоят шкафы. */
export const ROOM = {
  width: 8,
  height: 4.4,
  back: -4.8,
  front: 8,
  wainscot: 1.1,
};

export const WINDOW = { z: -2.3, y: 2.45, width: 1.5, height: 2.5 };

export class Room extends THREE.Group {
  constructor() {
    super();
    this.name = 'room';
    this.updatables = [];

    this.wood = new THREE.MeshStandardMaterial({ map: createWoodTexture({ seed: 9 }), roughness: 0.55 });

    this.#buildShell();
    this.#buildWainscot();
    this.#buildCeiling();
    this.#buildRug();
    this.#buildWindow();

    this.fireplace = new Fireplace();
    this.fireplace.position.set(-ROOM.width / 2, 0, -2.3);
    this.add(this.fireplace);
    this.updatables.push(this.fireplace);
  }

  get depth() {
    return ROOM.front - ROOM.back;
  }

  get centerZ() {
    return (ROOM.front + ROOM.back) / 2;
  }

  #buildShell() {
    const { width: W, height: H, back, front } = ROOM;
    const D = this.depth;

    const floorMap = createFloorTexture();
    floorMap.repeat.set(W / 2, D / 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.6 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = this.centerZ;
    floor.receiveShadow = true;
    this.add(floor);

    const wallpaper = createWallpaperTexture();
    const wallMaterial = (repeatX, repeatY) => {
      const map = wallpaper.clone();
      map.repeat.set(repeatX, repeatY);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.92 });
    };

    const addWall = (geometry, material, position, rotationY, castShadow = false) => {
      const wall = new THREE.Mesh(geometry, material);
      wall.position.copy(position);
      wall.rotation.y = rotationY;
      wall.receiveShadow = true;
      wall.castShadow = castShadow;
      this.add(wall);
      return wall;
    };

    addWall(new THREE.PlaneGeometry(W, H), wallMaterial(W, H), new THREE.Vector3(0, H / 2, back), 0);
    addWall(new THREE.PlaneGeometry(W, H), wallMaterial(W, H), new THREE.Vector3(0, H / 2, front), Math.PI);
    addWall(new THREE.PlaneGeometry(D, H), wallMaterial(D, H), new THREE.Vector3(-W / 2, H / 2, this.centerZ), Math.PI / 2);

    // Правая стена с проёмом под окно. Она отбрасывает тень,
    // поэтому лунный свет попадает в зал только через окно.
    const wallShape = new THREE.Shape()
      .moveTo(back, 0)
      .lineTo(front, 0)
      .lineTo(front, H)
      .lineTo(back, H)
      .closePath();
    const { z, y, width, height } = WINDOW;
    wallShape.holes.push(
      new THREE.Path()
        .moveTo(z - width / 2, y - height / 2)
        .lineTo(z + width / 2, y - height / 2)
        .lineTo(z + width / 2, y + height / 2)
        .lineTo(z - width / 2, y + height / 2)
        .closePath(),
    );
    // UV у ShapeGeometry — в метрах, поэтому repeat = 1
    addWall(new THREE.ShapeGeometry(wallShape), wallMaterial(1, 1), new THREE.Vector3(W / 2, 0, 0), -Math.PI / 2, true);
  }

  /** Деревянные панели, плинтус, поручень и карниз по периметру. */
  #buildWainscot() {
    const { width: W, back, front, wainscot: h } = ROOM;
    const D = this.depth;
    const panelMap = createWainscotTexture();

    const walls = [W, W, D, D].map((length) => {
      const map = panelMap.clone();
      map.repeat.set(Math.round(length / 0.95), 1);
      return { length, panels: new THREE.MeshStandardMaterial({ map, roughness: 0.5 }) };
    });
    const place = [
      (t) => [0, back + t / 2, true],
      (t) => [0, front - t / 2, true],
      (t) => [-W / 2 + t / 2, this.centerZ, false],
      (t) => [W / 2 - t / 2, this.centerZ, false],
    ];

    const strip = (y, height, thickness, materialFor) => {
      walls.forEach((wall, i) => {
        const [x, z, alongX] = place[i](thickness);
        const size = alongX ? [wall.length, height, thickness] : [thickness, height, wall.length];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materialFor(wall));
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        this.add(mesh);
      });
    };

    strip(h / 2, h, 0.035, (wall) => wall.panels); // филёнки
    strip(0.07, 0.14, 0.06, () => this.wood); // плинтус
    strip(h, 0.06, 0.07, () => this.wood); // поручень
    strip(ROOM.height - 0.07, 0.14, 0.09, () => this.wood); // карниз
  }

  #buildCeiling() {
    const { width: W, height: H, back, front } = ROOM;
    const ceilingMap = createWoodTexture({ seed: 13, base: '#1d120a' });
    ceilingMap.repeat.set(W / 2, this.depth / 2);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(W, this.depth),
      new THREE.MeshStandardMaterial({ map: ceilingMap, roughness: 0.85 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H, this.centerZ);
    ceiling.receiveShadow = true;
    this.add(ceiling);

    const beamGeometry = new THREE.BoxGeometry(W, 0.26, 0.22);
    for (let z = back + 1.1; z < front; z += 2.2) {
      const beam = new THREE.Mesh(beamGeometry, this.wood);
      beam.position.set(0, H - 0.13, z);
      beam.receiveShadow = true;
      this.add(beam);
    }
  }

  #buildRug() {
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 4.6),
      new THREE.MeshStandardMaterial({ map: createRugTexture(), roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.006, -0.3);
    rug.receiveShadow = true;
    this.add(rug);
  }

  /** Высокое окно с переплётом и ночным небом. Тени от переплёта ложатся на пол. */
  #buildWindow() {
    const { width: W } = ROOM;
    const { z, y, width, height } = WINDOW;
    const x = W / 2;

    const part = (w, h, d, px, py, pz) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.wood);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    };

    // Рама и подоконник
    part(0.3, 0.12, width + 0.24, x - 0.05, y + height / 2 + 0.06, z);
    part(0.42, 0.07, width + 0.4, x - 0.14, y - height / 2 - 0.035, z);
    part(0.3, height, 0.12, x - 0.05, y, z - width / 2 - 0.06);
    part(0.3, height, 0.12, x - 0.05, y, z + width / 2 + 0.06);

    // Переплёт
    part(0.04, height, 0.04, x + 0.02, y, z);
    for (const k of [-0.25, 0, 0.25]) part(0.04, 0.04, width, x + 0.02, y + height * k, z);

    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.2, height + 0.2),
      new THREE.MeshBasicMaterial({ map: createNightSkyTexture(), color: '#8ea3c8' }),
    );
    sky.position.set(x + 0.14, y, z);
    sky.rotation.y = -Math.PI / 2;
    this.add(sky);
  }

  update(t, dt) {
    for (const item of this.updatables) item.update(t, dt);
  }
}
