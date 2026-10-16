import * as THREE from 'three';
import { CandleCluster, flicker } from './Candle.js';
import { createPortraitTexture, createStoneTexture, createWoodTexture } from './textures.js';

/** Языки пламени: fbm-шум, бегущий вверх и сужающийся к верху. */
const fireShader = {
  uniforms: { uTime: { value: 0 }, uIntensity: { value: 2.6 }, uSeed: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uIntensity;
    uniform float uSeed;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = vUv;
      float n = fbm(vec2(uv.x * 3.2 + uSeed, uv.y * 2.4 - uTime * 1.5));
      float width = abs(uv.x - 0.5) * (1.3 + uv.y * 2.2);
      float shape = 1.0 - smoothstep(0.0, 0.5, width);
      float fire = shape * (1.0 - smoothstep(0.25, 0.95, uv.y + n * 0.6 - 0.15));
      fire = pow(clamp(fire * 1.7, 0.0, 1.0), 1.5);

      vec3 color = mix(vec3(0.85, 0.16, 0.02), vec3(1.0, 0.58, 0.16), smoothstep(0.15, 0.55, fire));
      color = mix(color, vec3(1.0, 0.88, 0.6), smoothstep(0.7, 1.0, fire));
      gl_FragColor = vec4(color * fire * uIntensity, fire);
    }
  `,
};

/**
 * Каменный камин. Строится в локальных координатах, где стена — плоскость x = 0,
 * а комната — в сторону +X. Центр по оси Z.
 */
export class Fireplace extends THREE.Group {
  constructor() {
    super();
    this.fires = [];

    const stone = new THREE.MeshStandardMaterial({ map: createStoneTexture(), roughness: 0.92 });
    const soot = new THREE.MeshStandardMaterial({ color: '#0b0806', roughness: 1 });
    const wood = new THREE.MeshStandardMaterial({ map: createWoodTexture({ seed: 77, base: '#2a170c' }), roughness: 0.5 });
    const logs = new THREE.MeshStandardMaterial({
      color: '#1a0f08',
      roughness: 0.95,
      emissive: '#ff4410',
      emissiveIntensity: 0.4,
    });
    this.logMaterial = logs;

    const box = (w, h, d, material, x, y, z, { cast = true } = {}) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      this.add(mesh);
      return mesh;
    };

    // Портал: две колонны, перемычка, полка-мантель, под
    box(0.44, 1.22, 0.38, stone, 0.22, 0.61, 0.79);
    box(0.44, 1.22, 0.38, stone, 0.22, 0.61, -0.79);
    box(0.44, 0.32, 1.96, stone, 0.22, 1.38, 0);
    box(0.58, 0.08, 2.3, wood, 0.29, 1.58, 0);
    box(0.95, 0.05, 2.2, stone, 0.475, 0.025, 0);
    box(0.04, 1.22, 1.2, soot, 0.02, 0.61, 0);

    // Поленья
    const logGeometry = new THREE.CylinderGeometry(0.065, 0.075, 0.82, 10);
    for (const [x, y, rotX, rotY] of [
      [0.17, 0.12, Math.PI / 2, 0],
      [0.27, 0.12, Math.PI / 2, 0.12],
      [0.22, 0.24, Math.PI / 2, -0.35],
    ]) {
      const log = new THREE.Mesh(logGeometry, logs);
      log.position.set(x, y, 0);
      log.rotation.set(rotX, rotY, 0);
      log.castShadow = true;
      this.add(log);
    }

    // Огонь: несколько скрещенных плоскостей с шейдером
    const fireGeometry = new THREE.PlaneGeometry(0.95, 0.85);
    fireGeometry.translate(0, 0.425, 0);
    for (const [angle, seed] of [
      [Math.PI / 2, 0],
      [Math.PI / 2 + 0.6, 4.2],
      [Math.PI / 2 - 0.6, 9.7],
    ]) {
      const material = new THREE.ShaderMaterial({
        ...fireShader,
        uniforms: THREE.UniformsUtils.clone(fireShader.uniforms),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      material.uniforms.uSeed.value = seed;
      const fire = new THREE.Mesh(fireGeometry, material);
      fire.position.set(0.22, 0.1, 0);
      fire.rotation.y = angle;
      this.add(fire);
      this.fires.push(material);
    }

    // Главный тёплый свет комнаты — с тенями
    this.light = new THREE.PointLight('#ff7a2e', 14, 16, 1.6);
    this.light.position.set(0.55, 0.55, 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.003;
    this.light.shadow.radius = 4;
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = 16;
    this.baseIntensity = this.light.intensity;
    this.add(this.light);

    // Портрет над камином в золочёной раме
    const frame = new THREE.MeshStandardMaterial({ color: '#8a6a2e', metalness: 0.85, roughness: 0.38 });
    box(0.06, 1.12, 0.9, frame, 0.03, 2.48, 0);
    const portrait = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 0.96),
      new THREE.MeshStandardMaterial({ map: createPortraitTexture(), roughness: 0.55 }),
    );
    portrait.position.set(0.062, 2.48, 0);
    portrait.rotation.y = Math.PI / 2;
    portrait.receiveShadow = true;
    this.add(portrait);

    // Пара свечей на каминной полке
    this.candles = new CandleCluster({
      seed: 3.3,
      candles: [
        { x: 0, z: 0.85, height: 0.24 },
        { x: 0.04, z: 0.72, height: 0.16, radius: 0.019 },
        { x: 0, z: -0.85, height: 0.21 },
      ],
      light: { color: '#ffab55', intensity: 1.6, distance: 5, y: 0.45 },
    });
    this.candles.position.set(0.32, 1.62, 0);
    this.add(this.candles);
  }

  update(t) {
    const f = flicker(t * 1.6, 0.7);
    this.light.intensity = this.baseIntensity * (1 + 0.22 * f);
    this.light.position.z = 0.04 * Math.sin(t * 2.3);
    this.logMaterial.emissiveIntensity = 0.35 + 0.12 * f;
    for (const fire of this.fires) fire.uniforms.uTime.value = t;
    this.candles.update(t);
  }
}
