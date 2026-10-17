import './styles/main.css';

import { loadCatalog } from './data/catalog.js';
import { storage } from './store/storage.js';
import { Experience } from './scene/Experience.js';
import { createBookCard } from './ui/bookCard.js';
import { createReader } from './ui/reader.js';
import { setHintBook, showHint } from './ui/hint.js';
import { hideLoader, revealInterface, setLoaderStatus } from './ui/loader.js';
import { createShelfView } from './ui/shelfView.js';
import { createShelvesPanel } from './ui/shelvesPanel.js';
import { sound } from './ui/sound.js';

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

  const card = createBookCard({
    root: document.querySelector('#book-card'),
    onClose: closeBook,
    onRead: openReader,
    onShelved: (book, added, button) => added && shelves.celebrate(book, button),
  });

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
    if (!storage.getStatus(book.id)) storage.setStatus(book.id, 'reading'); // начали читать — в «Читаю»
    card.hide();
    experience.setDimmed(true);
    reader.open(book);
    pauseTimer = setTimeout(() => experience.setPaused(true), 950); // после CSS-перехода размытия
  }

  // ─── Режим «у полки»: камера у шкафа, книги крупно ───
  const shelfView = createShelfView({
    experience,
    library,
    root: document.querySelector('#shelf-hud'),
    onPickBook: (id) => openBook(id),
    isBlocked: () => openId !== null || reader.isOpen() || shelves.isOpen(),
    onModeChange: (atShelf) => {
      setHintBook(null);
      showHint(!atShelf);
    },
  });

  async function openBook(id) {
    const book = books.get(id);
    if (!book || !library.has(id) || id === openId) return;
    const switching = openId !== null;
    openId = id;

    library.select(id);
    setHintBook(null);
    showHint(false);
    shelfView.suspend();
    if (switching) card.hide();

    await experience.flyTo(library.focusView(id, experience.camera));
    if (openId === id) card.show(book, genres.get(book.genre));
  }

  /** Закрыли карточку — возвращаемся к полке, на которой стоит книга. */
  function closeBook() {
    if (!openId) return;
    const { row, x } = library.bookRow(openId);
    openId = null;
    library.select(null);
    card.hide();
    shelfView.enter(row, x, { duration: 1 });
  }

  // Тихое шуршание кожи о дерево, когда книга выдвигается или задвигается
  library.events.addEventListener('book-move', (event) => sound.play(event.detail.out ? 'bookOut' : 'bookIn'));

  library.events.addEventListener('hover', (event) => {
    if (openId) return;
    if (shelfView.isActive()) shelfView.setHovered(event.detail);
    else setHintBook(event.detail);
  });

  // Клик по сцене. В зале: шкаф → подойти к полке (мышью можно сразу и по книге).
  // У полки: книга → карточка (на телефоне — ближайшая к пальцу), другой ряд → к нему, мимо шкафа → назад.
  experience.events.addEventListener('scene-click', ({ detail: { hit, coarse, clientX, clientY } }) => {
    if (reader.isOpen()) return;
    const kind = hit?.object.userData.kind ?? null;
    const bookOf = (object) => object.userData.model.book.id;

    if (!shelfView.isActive() && !openId) {
      if (kind === 'book' && !coarse) openBook(bookOf(hit.object));
      else if (kind) shelfView.enter(library.rowAt(hit.point), hit.point.x);
      return;
    }

    const bookHit = kind === 'book' ? hit.object : coarse ? experience.nearestInteractive(clientX, clientY, 34) : null;
    if (bookHit) openBook(bookOf(bookHit));
    else if (kind === 'cabinet' && openId) closeBook();
    else if (kind === 'cabinet') shelfView.enter(library.rowAt(hit.point), hit.point.x, { duration: 0.8 });
    else if (openId) closeBook();
    else shelfView.leave();
  });

  const shelves = createShelvesPanel({
    root: document.querySelector('#shelves-panel'),
    trigger: document.querySelector('#open-shelves'),
    catalog,
    onOpenBook: openBook,
  });

  document.querySelectorAll('#ui [data-sound-toggle]').forEach((button) => sound.bindToggle(button));

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || shelves.isOpen() || reader.isOpen()) return;
    if (openId) closeBook();
    else shelfView.leave();
  });

  // При повороте телефона / ресайзе пересчитываем ракурс
  window.addEventListener('resize', () => {
    if (openId) experience.flyTo({ ...library.focusView(openId, experience.camera), duration: 0.6 });
    else shelfView.refresh();
  });

  if (import.meta.env.DEV) Object.assign(window, { experience, openBook, closeBook, openReader, storage, shelves, shelfView }); // для отладки из консоли

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
