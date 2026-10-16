import * as THREE from 'three';
import { ROOM, WINDOW } from './Room.js';

/**
 * Общий свет зала. Тёплые источники (камин, свечи) живут рядом со своими объектами,
 * здесь — только «фон»: еле заметный заполняющий свет и холодная луна из окна.
 */
export function createLighting(scene) {
  const ambient = new THREE.AmbientLight('#4a3426', 0.5);

  // Сверху — холодный отсвет ночи, снизу — тёплый отражённый от пола
  const hemi = new THREE.HemisphereLight('#2c3a58', '#2a170b', 0.45);

  // Лунный луч проходит через окно и рисует на полу тени переплёта
  const moon = new THREE.SpotLight('#9fb6e6', 90, 22, 0.42, 0.55, 1.2);
  moon.position.set(ROOM.width / 2 + 3.6, 5.4, WINDOW.z + 0.8);
  // Целимся так, чтобы луч прошёл через центр окна и упал на пол
  const wallX = ROOM.width / 2;
  const toFloor = moon.position.y / (moon.position.y - WINDOW.y);
  moon.target.position.set(
    moon.position.x - (moon.position.x - wallX) * toFloor,
    0,
    moon.position.z - (moon.position.z - WINDOW.z) * toFloor,
  );
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.bias = -0.0006;
  moon.shadow.radius = 3;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 16;

  scene.add(ambient, hemi, moon, moon.target);
  return { ambient, hemi, moon };
}
