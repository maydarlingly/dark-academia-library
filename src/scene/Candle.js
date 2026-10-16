import * as THREE from 'three';
import { createDotTexture } from './textures.js';

/** Псевдослучайное мерцание в диапазоне [-1, 1]: сумма несоизмеримых синусоид. */
export function flicker(t, seed) {
  return (
    0.5 * Math.sin(t * 9.1 + seed) +
    0.3 * Math.sin(t * 15.7 + seed * 1.7) +
    0.2 * Math.sin(t * 31.3 + seed * 2.3)
  );
}

// Общие ресурсы для всех свечей
const waxMaterial = new THREE.MeshStandardMaterial({
  color: '#e9dcc0',
  roughness: 0.6,
  emissive: '#5a3010',
  emissiveIntensity: 0.18,
});
const wickMaterial = new THREE.MeshBasicMaterial({ color: '#1a120c' });
// Цвет > 1 — «яркость» выше белого, именно это подхватывает bloom
const flameMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 0.9) });

const flameGeometry = new THREE.LatheGeometry(
  [
    [0, -0.12],
    [0.38, -0.05],
    [0.5, 0.15],
    [0.42, 0.42],
    [0.24, 0.7],
    [0.07, 0.93],
    [0, 1],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  14,
);
const wickGeometry = new THREE.CylinderGeometry(0.0016, 0.0016, 0.014, 5);

let haloTexture;

/**
 * Группа свечей с одним общим источником света.
 * Один PointLight на группу, а не на каждую свечу, — так дешевле для GPU.
 */
export class CandleCluster extends THREE.Group {
  constructor({
    candles = [{ x: 0, z: 0, height: 0.2, radius: 0.022 }],
    light = { color: '#ffa94d', intensity: 3, distance: 7, y: 0.4 },
    seed = 1,
  } = {}) {
    super();
    this.seed = seed;
    this.flames = [];
    haloTexture ??= createDotTexture();

    for (const { x = 0, z = 0, height = 0.2, radius = 0.022 } of candles) {
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.94, radius, height, 20), waxMaterial);
      wax.position.set(x, height / 2, z);
      wax.castShadow = true;

      const wick = new THREE.Mesh(wickGeometry, wickMaterial);
      wick.position.set(x, height + 0.006, z);

      const flame = new THREE.Mesh(flameGeometry, flameMaterial);
      flame.position.set(x, height + 0.008, z);
      flame.scale.set(0.011, 0.034, 0.011);
      flame.userData.base = { x, scale: flame.scale.clone() };

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTexture,
          color: '#ffb469',
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      halo.position.set(x, height + 0.03, z);
      halo.scale.setScalar(0.16);

      this.add(wax, wick, flame, halo);
      this.flames.push(flame);
    }

    this.light = new THREE.PointLight(light.color, light.intensity, light.distance, 2);
    this.light.position.set(0, light.y, 0);
    this.baseIntensity = light.intensity;
    this.add(this.light);
  }

  update(t) {
    const f = flicker(t, this.seed);
    this.light.intensity = this.baseIntensity * (1 + 0.12 * f);

    this.flames.forEach((flame, i) => {
      const { x, scale } = flame.userData.base;
      const fi = flicker(t * 1.35, this.seed + i * 3.1);
      flame.scale.set(scale.x * (1 - 0.07 * fi), scale.y * (1 + 0.16 * fi), scale.z * (1 - 0.07 * fi));
      flame.position.x = x + 0.0015 * Math.sin(t * 4.3 + i * 1.7 + this.seed);
    });
  }
}

const ironMaterial = new THREE.MeshStandardMaterial({ color: '#1c1714', metalness: 0.75, roughness: 0.45 });

/** Напольный кованый канделябр на три свечи. */
export class Candelabra extends THREE.Group {
  constructor({ seed = 1, intensity = 3.2 } = {}) {
    super();

    const parts = [
      [new THREE.CylinderGeometry(0.15, 0.19, 0.05, 28), 0.025],
      [new THREE.CylinderGeometry(0.05, 0.09, 0.08, 20), 0.09],
      [new THREE.CylinderGeometry(0.016, 0.022, 1.4, 12), 0.83],
      [new THREE.SphereGeometry(0.038, 18, 12), 0.62],
      [new THREE.SphereGeometry(0.03, 18, 12), 1.25],
      [new THREE.CylinderGeometry(0.13, 0.05, 0.05, 28), 1.545],
    ];
    for (const [geometry, y] of parts) {
      const mesh = new THREE.Mesh(geometry, ironMaterial);
      mesh.position.y = y;
      mesh.castShadow = true;
      this.add(mesh);
    }

    this.candles = new CandleCluster({
      seed,
      candles: [
        { x: 0, z: 0, height: 0.27 },
        { x: 0.075, z: 0.035, height: 0.19, radius: 0.02 },
        { x: -0.07, z: 0.045, height: 0.22, radius: 0.021 },
      ],
      light: { color: '#ffa04a', intensity, distance: 8, y: 0.42 },
    });
    this.candles.position.y = 1.57;
    this.add(this.candles);
  }

  update(t) {
    this.candles.update(t);
  }
}
