import * as THREE from 'three';
import { Bookshelf } from './Bookshelf.js';
import { BookModel, LIFT, createFillerSpineTexture, sharedBookMaterials, unitBox, unitTopPlane } from './Book.js';
import { rng } from './textures.js';

/** Полки шкафа (0 — нижняя), на которые по порядку встают жанры каталога. Остальные — декор. */
const GENRE_ROWS = [3, 2, 1, 4];

const LEATHER = ['#3b1514', '#4a1c17', '#2a2216', '#1d2a20', '#22283a', '#3a2a1a', '#2b1b2b', '#5a3a1e', '#171412', '#40301e', '#28160f'];
const FILLER_VARIANTS = 3;

const bookDepth = (height, slot) => THREE.MathUtils.clamp(height * 0.72, 0.13, slot.depth - 0.02);

/**
 * Шкаф с книгами. Книги из каталога — отдельные интерактивные модели с тиснёными корешками;
 * остальное пространство заполняют декоративные тома (InstancedMesh — один draw call на вариант).
 *
 * События (this.events):
 *   'hover'     — detail: book | null      (курсор на корешке / ушёл)
 *   'book-move' — detail: { book, out }    (книга выдвигается из ряда / задвигается обратно — для звука)
 *
 * pickTargets — все меши шкафа для Raycaster: у книг userData.kind = 'book', у остального — 'cabinet'.
 */
export class Library extends THREE.Group {
  constructor({ catalog }) {
    super();
    this.name = 'library';
    this.events = new EventTarget();
    this.models = new Map();
    this.interactive = [];
    this.hovered = null;
    this.selected = null;
    this.shelfMode = false; // камера у полки: книги каталога слегка светятся
    this.rowGenres = new Map(); // индекс полки → жанр

    this.shelf = new Bookshelf({ title: 'The Invisible Library' });
    this.add(this.shelf);
    this.#arrange(catalog);
    this.#collectPickTargets();
  }

  #collectPickTargets() {
    this.pickTargets = [];
    this.traverse((object) => {
      if (!object.isMesh) return;
      let model = null;
      for (let node = object; node && node !== this; node = node.parent) {
        if (node instanceof BookModel) {
          model = node;
          break;
        }
      }
      // Обрез страниц книги ведёт себя как сама книга
      if (model) Object.assign(object.userData, model.body.userData);
      else object.userData.kind = 'cabinet';
      object.userData.cursor = 'pointer';
      this.pickTargets.push(object);
    });
  }

  /** Номер полки (0 — нижняя), на уровне которой находится точка в мире. */
  rowAt(point) {
    const local = this.shelf.worldToLocal(point.clone());
    const index = this.shelf.slots.findLastIndex((slot) => local.y >= slot.y - 0.06);
    return THREE.MathUtils.clamp(index, 0, this.shelf.slots.length - 1);
  }

  get rowCount() {
    return this.shelf.slots.length;
  }

  rowLabel(index) {
    return this.rowGenres.get(index)?.title ?? 'Старинные фолианты';
  }

  /** Книги каталога на полке, слева направо. */
  rowBooks(index) {
    const slot = this.shelf.slots[index];
    return [...this.models.values()]
      .filter((model) => Math.abs(model.position.y - slot.y) < 1e-3)
      .sort((a, b) => a.position.x - b.position.x)
      .map((model) => model.book);
  }

  /** Полка и мировая координата X книги — чтобы вернуться к ней после карточки. */
  bookRow(bookId) {
    const model = this.models.get(bookId);
    const index = this.shelf.slots.findIndex((slot) => Math.abs(model.position.y - slot.y) < 1e-3);
    return { row: Math.max(0, index), x: model.getWorldPosition(new THREE.Vector3()).x };
  }

  /**
   * Ракурс «у полки»: камера прямо напротив ряда, книги крупные. На широком экране ряд виден почти
   * целиком, на узком — кусок, который можно прокручивать (возвращаемые maxPan и viewWidth).
   */
  rowView(index, centerX, camera) {
    const slot = this.shelf.slots[index];
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const viewWidth = THREE.MathUtils.clamp(1.9 * camera.aspect, 0.85, 2.7);
    const distance = Math.max(viewWidth / 2 / Math.tan(hfov / 2), 0.42 / Math.tan(vfov / 2));

    const overflow = slot.width - viewWidth; // ряд почти влез — прокрутка не нужна
    const maxPan = overflow > 0.15 ? overflow / 2 + 0.06 : 0;
    const localX = THREE.MathUtils.clamp(this.shelf.worldToLocal(new THREE.Vector3(centerX, 0, 0)).x, -maxPan, maxPan);
    const target = this.shelf.localToWorld(new THREE.Vector3(localX, slot.y + 0.17, this.shelf.depth / 2));
    const position = target.clone().add(new THREE.Vector3(0, 0.06, distance));
    return { position, target, x: target.x, maxPan, viewWidth };
  }

  /** Режим полки: книги каталога чуть светятся, чтобы их было видно среди декоративных томов. */
  setShelfMode(on) {
    if (this.shelfMode === on) return;
    this.shelfMode = on;
    for (const model of this.models.values()) this.#refresh(model);
  }

  /** Подсветить книгу из интерфейса (например, при наведении на её название в панели полки). */
  hover(bookId) {
    this.#setHovered(bookId ? (this.models.get(bookId) ?? null) : null);
  }

  get depth() {
    return this.shelf.depth;
  }

  has(bookId) {
    return this.models.has(bookId);
  }

  /** Выделить книгу (выдвинуть сильнее) или снять выделение — `null`. */
  select(bookId) {
    const previous = this.selected;
    this.selected = this.models.get(bookId) ?? null;
    if (previous) this.#refresh(previous);
    if (this.selected) this.#refresh(this.selected);
  }

  /**
   * Точка, откуда камере смотреть на книгу. На широком экране книга уходит влево
   * (справа — карточка), на узком — вверх (карточка снизу).
   */
  focusView(bookId, camera) {
    const model = this.models.get(bookId);
    const { height } = model.book.spine;
    const center = this.shelf.books.localToWorld(
      new THREE.Vector3(model.position.x, model.position.y + height / 2, model.restZ + LIFT.selected),
    );

    const narrow = camera.aspect < 1;
    const visibleHeight = narrow ? 1.25 : 0.8; // сколько метров по вертикали видно в кадре
    const distance = THREE.MathUtils.clamp(visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)), 0.3, 1.2);
    const shift = narrow ? new THREE.Vector3(0, -visibleHeight * 0.16, 0) : new THREE.Vector3(visibleHeight * camera.aspect * 0.18, 0, 0);

    const target = center.add(shift);
    const position = target.clone().add(new THREE.Vector3(0, 0.03, distance));
    return { position, target };
  }

  #arrange(catalog) {
    const rand = rng(1812);
    const fillers = [];
    const byGenre = new Map();
    for (const book of catalog.books) byGenre.set(book.genre, [...(byGenre.get(book.genre) ?? []), book]);
    const used = new Set();

    catalog.genres.forEach((genre, i) => {
      const index = GENRE_ROWS[i];
      if (index === undefined) return console.warn(`Для жанра «${genre.title}» не хватило полки`);
      used.add(index);
      this.rowGenres.set(index, genre);
      this.shelf.addRowLabel(index, genre.title);
      this.#fillRow(this.shelf.slots[index], byGenre.get(genre.id) ?? [], rand, fillers);
    });

    this.shelf.slots.forEach((slot, index) => {
      if (!used.has(index)) this.#fillRow(slot, [], rand, fillers, { folios: true });
    });

    this.#buildFillers(fillers);
  }

  #randomFiller(rand, folios) {
    const h = folios ? 0.3 + rand() * 0.09 : 0.19 + rand() * 0.11;
    const w = folios ? 0.045 + rand() * 0.045 : 0.022 + rand() * 0.036;
    return { h, w, color: LEATHER[Math.floor(rand() * LEATHER.length)], variant: Math.floor(rand() * FILLER_VARIANTS) };
  }

  /** Расставляет ряд слева направо: декор, книги каталога вперемешку с декором, иногда стопка в конце. */
  #fillRow(slot, books, rand, fillers, { folios = false } = {}) {
    const frontZ = this.shelf.depth / 2 - 0.035; // плоскость корешков
    const left = -slot.width / 2;
    const right = slot.width / 2;

    const stack = rand() < 0.5 ? this.#makeStack(rand, slot, right) : null;
    const limit = right - (stack ? stack.width + 0.025 : 0.005);
    let x = left + 0.01 + rand() * 0.03;

    const place = (width) => {
      if (x + width > limit) return null;
      const center = x + width / 2;
      x += width + rand() * 0.004;
      if (rand() < 0.03) x += 0.02 + rand() * 0.05; // кто-то взял книгу почитать
      return center;
    };
    const addFiller = () => {
      const f = this.#randomFiller(rand, folios);
      f.d = bookDepth(f.h, slot);
      const cx = place(f.w);
      if (cx === null) return false;
      fillers.push({ ...f, x: cx, y: slot.y, z: frontZ - f.d / 2 });
      return true;
    };

    // Книги каталога начинаются в случайном месте ряда, а не всегда у левой стенки
    for (let i = 2 + Math.floor(rand() * 34); i > 0; i--) addFiller();

    for (const book of books) {
      const depth = bookDepth(book.spine.height, slot);
      const cx = place(book.spine.thickness);
      if (cx === null) {
        console.warn(`Книга «${book.title}» не поместилась на полку`);
        continue;
      }
      const model = new BookModel(book, { depth });
      model.restZ = frontZ - depth / 2;
      model.position.set(cx, slot.y, model.restZ);
      this.shelf.books.add(model);
      this.models.set(book.id, model);
      this.interactive.push(model.body);
      this.#bind(model);

      for (let i = Math.floor(rand() * 3); i > 0; i--) addFiller();
    }

    for (let misses = 0; misses < 8 && x < limit - 0.02; ) if (!addFiller()) misses++;

    if (stack) {
      for (const item of stack.items) fillers.push({ ...item, z: frontZ - item.d / 2 });
    }
  }

  /** Стопка из 2–4 книг, лежащих плашмя у правой стенки. */
  #makeStack(rand, slot, right) {
    const count = 2 + Math.floor(rand() * 3);
    const items = [];
    let y = slot.y;
    let width = 0;
    for (let i = 0; i < count; i++) {
      const f = this.#randomFiller(rand, false);
      f.h = 0.2 + rand() * 0.07;
      f.w = 0.026 + rand() * 0.03;
      f.d = bookDepth(f.h, slot);
      width = Math.max(width, f.h);
      items.push({ ...f, y, lying: true, rotY: (rand() - 0.5) * 0.12 });
      y += f.w;
    }
    for (const item of items) item.x = right - 0.01 - width / 2 + (rand() - 0.5) * 0.02;
    return { width, items };
  }

  #buildFillers(fillers) {
    const { leather, pages } = sharedBookMaterials();
    const cover = new THREE.MeshStandardMaterial({ map: leather, roughness: 0.72 });
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    for (let variant = 0; variant < FILLER_VARIANTS; variant++) {
      const list = fillers.filter((f) => f.variant === variant);
      if (!list.length) continue;
      const spine = new THREE.MeshStandardMaterial({ map: createFillerSpineTexture(variant), roughness: 0.68 });
      const mesh = new THREE.InstancedMesh(unitBox, [cover, cover, cover, cover, spine, cover], list.length);
      list.forEach((f, i) => {
        // Лежащая книга: сначала кладём на бок (Z), потом чуть поворачиваем вокруг вертикали
        rotation.setFromEuler(euler.set(0, f.rotY ?? 0, f.lying ? Math.PI / 2 : 0));
        position.set(f.x, f.y + (f.lying ? f.w / 2 : f.h / 2), f.z);
        scale.set(f.w, f.h, f.d);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
        mesh.setColorAt(i, color.set(f.color));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `fillers:${variant}`;
      this.shelf.books.add(mesh);
    }

    // Обрез страниц сверху у стоящих книг (у лежащих сверху обложка)
    const standing = fillers.filter((f) => !f.lying);
    const tops = new THREE.InstancedMesh(unitTopPlane, pages, standing.length);
    rotation.identity();
    standing.forEach((f, i) => {
      position.set(f.x, f.y + f.h + 0.0008, f.z - f.d * 0.02);
      scale.set(f.w * 0.84, 1, f.d * 0.93);
      tops.setMatrixAt(i, matrix.compose(position, rotation, scale));
    });
    tops.receiveShadow = true;
    this.shelf.books.add(tops);
  }

  #bind(model) {
    Object.assign(model.body.userData, {
      kind: 'book',
      model,
      hoverKey: model,
      onPointerEnter: () => this.#setHovered(model),
      onPointerLeave: () => this.#setHovered(null),
    });
  }

  #setHovered(model) {
    if (model === this.hovered) return;
    const previous = this.hovered;
    this.hovered = model;
    if (previous) this.#refresh(previous);
    if (model) this.#refresh(model);
    this.events.dispatchEvent(new CustomEvent('hover', { detail: model?.book ?? null }));
  }

  #refresh(model) {
    const before = model.lift;
    if (model === this.selected) model.animate({ lift: LIFT.selected, glow: 0.18 });
    else if (model === this.hovered) model.animate({ lift: LIFT.hover, glow: 0.22 });
    else model.animate({ glow: this.shelfMode ? 0.15 : 0 });
    if (Math.abs(model.lift - before) > 1e-3) {
      this.events.dispatchEvent(new CustomEvent('book-move', { detail: { book: model.book, out: model.lift > before } }));
    }
  }
}
