import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { storage } from '../store/storage.js';
import { sound } from './sound.js';

gsap.registerPlugin(Flip);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Боковая панель «Мои полки».
 *   — «Книги»: живая полка. Корешки книг, отложенных читателем, стоят на деревянной доске;
 *     новая книга падает на полку с отскоком и тихим стуком, снятая — уходит, соседи сдвигаются (GSAP Flip).
 *     Под полкой — список с закладками.
 *   — «Цитаты»: сохранённые из читалки фрагменты.
 * Данные — localStorage (src/store/storage.js), метаданные книг — каталог.
 */
export function createShelvesPanel({ root, trigger, catalog, onOpenBook }) {
  const books = new Map(catalog.books.map((book) => [book.id, book]));
  const lists = {
    books: root.querySelector('[data-list="books"]'),
    quotes: root.querySelector('[data-list="quotes"]'),
  };
  const panels = {
    books: root.querySelector('[data-panel="books"]'),
    quotes: root.querySelector('[data-panel="quotes"]'),
  };
  const counts = {
    books: root.querySelector('[data-count="books"]'),
    quotes: root.querySelector('[data-count="quotes"]'),
  };
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const closeButton = root.querySelector('[data-close]');
  const shelfRow = root.querySelector('[data-shelf-row]');
  const bookend = root.querySelector('[data-bookend]');
  const shelfEmpty = root.querySelector('[data-shelf-empty]');
  const badge = trigger.querySelector('[data-shelf-badge]');
  const spines = new Map(); // id книги → корешок на полке
  let isOpen = false;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const emptyState = (text) => el('li', 'py-6 text-center italic text-ink-soft', text);

  // ─── Живая полка ───

  /** Корешок: цвет и размеры из каталога, название — золотом. */
  function createSpine(book, tag = 'button') {
    const spine = el(tag, 'shelf-spine');
    const { height, thickness, color } = book.spine;
    spine.style.setProperty('--spine', color);
    spine.style.setProperty('--h', `${clamp(height * 640, 118, 172)}px`);
    spine.style.setProperty('--w', `${clamp(thickness * 720, 24, 44)}px`);
    const body = el('span', 'shelf-spine__book');
    body.append(el('span', 'shelf-spine__title', book.title));
    spine.append(body);
    if (tag === 'button') {
      spine.type = 'button';
      spine.dataset.bookId = book.id;
      spine.title = `${book.title} — ${book.author}`;
      spine.setAttribute('aria-label', `Найти «${book.title}» в зале`);
      spine.addEventListener('click', () => {
        close();
        onOpenBook?.(book.id);
      });
    }
    return spine;
  }

  /**
   * Приводит полку в соответствие с хранилищем. Новые книги падают сверху,
   * снятые уходят вверх, остальные плавно сдвигаются.
   */
  function renderShelf({ animate = true, delay = 0 } = {}) {
    const ids = storage
      .getShelf()
      .filter((id) => books.has(id))
      .reverse(); // слева — давние, справа у ограничителя — самые новые
    const wanted = new Set(ids);
    const leaving = [];
    for (const [id, spine] of spines) {
      if (wanted.has(id)) continue;
      spines.delete(id);
      leaving.push(spine);
    }

    const apply = () => {
      const state = animate ? Flip.getState([...spines.values(), bookend]) : null;
      leaving.forEach((spine) => spine.remove());

      const entering = [];
      for (const id of ids) {
        let spine = spines.get(id);
        if (!spine) {
          spine = createSpine(books.get(id));
          spines.set(id, spine);
          entering.push(spine);
        }
        shelfRow.insertBefore(spine, bookend);
      }
      shelfEmpty.hidden = ids.length > 0;
      if (!animate) return;

      Flip.from(state, { duration: 0.55, ease: 'power3.inOut' });
      if (!entering.length) return;
      gsap.fromTo(
        entering,
        { y: -190, rotation: -9, autoAlpha: 0 },
        { y: 0, rotation: 0, autoAlpha: 1, duration: 0.95, ease: 'bounce.out', stagger: 0.14, delay },
      );
      // Первое касание доски у bounce.out — примерно на 36% длительности
      entering.forEach((_, i) => sound.play('shelf', delay + i * 0.14 + 0.34));
      entering.at(-1).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    };

    if (animate && leaving.length) {
      gsap.to(leaving, { y: -30, rotation: 7, autoAlpha: 0, duration: 0.32, ease: 'power2.in', onComplete: apply });
    } else apply();
  }

  function updateBadge() {
    const count = storage.getShelf().filter((id) => books.has(id)).length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  /** Книга «летит» от кнопки «На полку» к кнопке «Мои полки» в шапке. */
  function celebrate(book, from) {
    const start = from.getBoundingClientRect();
    const end = trigger.getBoundingClientRect();
    const finish = () => {
      trigger.classList.remove('is-celebrating');
      void trigger.offsetWidth; // перезапуск CSS-анимации
      trigger.classList.add('is-celebrating');
      gsap.fromTo(badge, { scale: 0.3 }, { scale: 1, duration: 0.55, ease: 'back.out(3)' });
      sound.play('shelf');
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();

    const flyer = createSpine(book, 'div');
    flyer.classList.add('shelf-spine--flying');
    document.body.append(flyer);
    gsap.set(flyer, {
      left: start.left + start.width / 2,
      top: start.top + start.height / 2,
      xPercent: -50,
      yPercent: -50,
      rotation: -12,
    });
    const dx = end.left + end.width / 2 - (start.left + start.width / 2);
    const dy = end.top + end.height / 2 - (start.top + start.height / 2);
    gsap
      .timeline({
        onComplete: () => {
          flyer.remove();
          finish();
        },
      })
      .to(flyer, { x: dx, duration: 0.95, ease: 'power1.inOut' }, 0)
      .to(flyer, { y: dy, duration: 0.95, ease: 'back.in(1.4)' }, 0) // по дуге: чуть вниз, потом вверх
      .to(flyer, { rotation: 18, scale: 0.28, duration: 0.95, ease: 'power2.in' }, 0)
      .to(flyer, { autoAlpha: 0, duration: 0.15 }, 0.82);
  }

  // ─── Списки ───

  function bookItem(bookId) {
    const book = books.get(bookId);
    const item = el('li', 'group relative border-b border-ink/15 pb-3');
    const button = el('button', 'block w-full pr-16 text-left');
    button.type = 'button';
    button.append(
      el('p', 'font-display text-lg leading-tight text-ink transition group-hover:text-oxblood', book?.title ?? bookId),
      el('p', 'text-sm italic text-ink-soft', book ? `${book.author}, ${book.year}` : ''),
    );
    const bookmark = storage.getBookmark(bookId);
    if (bookmark?.page > 0) {
      const percent = bookmark.total ? ` · ${Math.round((bookmark.page / bookmark.total) * 100)}%` : '';
      button.append(el('p', 'mt-1 text-xs tracking-wider text-oxblood', `Закладка на стр. ${bookmark.page}${percent}`));
    }
    button.addEventListener('click', () => {
      close();
      onOpenBook?.(bookId);
    });

    const remove = el('button', 'btn-quiet absolute top-0 right-0 text-xs', 'Снять');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Снять «${book?.title ?? bookId}» с полки`);
    remove.addEventListener('click', () => storage.toggleShelf(bookId));

    item.append(button, remove);
    return item;
  }

  function quoteItem(quote) {
    const book = books.get(quote.bookId);
    const item = el('li', 'group relative border-l-2 border-oxblood/50 pl-4');
    const remove = el('button', 'btn-quiet absolute -top-1 right-0 text-sm opacity-0 transition group-hover:opacity-100 focus:opacity-100', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Удалить цитату');
    remove.addEventListener('click', () => storage.removeQuote(quote.id));
    item.append(
      el('blockquote', 'pr-6 font-book text-[0.95rem] leading-relaxed italic text-ink', `«${quote.text}»`),
      el('p', 'mt-1 text-xs tracking-wider text-ink-soft', `— ${book?.title ?? quote.bookId}, стр. ${quote.page}`),
      remove,
    );
    return item;
  }

  function renderLists() {
    const shelf = storage.getShelf().filter((id) => books.has(id));
    const quotes = storage.getQuotes();
    counts.books.textContent = shelf.length;
    counts.quotes.textContent = quotes.length;

    lists.books.replaceChildren(...(shelf.length ? shelf.map(bookItem) : [emptyState('Откройте карточку книги в зале и нажмите «На полку».')]));
    lists.quotes.replaceChildren(
      ...(quotes.length ? quotes.map(quoteItem) : [emptyState('Выделите строку в читалке и нажмите «Сохранить цитату».')]),
    );
  }

  function selectTab(name) {
    for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name;
  }

  // ─── Открытие / закрытие ───

  function open() {
    renderLists();
    isOpen = true;
    root.classList.add('is-open');
    root.inert = false;
    root.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
    // Книги, добавленные, пока панель была закрыта, падают на полку, когда она выехала
    renderShelf({ delay: 0.45 });
  }

  function close() {
    isOpen = false;
    root.classList.remove('is-open');
    root.inert = true;
    root.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => (isOpen ? close() : open()));
  trigger.addEventListener('animationend', () => trigger.classList.remove('is-celebrating'));
  closeButton.addEventListener('click', close);
  tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.preventDefault(); // Esc уже обработан — карточка книги его не тронет
    close();
  });
  storage.subscribe(() => {
    updateBadge();
    if (!isOpen) return;
    renderLists();
    renderShelf();
  });

  // То, что уже стояло на полке с прошлого визита, — без анимации
  renderShelf({ animate: false });
  updateBadge();

  return { open, close, celebrate, isOpen: () => isOpen };
}
