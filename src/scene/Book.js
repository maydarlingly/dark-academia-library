import * as THREE from 'three';
import gsap from 'gsap';
import { addNoise, createLeatherTexture, createPagesTexture, makeCanvas, rng, toTexture } from './textures.js';

/**
 * Корешок рисуется на двух холстах одинаковыми командами:
 *   color — то, что видно глазом (кожа, золото, тени);
 *   orm   — служебная карта: R = рельеф (bumpMap), G = шероховатость, B = металличность.
 * Так золотое тиснение блестит и чуть утоплено в кожу, а бинты корешка выпуклые.
 */
const ORM = {
  leather: 'rgb(128, 170, 0)',
  band: 'rgb(255, 150, 0)',
  gold: 'rgb(40, 80, 150)',
  label: 'rgb(110, 120, 0)',
};

const SPINE_PX = 1024;

/** Варианты разметки корешка: где проходят бинты (доли высоты сверху) и где кожаная наклейка. */
const LAYOUTS = [
  { bands: [0.13, 0.25, 0.71, 0.83], label: [0.3, 0.44] },
  { bands: [0.1, 0.2, 0.3, 0.7, 0.8, 0.9], label: null },
  { bands: [0.18, 0.36, 0.54, 0.72], label: [0.2, 0.34] },
];

function goldStyle(ctx, w, pass) {
  if (pass === 'orm') return ORM.gold;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#7a5a22');
  g.addColorStop(0.42, '#e9cb7e');
  g.addColorStop(0.55, '#f6e2a0');
  g.addColorStop(1, '#9c7630');
  return g;
}

function paintBands(ctx, w, h, bands, pass, { gilded }) {
  for (const f of bands) {
    const y = f * h;
    if (pass === 'orm') {
      ctx.fillStyle = ORM.band;
      ctx.fillRect(0, y - 7, w, 14);
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, y - 7, w, 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(0, y - 7, w, 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, y + 7, w, 5);
    }
    if (gilded) {
      ctx.fillStyle = goldStyle(ctx, w, pass);
      ctx.fillRect(0, y - 13, w, 2.5);
      ctx.fillRect(0, y + 13, w, 2.5);
    }
  }
}

/** Ромб с точками — простейший флерон между бинтами. */
function paintFleuron(ctx, w, cy, pass) {
  const s = Math.min(w * 0.16, 22);
  ctx.fillStyle = goldStyle(ctx, w, pass);
  ctx.beginPath();
  ctx.moveTo(w / 2, cy - s);
  ctx.lineTo(w / 2 + s * 0.6, cy);
  ctx.lineTo(w / 2, cy + s);
  ctx.lineTo(w / 2 - s * 0.6, cy);
  ctx.closePath();
  ctx.fill();
  for (const dx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(w / 2 + dx * s * 1.25, cy, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Подбирает размер шрифта (и при необходимости разбивает на 2 строки), чтобы текст влез в панель. */
function fitText(ctx, text, font, length, width) {
  const measure = (lines) => {
    ctx.font = font(100);
    return Math.max(...lines.map((line) => ctx.measureText(line).width));
  };
  const single = { lines: [text], size: Math.min(width * 0.5, (length / measure([text])) * 100) };

  const words = text.split(' ');
  if (words.length < 2) return single;
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const size = Math.min(width * 0.3, (length / measure(lines)) * 100);
    if (!best || size > best.size) best = { lines, size };
  }
  return best.size > single.size * 1.2 ? best : single;
}

/** Текст вдоль корешка (читается сверху вниз, как на английских и современных книгах). */
function paintVerticalText(ctx, w, cy, fitted, font, pass) {
  ctx.save();
  ctx.translate(w / 2, cy);
  ctx.rotate(Math.PI / 2);
  ctx.font = font(fitted.size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineHeight = fitted.size * 1.02;
  fitted.lines.forEach((line, i) => {
    const offset = (i - (fitted.lines.length - 1) / 2) * lineHeight;
    if (pass === 'color') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillText(line, 2, offset + 2);
    }
    ctx.fillStyle = goldStyle(ctx, w, pass);
    ctx.fillText(line, 0, offset);
  });
  ctx.restore();
}

function paintLeather(ctx, w, h, color, rand) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rand() > 0.55 ? 'rgba(0,0,0,0.08)' : 'rgba(255,235,210,0.05)';
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 2 + rand() * 14, 1 + rand() * 6, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  addNoise(ctx, w, h, 20, rand);
}

/** Объём скруглённого корешка и потёртые торцы — только на цветном холсте. */
function paintShading(ctx, w, h) {
  const round = ctx.createLinearGradient(0, 0, w, 0);
  round.addColorStop(0, 'rgba(0,0,0,0.6)');
  round.addColorStop(0.18, 'rgba(0,0,0,0.12)');
  round.addColorStop(0.5, 'rgba(255,240,220,0.07)');
  round.addColorStop(0.82, 'rgba(0,0,0,0.12)');
  round.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = round;
  ctx.fillRect(0, 0, w, h);

  for (const [y0, y1] of [
    [0, 0.035],
    [1, 0.965],
  ]) {
    const wear = ctx.createLinearGradient(0, y0 * h, 0, y1 * h);
    wear.addColorStop(0, 'rgba(20,10,5,0.55)');
    wear.addColorStop(1, 'rgba(20,10,5,0)');
    ctx.fillStyle = wear;
    ctx.fillRect(0, Math.min(y0, y1) * h, w, Math.abs(y1 - y0) * h);
  }
}

/** Корешок книги из каталога: название, автор, бинты и золотые филёнки. */
function createSpineTextures(book) {
  const { height, thickness, color } = book.spine;
  const h = SPINE_PX;
  const w = THREE.MathUtils.clamp(Math.round((h * thickness) / height), 96, 320);
  const layout = LAYOUTS[0];
  const [b0, b1, b2, b3] = layout.bands;
  const surname = book.author.split(' ').at(-1);

  const titleFont = (size) => `600 ${size}px "Cormorant SC", "Cormorant Garamond", Georgia, serif`;
  const authorFont = (size) => `italic 500 ${size}px "Cormorant Garamond", Georgia, serif`;

  const canvases = {};
  for (const pass of ['color', 'orm']) {
    const { canvas, ctx } = makeCanvas(w, h);
    const rand = rng([...book.id].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) | 0, 7));
    if (pass === 'color') paintLeather(ctx, w, h, color, rand);
    else {
      ctx.fillStyle = ORM.leather;
      ctx.fillRect(0, 0, w, h);
    }

    // Двойные золотые линии у торцов
    ctx.fillStyle = goldStyle(ctx, w, pass);
    for (const y of [0.03, 0.04, 0.96, 0.97]) ctx.fillRect(0, y * h, w, 2.5);

    paintBands(ctx, w, h, layout.bands, pass, { gilded: true });
    paintFleuron(ctx, w, ((b0 + b1) / 2) * h, pass);
    paintFleuron(ctx, w, ((b3 + 0.96) / 2) * h, pass);

    const titleLength = (b2 - b1) * h - 60;
    paintVerticalText(ctx, w, ((b1 + b2) / 2) * h, fitText(ctx, book.title, titleFont, titleLength, w), titleFont, pass);

    const authorLength = (b3 - b2) * h - 36;
    const author = fitText(ctx, surname, authorFont, authorLength, w);
    author.size = Math.min(author.size, w * 0.34);
    paintVerticalText(ctx, w, ((b2 + b3) / 2) * h, author, authorFont, pass);

    if (pass === 'color') paintShading(ctx, w, h);
    canvases[pass] = canvas;
  }

  return {
    map: toTexture(canvases.color),
    orm: toTexture(canvases.orm, { srgb: false }),
  };
}

/** Корешки декоративных книг: светлые, без текста — цвет даёт instanceColor. «Слепое» тиснение. */
export function createFillerSpineTexture(variant) {
  const layout = LAYOUTS[variant % LAYOUTS.length];
  const w = 192;
  const h = SPINE_PX;
  const { canvas, ctx } = makeCanvas(w, h);
  const rand = rng(301 + variant);

  paintLeather(ctx, w, h, '#dcd6cc', rand);
  if (layout.label) {
    const [y0, y1] = layout.label;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(w * 0.08, y0 * h, w * 0.84, (y1 - y0) * h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.13, y0 * h + 10, w * 0.74, (y1 - y0) * h - 20);
  }
  paintBands(ctx, w, h, layout.bands, 'color', { gilded: false });
  paintShading(ctx, w, h);
  return toTexture(canvas);
}

// Общие ресурсы
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitTopPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

let shared;
export function sharedBookMaterials() {
  shared ??= {
    leather: createLeatherTexture(),
    pages: new THREE.MeshStandardMaterial({ map: createPagesTexture(), roughness: 0.9 }),
  };
  return shared;
}

/** Высота отрыва книги от ряда: при наведении и когда её «достали» с полки. */
export const LIFT = { hover: 0.045, selected: 0.11 };

/**
 * Книга из каталога. Начало координат — центр нижней грани, корешок смотрит в +Z.
 * `body` — меш, по которому попадает Raycaster.
 */
export class BookModel extends THREE.Group {
  constructor(book, { depth }) {
    super();
    const { height, thickness, color } = book.spine;
    this.book = book;
    this.name = `book:${book.id}`;
    this.restZ = 0;

    const { leather, pages } = sharedBookMaterials();
    const { map, orm } = createSpineTextures(book);

    this.spineMaterial = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: orm,
      metalnessMap: orm,
      bumpMap: orm,
      bumpScale: 1.5,
      roughness: 1,
      metalness: 1,
      emissive: '#ffcf96',
      emissiveMap: map,
      emissiveIntensity: 0,
    });
    const cover = new THREE.MeshStandardMaterial({ color, map: leather, roughness: 0.7 });

    // Порядок граней BoxGeometry: +X, −X, +Y, −Y, +Z (корешок), −Z
    this.body = new THREE.Mesh(unitBox, [cover, cover, cover, cover, this.spineMaterial, cover]);
    this.body.scale.set(thickness, height, depth);
    this.body.position.y = height / 2;
    this.body.castShadow = true;
    this.body.receiveShadow = true;

    const block = new THREE.Mesh(unitTopPlane, pages);
    block.scale.set(thickness * 0.84, 1, depth * 0.93);
    block.position.set(0, height + 0.0008, -depth * 0.02);
    block.receiveShadow = true;

    this.add(this.body, block);
  }

  /** Плавно выдвинуть книгу на `lift` метров и подсветить корешок. */
  animate({ lift = 0, glow = 0 } = {}) {
    gsap.to(this.position, { z: this.restZ + lift, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
    gsap.to(this.spineMaterial, { emissiveIntensity: glow, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
  }
}
