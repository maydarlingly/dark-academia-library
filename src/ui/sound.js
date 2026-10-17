import { storage } from '../store/storage.js';

/**
 * Тихие «живые» звуки книги, синтезированные Web Audio — без аудиофайлов.
 * Шорох бумаги = белый шум через полосовой фильтр с плавающей частотой;
 * глухой стук = короткая синусоида с падающей высотой.
 *
 *   sound.play('page' | 'open' | 'close' | 'shelf')
 * Выключатель хранится в localStorage (settings.sound). AudioContext создаётся при первом
 * звуке — браузеры разрешают это только после действия пользователя, а звуки у нас всегда по клику.
 */
const VOLUME = 0.32;

let ctx = null;
let master = null;
let noise = null;

function ensureContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Чуть «розовее» белого шума — мягче на слух
      last = 0.82 * last + 0.18 * (Math.random() * 2 - 1);
      data[i] = last * 3;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const rand = (min, max) => min + Math.random() * (max - min);

/** Шорох: шум → highpass → полосовой фильтр с «вжухом» частоты → огибающая. */
function rustle(t0, { duration = 0.45, from = 1400, to = 4000, gain = 0.5, swells = true } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rand(0.85, 1.15);

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 350;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(from, t0);
  band.frequency.exponentialRampToValueAtTime(to, t0 + duration * 0.55);
  band.frequency.exponentialRampToValueAtTime(from * 0.8, t0 + duration);

  const env = ctx.createGain();
  const g = env.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(gain, t0 + duration * 0.16);
  if (swells) {
    g.exponentialRampToValueAtTime(gain * 0.35, t0 + duration * 0.42);
    g.exponentialRampToValueAtTime(gain * 0.75, t0 + duration * 0.6);
  }
  g.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(highpass).connect(band).connect(env).connect(master);
  src.start(t0, rand(0, 1.4), duration + 0.05);
}

/** Глухой стук: обложка легла, книга встала на полку. */
function thump(t0, { freq = 110, gain = 0.4, duration = 0.18 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t0 + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
  rustle(t0, { duration: 0.06, from: 1800, to: 2600, gain: gain * 0.35, swells: false });
}

const SOUNDS = {
  page(t) {
    rustle(t, { duration: rand(0.4, 0.52), from: rand(1100, 1500), to: rand(3600, 4600), gain: 0.5 });
    rustle(t + 0.36, { duration: 0.08, from: 2400, to: 3200, gain: 0.12, swells: false }); // страница легла
  },
  open(t) {
    rustle(t, { duration: 0.7, from: 280, to: 900, gain: 0.22, swells: false }); // скрип переплёта
    for (let i = 0; i < 4; i++) rustle(t + 0.35 + i * 0.07, { duration: 0.14, from: 1600, to: 3800, gain: 0.16, swells: false });
    thump(t + 1.05, { freq: 85, gain: 0.32, duration: 0.25 });
  },
  close(t) {
    rustle(t, { duration: 0.3, from: 900, to: 2400, gain: 0.25, swells: false });
    thump(t + 0.55, { freq: 75, gain: 0.45, duration: 0.3 });
  },
  shelf(t) {
    thump(t, { freq: 150, gain: 0.3, duration: 0.12 });
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
  play(name, delay = 0) {
    if (!this.enabled || !SOUNDS[name]) return;
    if (!ensureContext()) return;
    SOUNDS[name](ctx.currentTime + 0.01 + delay);
  },
  /** Кнопка-переключатель: может быть сколько угодно таких кнопок, все синхронны. */
  bindToggle(button) {
    toggles.add(button);
    button.addEventListener('click', () => {
      sound.setEnabled(!sound.enabled);
      if (sound.enabled) sound.play('shelf');
    });
    syncToggles();
  },
};

storage.subscribe(syncToggles);
