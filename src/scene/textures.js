import * as THREE from 'three';

/**
 * Процедурные текстуры, нарисованные на <canvas>.
 * Стартовая сцена не зависит от внешних файлов; когда появятся настоящие
 * фото-текстуры, кладите их в public/textures и грузите через TextureLoader.
 */

/** Детерминированный ГПСЧ (mulberry32): одна и та же картинка при каждой загрузке. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function toTexture(canvas, { repeat = [1, 1], srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  return texture;
}

export function addNoise(ctx, width, height, amount, rand) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
}

/** Волокна древесины вдоль оси X внутри прямоугольника. */
function drawGrain(ctx, x, y, w, h, rand, lines = 46) {
  for (let i = 0; i < lines; i++) {
    const yy = y + rand() * h;
    const amp = 0.6 + rand() * 3.5;
    const freq = 0.003 + rand() * 0.012;
    const phase = rand() * Math.PI * 2;
    const dark = rand() > 0.35;
    ctx.strokeStyle = dark ? `rgba(14, 7, 3, ${0.08 + rand() * 0.22})` : `rgba(150, 100, 60, ${0.05 + rand() * 0.1})`;
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    for (let xx = 0; xx <= w; xx += 6) {
      const yOffset = Math.sin(xx * freq + phase) * amp + Math.sin(xx * freq * 3.1 + phase) * amp * 0.25;
      if (xx === 0) ctx.moveTo(x + xx, yy + yOffset);
      else ctx.lineTo(x + xx, yy + yOffset);
    }
    ctx.stroke();
  }
}

/** Тёмный орех для мебели. Волокна идут вдоль U. */
export function createWoodTexture({ seed = 1, base = '#3a2314', size = 512 } = {}) {
  const { canvas, ctx } = makeCanvas(size);
  const rand = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Широкие полосы годичных колец
  for (let i = 0; i < 9; i++) {
    const y = rand() * size;
    const band = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, rand() > 0.5 ? 'rgba(10,5,2,0.28)' : 'rgba(120,75,40,0.12)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, y - 30, size, 60);
  }

  drawGrain(ctx, 0, 0, size, size, rand, 120);
  addNoise(ctx, size, size, 14, rand);
  return toTexture(canvas);
}

/** Паркет из широких досок; бесшовно тайлится. 1 тайл = 2×2 м. */
export function createFloorTexture({ seed = 11 } = {}) {
  const size = 1024;
  const rows = 8;
  const rowH = size / rows;
  const { canvas, ctx } = makeCanvas(size);
  const rand = rng(seed);

  ctx.fillStyle = '#0d0704';
  ctx.fillRect(0, 0, size, size);

  for (let r = 0; r < rows; r++) {
    const j0 = rand() * size;
    const j1 = j0 + 260 + rand() * (size - 520);
    // Две доски в ряду; вторая переходит через край тайла, поэтому рисуем её дважды
    for (const [a, b] of [
      [j0, j1],
      [j1, j0 + size],
    ]) {
      const plankSeed = Math.floor(rand() * 1e9);
      for (const offset of [0, -size]) drawPlank(ctx, a + offset, r * rowH, b - a, rowH, plankSeed);
    }
  }

  addNoise(ctx, size, size, 10, rand);
  return toTexture(canvas);
}

function drawPlank(ctx, x, y, w, h, seed) {
  const rand = rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.clip();

  ctx.fillStyle = `hsl(${22 + rand() * 8}, ${38 + rand() * 14}%, ${11 + rand() * 7}%)`;
  ctx.fillRect(x, y, w, h);
  drawGrain(ctx, x, y, w, h, rand, 34);

  // Лёгкий объём доски: светлее в центре, темнее к краям
  const bevel = ctx.createLinearGradient(0, y, 0, y + h);
  bevel.addColorStop(0, 'rgba(0,0,0,0.35)');
  bevel.addColorStop(0.15, 'rgba(255,220,180,0.03)');
  bevel.addColorStop(0.85, 'rgba(0,0,0,0)');
  bevel.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = bevel;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** Тёмно-зелёные обои в полоску. 1 тайл = 1×1 м. */
export function createWallpaperTexture({ seed = 5 } = {}) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const rand = rng(seed);

  ctx.fillStyle = '#18251d';
  ctx.fillRect(0, 0, size, size);

  const stripe = size / 4;
  for (let i = 0; i < 4; i++) {
    const x = i * stripe;
    ctx.fillStyle = '#1e2e24';
    ctx.fillRect(x + stripe * 0.32, 0, stripe * 0.36, size);
    ctx.fillStyle = 'rgba(176, 141, 85, 0.13)';
    ctx.fillRect(x + stripe * 0.32, 0, 2, size);
    ctx.fillRect(x + stripe * 0.68 - 2, 0, 2, size);

    // Мелкий дамасский мотив — ромбики
    ctx.fillStyle = 'rgba(176, 141, 85, 0.07)';
    for (let y = stripe / 2; y < size; y += stripe) {
      ctx.beginPath();
      ctx.moveTo(x + stripe / 2, y - 10);
      ctx.lineTo(x + stripe / 2 + 6, y);
      ctx.lineTo(x + stripe / 2, y + 10);
      ctx.lineTo(x + stripe / 2 - 6, y);
      ctx.fill();
    }
  }

  addNoise(ctx, size, size, 12, rand);
  return toTexture(canvas);
}

/** Филёнчатые деревянные панели нижней части стен. 1 тайл = 1 м × высота панели. */
export function createWainscotTexture({ seed = 21 } = {}) {
  const w = 512;
  const h = 560;
  const { canvas, ctx } = makeCanvas(w, h);
  const rand = rng(seed);

  ctx.fillStyle = '#2c1a0f';
  ctx.fillRect(0, 0, w, h);
  drawGrain(ctx, 0, 0, w, h, rand, 90);

  // Филёнка: светлая фаска сверху-слева, тёмная снизу-справа
  const inset = 56;
  const [x0, y0, x1, y1] = [inset, inset, w - inset, h - inset];
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.moveTo(x1, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(160,110,70,0.22)';
  ctx.beginPath();
  ctx.moveTo(x0, y1);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x0 + 18, y0 + 18, x1 - x0 - 36, y1 - y0 - 36);

  // Стык между панелями
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, 4, h);

  addNoise(ctx, w, h, 12, rand);
  return toTexture(canvas);
}

/** Тёсаный камень для камина. */
export function createStoneTexture({ seed = 31 } = {}) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const rand = rng(seed);

  ctx.fillStyle = '#1b1714';
  ctx.fillRect(0, 0, size, size);

  const rowH = 64;
  for (let r = 0; r < size / rowH; r++) {
    let x = r % 2 ? -70 : 0;
    while (x < size) {
      const bw = 110 + rand() * 90;
      const l = 22 + rand() * 9;
      ctx.fillStyle = `hsl(${28 + rand() * 10}, ${8 + rand() * 6}%, ${l}%)`;
      ctx.fillRect(x + 3, r * rowH + 3, bw - 6, rowH - 6);
      x += bw;
    }
  }

  addNoise(ctx, size, size, 26, rand);
  return toTexture(canvas);
}

/** Ковёр: бордовое поле, тёмно-синий бордюр, золотистый орнамент. */
export function createRugTexture({ seed = 41 } = {}) {
  const size = 1024;
  const { canvas, ctx } = makeCanvas(size);
  const rand = rng(seed);
  const gold = 'rgba(176, 138, 70, 0.75)';

  ctx.fillStyle = '#3e1012';
  ctx.fillRect(0, 0, size, size);

  // Бордюр
  ctx.fillStyle = '#121828';
  ctx.fillRect(0, 0, size, 90);
  ctx.fillRect(0, size - 90, size, 90);
  ctx.fillRect(0, 0, 90, size);
  ctx.fillRect(size - 90, 0, 90, size);

  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, size - 44, size - 44);
  ctx.strokeRect(100, 100, size - 200, size - 200);
  ctx.lineWidth = 2;
  ctx.strokeRect(116, 116, size - 232, size - 232);

  // Ромбики по бордюру
  ctx.fillStyle = gold;
  for (let i = 70; i < size - 60; i += 52) {
    for (const [x, y] of [
      [i, 56],
      [i, size - 56],
      [56, i],
      [size - 56, i],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x + 9, y);
      ctx.lineTo(x, y + 9);
      ctx.lineTo(x - 9, y);
      ctx.fill();
    }
  }

  // Центральный медальон
  const c = size / 2;
  const diamond = (r, fill, stroke) => {
    ctx.beginPath();
    ctx.moveTo(c, c - r);
    ctx.lineTo(c + r * 0.72, c);
    ctx.lineTo(c, c + r);
    ctx.lineTo(c - r * 0.72, c);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  };
  diamond(300, '#2a0b0d', gold);
  diamond(230, '#121828', gold);
  diamond(150, '#4a1416', gold);
  diamond(60, gold);

  addNoise(ctx, size, size, 30, rand);
  return toTexture(canvas);
}

/** Латунная табличка с гравировкой (название жанра на шкафу). */
export function createPlaqueTexture(text) {
  const w = 1024;
  const h = 192;
  const { canvas, ctx } = makeCanvas(w, h);

  const brass = ctx.createLinearGradient(0, 0, 0, h);
  brass.addColorStop(0, '#d9b766');
  brass.addColorStop(0.45, '#a7812f');
  brass.addColorStop(0.55, '#8f6c25');
  brass.addColorStop(1, '#c7a253');
  ctx.fillStyle = brass;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(50, 30, 8, 0.7)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  // Длинная надпись ужимается, чтобы уместиться на табличке
  const font = (size) => `600 ${size}px "Cormorant SC", "Cormorant Garamond", Georgia, serif`;
  ctx.font = font(92);
  const fit = Math.min(92, Math.floor((92 * (w * 0.86)) / ctx.measureText(text).width));
  ctx.font = font(fit);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Гравировка = светлый блик снизу + тёмная бороздка
  ctx.fillStyle = 'rgba(255, 236, 180, 0.55)';
  ctx.fillText(text, w / 2, h / 2 + 4);
  ctx.fillStyle = '#2b1a07';
  ctx.fillText(text, w / 2, h / 2);

  return toTexture(canvas);
}

/** Ночное небо за окном. */
export function createNightSkyTexture({ seed = 51 } = {}) {
  const w = 256;
  const h = 512;
  const { canvas, ctx } = makeCanvas(w, h);
  const rand = rng(seed);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#070d1a');
  sky.addColorStop(0.7, '#152440');
  sky.addColorStop(1, '#22365a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const moon = ctx.createRadialGradient(w * 0.72, h * 0.2, 4, w * 0.72, h * 0.2, 120);
  moon.addColorStop(0, 'rgba(230, 236, 255, 0.95)');
  moon.addColorStop(0.12, 'rgba(190, 205, 240, 0.5)');
  moon.addColorStop(1, 'rgba(120, 150, 210, 0)');
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(220, 228, 255, ${0.2 + rand() * 0.6})`;
    ctx.fillRect(rand() * w, rand() * h * 0.75, 1.2, 1.2);
  }

  return toTexture(canvas);
}

/** Старинный портрет: тёмный лак и смутный силуэт. */
export function createPortraitTexture({ seed = 61 } = {}) {
  const w = 512;
  const h = 640;
  const { canvas, ctx } = makeCanvas(w, h);
  const rand = rng(seed);

  const bg = ctx.createRadialGradient(w * 0.45, h * 0.35, 20, w * 0.5, h * 0.5, h * 0.75);
  bg.addColorStop(0, '#4a3520');
  bg.addColorStop(0.5, '#22170d');
  bg.addColorStop(1, '#0c0805');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Плечи и голова
  ctx.fillStyle = '#100a06';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 1.02, w * 0.46, h * 0.36, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.43, w * 0.15, h * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  // Блик на лице, как от свечи
  const face = ctx.createRadialGradient(w * 0.46, h * 0.41, 4, w * 0.48, h * 0.43, w * 0.15);
  face.addColorStop(0, 'rgba(170, 120, 80, 0.55)');
  face.addColorStop(1, 'rgba(170, 120, 80, 0)');
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, w, h);
  // Белый воротник
  ctx.fillStyle = 'rgba(190, 170, 140, 0.35)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.62, w * 0.11, h * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // Кракелюр старого лака
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 160; i++) {
    let x = rand() * w;
    let y = rand() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (rand() - 0.5) * 40;
      y += (rand() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  addNoise(ctx, w, h, 16, rand);
  return toTexture(canvas);
}

/** Мягкая круглая точка — для пылинок. */
export function createDotTexture() {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, { srgb: false });
}

/** Светлая фактура кожи: умножается на цвет переплёта (material.color / instanceColor). */
export function createLeatherTexture({ seed = 71 } = {}) {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rand = rng(seed);
  ctx.fillStyle = '#d9d4cc';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, 2 + rand() * 9, 1 + rand() * 5, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  addNoise(ctx, size, size, 26, rand);
  return toTexture(canvas);
}

/** Обрез книжного блока, вид сверху: тонкие волокна страниц вдоль глубины книги. */
export function createPagesTexture({ seed = 81 } = {}) {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rand = rng(seed);
  ctx.fillStyle = '#d6c49c';
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 1 + rand() * 2) {
    ctx.fillStyle = rand() > 0.5 ? `rgba(90, 60, 25, ${0.08 + rand() * 0.14})` : `rgba(255, 245, 220, ${0.1 + rand() * 0.15})`;
    ctx.fillRect(x, 0, 1, size);
  }
  // Пожелтевшие края
  const edge = ctx.createLinearGradient(0, 0, size, 0);
  edge.addColorStop(0, 'rgba(110, 70, 25, 0.45)');
  edge.addColorStop(0.15, 'rgba(110, 70, 25, 0)');
  edge.addColorStop(0.85, 'rgba(110, 70, 25, 0)');
  edge.addColorStop(1, 'rgba(110, 70, 25, 0.45)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  addNoise(ctx, size, size, 12, rand);
  return toTexture(canvas);
}
