import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { Room, ROOM } from './Room.js';
import { createLighting } from './Lighting.js';
import { Bookshelf } from './Bookshelf.js';
import { Candelabra } from './Candle.js';
import { Dust } from './Dust.js';

const BASE_FOV = 48;
const MIN_ASPECT = 1.25; // уже этого соотношения держим горизонтальный угол обзора
const EXPOSURE = 1.3;
const BACKGROUND = '#0b0806';

/** Куда смотрит камера в «обзорном» режиме и откуда начинается вступление. */
const HOME = {
  position: new THREE.Vector3(0, 1.62, 4.2),
  target: new THREE.Vector3(0, 1.55, ROOM.back),
};
const INTRO_FROM = new THREE.Vector3(0, 1.95, 7.6);

/**
 * Корневой объект 3D-сцены: рендерер, камера, свет, мир и цикл анимации.
 * Объекты с методом update(t, dt) добавляются в this.updatables.
 */
export class Experience {
  constructor(canvas, { catalog }) {
    this.canvas = canvas;
    this.catalog = catalog;
    this.updatables = [];
    this.interactive = []; // сюда будут регистрироваться книги для Raycaster
    this.hovered = null;

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();

    // «Риг» камеры: GSAP анимирует position/target, а параллакс от мыши добавляется сверху
    this.rig = { position: INTRO_FROM.clone(), target: HOME.target.clone(), parallax: 1 };

    this.#initRenderer();
    this.#initScene();
    this.#initCamera();
    this.#initPostprocessing();
    this.#buildWorld();
    this.#bindEvents();
    this.#onResize();

    this.renderer.setAnimationLoop(this.#tick);
  }

  #initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0; // проявится во вступлении
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  #initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.fog = new THREE.FogExp2(BACKGROUND, 0.035);

    // Очень слабое окружение — чтобы латунь и лак ловили блики
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.06;
    pmrem.dispose();
  }

  #initCamera() {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 60);
    this.camera.position.copy(this.rig.position);
    this.camera.lookAt(this.rig.target);
  }

  #initPostprocessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Светятся только самые яркие точки — пламя свечей и огонь камина
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  #buildWorld() {
    this.room = new Room();
    this.scene.add(this.room);
    this.updatables.push(this.room);

    this.lights = createLighting(this.scene);

    // Пока один пустой шкаф — первого жанра из каталога
    const genre = this.catalog?.genres?.[0] ?? { id: 'gothic', title: 'Готический роман' };
    this.shelf = new Bookshelf({ genre });
    this.shelf.position.set(0, 0, ROOM.back + this.shelf.depth / 2 + 0.04);
    this.scene.add(this.shelf);
    this.shelves = [this.shelf];

    for (const [x, seed] of [
      [-2.15, 1.3],
      [2.15, 7.7],
    ]) {
      const candelabra = new Candelabra({ seed, intensity: 5 });
      candelabra.position.set(x, 0, ROOM.back + 0.7);
      this.scene.add(candelabra);
      this.updatables.push(candelabra);
    }

    this.dust = new Dust();
    this.scene.add(this.dust);
    this.updatables.push(this.dust);
  }

  #bindEvents() {
    window.addEventListener('resize', this.#onResize);
    window.addEventListener('pointermove', this.#onPointerMove);
    this.canvas.addEventListener('click', this.#onClick);
  }

  #onResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    this.camera.aspect = aspect;
    // На узких экранах расширяем вертикальный угол, чтобы шкаф целиком влезал по ширине
    this.camera.fov =
      aspect < MIN_ASPECT
        ? THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) * MIN_ASPECT) / aspect))
        : BASE_FOV;
    this.camera.updateProjectionMatrix();

    const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  };

  #onPointerMove = (event) => {
    this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  };

  #onClick = () => {
    this.hovered?.userData.onClick?.(this.hovered);
  };

  /** Наведение на интерактивные объекты (книги). Объект сам решает, что делать, через userData. */
  #updateHover() {
    if (!this.interactive.length) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.interactive, false)[0]?.object ?? null;
    if (hit === this.hovered) return;
    this.hovered?.userData.onPointerLeave?.(this.hovered);
    hit?.userData.onPointerEnter?.(hit);
    this.hovered = hit;
    this.canvas.style.cursor = hit ? 'pointer' : '';
  }

  #updateCamera(dt) {
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 2.5));
    const p = this.rig.parallax;
    this.camera.position.set(
      this.rig.position.x + this.pointerSmooth.x * 0.35 * p,
      this.rig.position.y + this.pointerSmooth.y * 0.16 * p,
      this.rig.position.z,
    );
    this.camera.lookAt(this.rig.target);
  }

  #tick = (timestamp) => {
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const t = this.timer.getElapsed();

    for (const item of this.updatables) item.update(t, dt);
    this.#updateCamera(dt);
    this.#updateHover();
    this.composer.render(dt);
  };

  /** Предкомпиляция шейдеров (параллельно, через KHR_parallel_shader_compile). */
  warmUp() {
    return this.renderer.compileAsync(this.scene, this.camera);
  }

  /** Вступление: свет разгорается, камера медленно входит в зал. */
  playIntro() {
    return gsap
      .timeline()
      .to(this.renderer, { toneMappingExposure: EXPOSURE, duration: 3, ease: 'power2.out' }, 0)
      .to(this.rig.position, { x: HOME.position.x, y: HOME.position.y, z: HOME.position.z, duration: 3.6, ease: 'power3.inOut' }, 0);
  }

  /**
   * Плавный перелёт камеры. Используется для подлёта к книге:
   *   experience.flyTo({ position: new Vector3(...), target: book.getWorldPosition(new Vector3()) })
   */
  flyTo({ position, target, duration = 1.6, parallax = 0.15 }) {
    return gsap
      .timeline({ defaults: { duration, ease: 'power3.inOut' } })
      .to(this.rig.position, { x: position.x, y: position.y, z: position.z }, 0)
      .to(this.rig.target, { x: target.x, y: target.y, z: target.z }, 0)
      .to(this.rig, { parallax }, 0);
  }

  /** Вернуть камеру в обзорную точку. */
  flyHome(duration = 1.6) {
    return this.flyTo({ position: HOME.position, target: HOME.target, duration, parallax: 1 });
  }

  /** Размыть сцену на заднем плане (режим чтения). */
  setDimmed(dimmed) {
    this.canvas.classList.toggle('is-dimmed', dimmed);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.#onResize);
    window.removeEventListener('pointermove', this.#onPointerMove);
    this.canvas.removeEventListener('click', this.#onClick);
    this.timer.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
