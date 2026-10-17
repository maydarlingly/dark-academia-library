import './styles/main.css';

import { loadCatalog } from './data/catalog.js';
import { Experience } from './scene/Experience.js';
import { createBookCard } from './ui/bookCard.js';
import { createReader } from './ui/reader.js';
import { setHintBook, showHint } from './ui/hint.js';
import { hideLoader, revealInterface, setLoaderStatus } from './ui/loader.js';
import { createShelvesPanel } from './ui/shelvesPanel.js';

/** Шрифты нужны заранее: ими рисуются надписи на корешках и латунных табличках. */
function waitForFonts(timeout = 2500) {
  if (!document.fonts) return Promise.resolve();
  const sample = 'Аа Яя Ёё Aa'; // иначе подгрузится только латиница, а корешки — на кириллице
  const fonts = Promise.all([
    document.fonts.load('600 64px "Cormorant SC"', sample),
    document.fonts.load('400 16px "Cormorant Garamond"', sample),
    document.fonts.load('italic 500 64px "Cormorant Garamond"', sample),
  ]);
  return Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, timeout))]).catch(() => {});
}

async function boot() {
  const [catalog] = await Promise.all([loadCatalog(), waitForFonts()]);
  const books = new Map(catalog.books.map((book) => [book.id, book]));
  const genres = new Map(catalog.genres.map((genre) => [genre.id, genre]));

  const experience = new Experience(document.querySelector('#scene'), { catalog });
  const { library } = experience;

  // ─── Выбор книги: подлёт камеры → карточка ───
  let openId = null;

  const card = createBookCard({ root: document.querySelector('#book-card'), onClose: closeBook, onRead: openReader });

  // ─── Читалка: сцена уходит в размытие и замирает ───
  let pauseTimer;
  const reader = createReader({
    root: document.querySelector('#reader'),
    onClose: () => {
      clearTimeout(pauseTimer);
      experience.setPaused(false);
      experience.setDimmed(false);
      if (openId) card.show(books.get(openId), genres.get(books.get(openId).genre));
    },
  });

  function openReader(book) {
    card.hide();
    experience.setDimmed(true);
    reader.open(book);
    pauseTimer = setTimeout(() => experience.setPaused(true), 950); // после CSS-перехода размытия
  }

  async function openBook(id) {
    const book = books.get(id);
    if (!book || !library.has(id) || id === openId) return;
    const switching = openId !== null;
    openId = id;

    library.select(id);
    setHintBook(null);
    showHint(false);
    if (switching) card.hide();

    await experience.flyTo(library.focusView(id, experience.camera));
    if (openId === id) card.show(book, genres.get(book.genre));
  }

  function closeBook() {
    if (!openId) return;
    openId = null;
    library.select(null);
    card.hide();
    experience.flyHome();
    showHint(true);
  }

  library.events.addEventListener('pick', (event) => openBook(event.detail.id));
  library.events.addEventListener('hover', (event) => openId || setHintBook(event.detail));
  experience.events.addEventListener('empty-click', closeBook);

  const shelves = createShelvesPanel({
    root: document.querySelector('#shelves-panel'),
    trigger: document.querySelector('#open-shelves'),
    catalog,
    onOpenBook: openBook,
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && !shelves.isOpen() && !reader.isOpen()) closeBook();
  });

  // При повороте телефона / ресайзе пересчитываем ракурс на открытую книгу
  window.addEventListener('resize', () => {
    if (openId) experience.flyTo({ ...library.focusView(openId, experience.camera), duration: 0.6 });
  });

  if (import.meta.env.DEV) Object.assign(window, { experience, openBook, closeBook, openReader }); // для отладки из консоли

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
