import './styles/main.css';

import { loadCatalog } from './data/catalog.js';
import { Experience } from './scene/Experience.js';
import { hideLoader, revealInterface, setLoaderStatus } from './ui/loader.js';
import { createShelvesPanel } from './ui/shelvesPanel.js';

/** Шрифты нужны заранее: ими рисуются надписи на латунных табличках шкафов. */
function waitForFonts(timeout = 2500) {
  if (!document.fonts) return Promise.resolve();
  const fonts = Promise.all([
    document.fonts.load('600 64px "Cormorant SC"'),
    document.fonts.load('400 16px "Cormorant Garamond"'),
  ]);
  return Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, timeout))]).catch(() => {});
}

async function boot() {
  const [catalog] = await Promise.all([loadCatalog(), waitForFonts()]);

  const experience = new Experience(document.querySelector('#scene'), { catalog });

  createShelvesPanel({
    root: document.querySelector('#shelves-panel'),
    trigger: document.querySelector('#open-shelves'),
    catalog,
  });

  if (import.meta.env.DEV) window.experience = experience; // для отладки из консоли

  // Компилируем шейдеры заранее, пока на экране свеча, — чтобы вступление не дёргалось
  await experience.warmUp();
  experience.playIntro();
  revealInterface();
  await hideLoader();
}

boot().catch((error) => {
  console.error(error);
  setLoaderStatus('Свечи погасли… Обновите страницу.');
});
