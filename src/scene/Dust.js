import * as THREE from 'three';
import { createDotTexture, rng } from './textures.js';

/** Пылинки, медленно парящие в тёплом свете. */
export class Dust extends THREE.Points {
  constructor({ count = 420, min = [-4.6, 0.1, -4.6], max = [4.6, 4.2, 5.5], seed = 7 } = {}) {
    const rand = rng(seed);
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) positions[i * 3 + k] = min[k] + rand() * (max[k] - min[k]);
      speeds[i] = 0.015 + rand() * 0.05;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    super(
      geometry,
      new THREE.PointsMaterial({
        size: 0.014,
        map: createDotTexture(),
        color: '#ffd9a0',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    this.name = 'dust';
    this.speeds = speeds;
    this.bounds = { min, max };
  }

  update(t, dt) {
    const positions = this.geometry.attributes.position;
    const array = positions.array;
    const { min, max } = this.bounds;
    for (let i = 0; i < this.speeds.length; i++) {
      const j = i * 3;
      array[j] += Math.sin(t * 0.25 + i) * 0.02 * dt;
      array[j + 1] += this.speeds[i] * dt * Math.sin(t * 0.1 + i * 0.37);
      array[j + 2] += Math.cos(t * 0.2 + i * 1.3) * 0.015 * dt;
      if (array[j + 1] > max[1]) array[j + 1] = min[1];
      if (array[j + 1] < min[1]) array[j + 1] = max[1];
    }
    positions.needsUpdate = true;
  }
}
