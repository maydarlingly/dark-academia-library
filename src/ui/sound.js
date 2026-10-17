import { storage } from '../store/storage.js';

/**
 * Тихие «живые» звуки библиотеки, синтезированные Web Audio — без аудиофайлов.
 *
 * Из чего складывается звук настоящей страницы:
 *   хруст   — бумага отрывается от соседней: густые короткие щелчки волокон (crackle);
 *   свист   — воздух вокруг движущегося листа: шум в полосе, плывущей сверху вниз, с панорамой (swish);
 *   шорох   — редкие щелчки, пока лист в полёте;
 *   шлепок  — лист ложится на лист: короткий приглушённый удар (flap).
 * Книга на полке: кожа скользит по дереву (slide), задвинутая — тихо упирается в заднюю стенку.
 *
 *   sound.play('page' | 'open' | 'close' | 'shelf' | 'bookOut' | 'bookIn', delay?, { direction }?)
 * Выключатель хранится в localStorage (settings.sound).
 */
const VOLUME = 0.42;
const MIN_GAP = { bookOut: 0.08, bookIn: 0.08, page: 0.06 }; // защита от «пулемёта» при быстром наведении

let ctx = null;
let master = null;
let noise = null;
const lastPlayed = {};

function ensureContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!ctx) {
    ctx = new AudioContext();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(compressor).connect(ctx.destination);

    // Мягкий («розоватый») шум — основа всех шорохов
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = 0.8 * last + 0.2 * (Math.random() * 2 - 1);
      data[i] = last * 2.6;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Браузеры разрешают звук только после действия пользователя — «будим» контекст на первом касании
for (const type of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(type, () => sound.enabled && ensureContext(), { once: true, capture: true, passive: true });
}

const rand = (min, max) => min + Math.random() * (max - min);

function filter(type, frequency, q = 0.7) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

/** Огибающая: [[смещение, громкость], …] с экспоненциальными переходами. */
function envelope(t0, points) {
  const node = ctx.createGain();
  node.gain.setValueAtTime(0.0001, t0);
  for (const [at, value] of points) node.gain.exponentialRampToValueAtTime(Math.max(0.0001, value), t0 + at);
  return node;
}

/** Выход с панорамой (если браузер умеет). */
function output(t0, pan = [0, 0], duration = 0.3) {
  const panner = ctx.createStereoPanner?.();
  if (!panner) return master;
  panner.pan.setValueAtTime(pan[0], t0);
  panner.pan.linearRampToValueAtTime(pan[1], t0 + duration);
  panner.connect(master);
  return panner;
}

function noiseSource(t0, duration) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rand(0.85, 1.15);
  src.start(t0, rand(0, 1.4), duration + 0.05);
  return src;
}

/** Хруст бумажных волокон: россыпь коротких затухающих щелчков. */
function crackle(t0, { duration, rate = 60, gain = 0.2, highpass = 2600, pan = [0, 0] }) {
  const length = Math.max(1, Math.ceil(duration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const count = Math.max(1, Math.round(rate * duration));
  for (let c = 0; c < count; c++) {
    const at = Math.floor(Math.random() * length);
    const size = Math.floor(rand(0.0008, 0.004) * ctx.sampleRate);
    const amp = rand(0.25, 1);
    for (let k = 0; k < size && at + k < length; k++) data[at + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / (size * 0.3));
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const env = envelope(t0, [
    [0.005, gain],
    [duration, gain * 0.6],
    [duration + 0.03, 0.0001],
  ]);
  src.connect(filter('highpass', highpass)).connect(env).connect(output(t0, pan, duration));
  src.start(t0);
}

/** Воздух вокруг движущегося листа: полоса шума «съезжает» вниз, громкость — плавный холм. */
function swish(t0, { duration, from, to, gain, q = 0.75, pan = [0, 0] }) {
  const band = filter('bandpass', from, q);
  band.frequency.setValueAtTime(from, t0);
  band.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const env = envelope(t0, [
    [duration * 0.18, gain * 0.6],
    [duration * 0.42, gain],
    [duration * 0.75, gain * 0.45],
    [duration, 0.0001],
  ]);
  noiseSource(t0, duration).connect(filter('highpass', 280)).connect(band).connect(env).connect(output(t0, pan, duration));
}

/** Лист ложится на лист — короткий мягкий шлепок. */
function flap(t0, { gain = 0.2, freq = 520, pan = 0 } = {}) {
  const env = envelope(t0, [
    [0.004, gain],
    [0.09, 0.0001],
  ]);
  noiseSource(t0, 0.1).connect(filter('lowpass', 1500)).connect(filter('bandpass', freq, 1.1)).connect(env).connect(output(t0, [pan, pan]));
}

/** Глухой стук: обложка легла, книга встала на полку. */
function thump(t0, { freq = 110, gain = 0.35, duration = 0.18 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t0 + duration);
  const env = envelope(t0, [
    [0.006, gain],
    [duration, 0.0001],
  ]);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
  flap(t0, { gain: gain * 0.4, freq: 380 });
}

/** Кожаный переплёт скользит по деревянной полке. */
function slide(t0, { duration = 0.22, from = 650, to = 1250, gain = 0.1 }) {
  const band = filter('bandpass', from, 2.2);
  band.frequency.setValueAtTime(from, t0);
  band.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const env = envelope(t0, [
    [0.035, gain],
    [duration * 0.7, gain * 0.8],
    [duration, 0.0001],
  ]);
  noiseSource(t0, duration).connect(band).connect(filter('lowpass', 3200)).connect(env).connect(master);
  crackle(t0 + 0.01, { duration: duration * 0.85, rate: 55, gain: gain * 0.45, highpass: 1600 });
}

const SOUNDS = {
  page(t, { direction = 1 } = {}) {
    const d = rand(0.82, 0.98);
    const pan = direction > 0 ? [0.3, -0.3] : [-0.3, 0.3]; // лист летит справа налево или обратно
    crackle(t, { duration: 0.09, rate: 320, gain: 0.3, highpass: 3200, pan: [pan[0], pan[0]] }); // отрыв
    swish(t + 0.04, { duration: d * 0.8, from: rand(2500, 3200), to: rand(650, 900), gain: 0.28, pan });
    crackle(t + 0.08, { duration: d * 0.65, rate: rand(30, 45), gain: 0.13, highpass: 2600, pan }); // шорох в полёте
    flap(t + d * 0.82, { gain: 0.22, freq: rand(450, 600), pan: pan[1] });
    crackle(t + d * 0.82, { duration: 0.05, rate: 220, gain: 0.1, highpass: 3500, pan: [pan[1], pan[1]] });
  },
  open(t) {
    slide(t, { duration: 0.6, from: 220, to: 480, gain: 0.08 }); // скрип переплёта
    crackle(t + 0.1, { duration: 0.5, rate: 25, gain: 0.1, highpass: 1300 });
    for (let i = 0; i < 4; i++) {
      const at = t + 0.38 + i * 0.075;
      swish(at, { duration: 0.16, from: 2800, to: 1200, gain: 0.11, pan: [0.15, -0.15] });
      crackle(at, { duration: 0.04, rate: 200, gain: 0.08, highpass: 3200 });
    }
    thump(t + 1.05, { freq: 85, gain: 0.28, duration: 0.25 });
  },
  close(t) {
    swish(t, { duration: 0.4, from: 1800, to: 600, gain: 0.18, pan: [-0.2, 0.2] });
    thump(t + 0.55, { freq: 75, gain: 0.4, duration: 0.3 });
  },
  shelf(t) {
    thump(t, { freq: 150, gain: 0.26, duration: 0.12 });
    crackle(t, { duration: 0.04, rate: 150, gain: 0.08, highpass: 2400 });
  },
  bookOut(t) {
    slide(t, { duration: 0.24, from: 620, to: 1200, gain: 0.085 });
  },
  bookIn(t) {
    slide(t, { duration: 0.2, from: 1200, to: 680, gain: 0.075 });
    thump(t + 0.19, { freq: 190, gain: 0.06, duration: 0.07 }); // упёрлась в заднюю стенку
  },
};

const toggles = new Set();

function syncToggles() {
  const on = sound.enabled;
  for (const button of toggles) {
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
    button.title = on ? 'Звук включён' : 'Звук выключен';
    button.dataset.sound = on ? 'on' : 'off';
  }
}

export const sound = {
  get enabled() {
    return storage.getSetting('sound', true);
  },
  setEnabled(on) {
    storage.setSetting('sound', on);
  },
  play(name, delay = 0, options = {}) {
    if (!this.enabled || !SOUNDS[name]) return;
    if (!ensureContext() || ctx.state !== 'running') return;
    const at = ctx.currentTime + 0.01 + delay;
    if (MIN_GAP[name] && lastPlayed[name] && at - lastPlayed[name] < MIN_GAP[name]) return;
    lastPlayed[name] = at;
    SOUNDS[name](at, options);
  },
  /** Кнопка-переключатель: может быть сколько угодно таких кнопок, все синхронны. */
  bindToggle(button) {
    toggles.add(button);
    button.addEventListener('click', () => {
      sound.setEnabled(!sound.enabled);
      if (sound.enabled) {
        ensureContext();
        setTimeout(() => sound.play('shelf'), 30);
      }
    });
    syncToggles();
  },
};

storage.subscribe(syncToggles);
