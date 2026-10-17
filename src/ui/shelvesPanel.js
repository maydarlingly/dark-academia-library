import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { STATUSES, statusById } from '../data/statuses.js';
import { storage } from '../store/storage.js';
import { sound } from './sound.js';

gsap.registerPlugin(Flip);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Боковая панель «Мои полки».
 *   — «Полка»: живая полка. Корешки книг, отложенных читателем, стоят на деревянной доске;
 *     новая книга падает на полку с отскоком и тихим стуком, снятая — уходит, соседи сдвигаются (GSAP Flip).
 *     У корешка есть «×» — снять с полки. Под полкой — список с закладками.
 *   — «Списки»: книги по спискам чтения («Читаю», «В планах», «Прочитано»…), фильтр сверху.
 *   — «Цитаты»: сохранённые из читалки фрагменты.
 * Любое удаление можно отменить кнопкой «Вернуть» внизу панели.
 * Данные — localStorage (src/store/storage.js), метаданные книг — каталог.
 */
export function createShelvesPanel({ root, trigger, catalog, onOpenBook }) {
  const books = new Map(catalog.books.map((book) => [book.id, book]));
  const lists = {
    books: root.querySelector('[data-list="books"]'),
    statuses: root.querySelector('[data-list="statuses"]'),
    quotes: root.querySelector('[data-list="quotes"]'),
  };
  const panels = Object.fromEntries([...root.querySelectorAll('[data-panel]')].map((panel) => [panel.dataset.panel, panel]));
  const counts = Object.fromEntries([...root.querySelectorAll('[data-count]')].map((count) => [count.dataset.count, count]));
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const filters = root.querySelector('[data-status-filters]');
  const closeButton = root.querySelector('[data-close]');
  const shelfRow = root.querySelector('[data-shelf-row]');
  const bookend = root.querySelector('[data-bookend]');
  const shelfEmpty = root.querySelector('[data-shelf-empty]');
  const badge = trigger.querySelector('[data-shelf-badge]');
  const undoBar = root.querySelector('[data-undo]');
  const spines = new Map(); // id книги → корешок на полке
  let isOpen = false;
  let statusFilter = 'all';

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text, label) => {
    const node = el('button', className, text);
    node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    return node;
  };
  const emptyState = (text) => el('li', 'py-6 text-center italic text-ink-soft', text);
  const titleOf = (bookId) => books.get(bookId)?.title ?? bookId;

  const openInHall = (bookId) => {
    close();
    onOpenBook?.(bookId);
  };

  // ─── «Удалено · Вернуть» ───

  let undoAction = null;
  let undoTimer = 0;

  function offerUndo(text, action) {
    undoAction = action;
    undoBar.querySelector('[data-undo-text]').textContent = text;
    undoBar.hidden = false;
    gsap.fromTo(undoBar, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power3.out', overwrite: true });
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 6000);
  }

  function hideUndo() {
    undoAction = null;
    gsap.to(undoBar, { autoAlpha: 0, duration: 0.25, overwrite: true, onComplete: () => (undoBar.hidden = true) });
  }

  undoBar.querySelector('[data-undo-action]').addEventListener('click', () => {
    undoAction?.();
    hideUndo();
  });

  function removeFromShelf(bookId) {
    const index = storage.removeFromShelf(bookId);
    if (index >= 0) offerUndo(`«${titleOf(bookId)}» снята с полки`, () => storage.addToShelf(bookId, index));
  }

  // ─── Живая полка ───

  /** Корешок: цвет и размеры из каталога, название — золотом. interactive — с кнопками «открыть» и «×». */
  function createSpine(book, { interactive = true } = {}) {
    const spine = el('div', 'shelf-spine');
    const { height, thickness, color } = book.spine;
    spine.style.setProperty('--spine', color);
    spine.style.setProperty('--h', `${clamp(height * 640, 118, 172)}px`);
    spine.style.setProperty('--w', `${clamp(thickness * 720, 24, 44)}px`);
    spine.dataset.bookId = book.id;

    const body = el(interactive ? 'button' : 'span', 'shelf-spine__book');
    body.append(el('span', 'shelf-spine__title', book.title));
    spine.append(body);
    if (!interactive) return spine;

    body.type = 'button';
    body.title = `${book.title} — ${book.author}`;
    body.setAttribute('aria-label', `Найти «${book.title}» в зале`);
    body.addEventListener('click', () => openInHall(book.id));

    const remove = button('shelf-spine__remove', '×', `Снять «${book.title}» с полки`);
    remove.title = 'Снять с полки';
    remove.addEventListener('click', () => removeFromShelf(book.id));
    spine.append(remove);
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
        spine.dataset.status = storage.getStatus(id) ?? ''; // «Читаю» — закладка-ленточка на корешке
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
      sound.play('bookIn');
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

    const flyer = createSpine(book, { interactive: false });
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

  // ─── Элементы списков ───

  function bookmarkLine(bookId) {
    const bookmark = storage.getBookmark(bookId);
    if (!(bookmark?.page > 0)) return null;
    const percent = bookmark.total ? ` · ${Math.round((bookmark.page / bookmark.total) * 100)}%` : '';
    return el('p', 'mt-1 text-xs tracking-wider text-oxblood', `Закладка на стр. ${bookmark.page}${percent}`);
  }

  function statusBadge(bookId) {
    const status = statusById.get(storage.getStatus(bookId));
    if (!status) return null;
    const badgeEl = el('span', 'status-badge', status.title);
    badgeEl.style.setProperty('--status', status.color);
    return badgeEl;
  }

  /** Заголовок книги — кнопка «найти в зале». */
  function bookHeading(bookId) {
    const book = books.get(bookId);
    const open = button('group block min-w-0 flex-1 text-left');
    open.append(
      el('p', 'font-display text-lg leading-tight text-ink transition group-hover:text-oxblood', book?.title ?? bookId),
      el('p', 'text-sm italic text-ink-soft', book ? `${book.author}, ${book.year}` : ''),
    );
    const line = bookmarkLine(bookId);
    if (line) open.append(line);
    open.addEventListener('click', () => openInHall(bookId));
    return open;
  }

  function shelfItem(bookId) {
    const item = el('li', 'flex items-start gap-3 border-b border-ink/15 pb-3');
    const side = el('div', 'flex flex-none flex-col items-end gap-2');
    const badgeEl = statusBadge(bookId);
    if (badgeEl) side.append(badgeEl);
    const remove = button('btn-quiet text-xs', 'Снять с полки', `Снять «${titleOf(bookId)}» с полки`);
    remove.addEventListener('click', () => removeFromShelf(bookId));
    side.append(remove);
    item.append(bookHeading(bookId), side);
    return item;
  }

  function statusItem({ bookId, status }) {
    const item = el('li', 'border-b border-ink/15 pb-3');
    const row = el('div', 'flex items-start gap-3');
    row.append(bookHeading(bookId));

    const picker = el('span', 'select-ink select-ink--small flex-none');
    const select = el('select');
    select.setAttribute('aria-label', `Список для «${titleOf(bookId)}»`);
    select.append(...STATUSES.map((s) => new Option(s.title, s.id)));
    select.value = status;
    select.dataset.status = status;
    select.addEventListener('change', () => storage.setStatus(bookId, select.value));
    picker.append(select);
    row.append(picker);

    const remove = button('btn-quiet mt-1 text-xs', 'Убрать из списка', `Убрать «${titleOf(bookId)}» из списков`);
    remove.addEventListener('click', () => {
      storage.setStatus(bookId, null);
      offerUndo(`«${titleOf(bookId)}» убрана из списка «${statusById.get(status)?.title}»`, () => storage.setStatus(bookId, status));
    });

    item.append(row, remove);
    return item;
  }

  function quoteItem(quote) {
    const item = el('li', 'border-l-2 border-oxblood/50 pl-4');
    const remove = button('btn-quiet text-xs', 'Удалить', 'Удалить цитату');
    remove.addEventListener('click', () => {
      const removed = storage.removeQuote(quote.id);
      if (removed) offerUndo('Цитата удалена', () => storage.restoreQuote(removed));
    });
    const footer = el('div', 'mt-1 flex items-center justify-between gap-3');
    footer.append(el('p', 'text-xs tracking-wider text-ink-soft', `— ${titleOf(quote.bookId)}, стр. ${quote.page}`), remove);
    item.append(el('blockquote', 'font-book text-[0.95rem] leading-relaxed italic text-ink', `«${quote.text}»`), footer);
    return item;
  }

  // ─── Отрисовка вкладок ───

  function renderFilters(entries) {
    const options = [{ id: 'all', title: 'Все', count: entries.length }, ...STATUSES.map((s) => ({ ...s, count: entries.filter((e) => e.status === s.id).length }))];
    filters.replaceChildren(
      ...options.map((option) => {
        const chip = button('filter-chip', '', `${option.title}: ${option.count}`);
        chip.append(option.title, el('span', 'filter-chip__count', String(option.count)));
        chip.setAttribute('aria-pressed', String(option.id === statusFilter));
        if (option.color) chip.style.setProperty('--status', option.color);
        chip.addEventListener('click', () => {
          statusFilter = option.id;
          renderLists();
        });
        return chip;
      }),
    );
  }

  function renderLists() {
    const shelf = storage.getShelf().filter((id) => books.has(id));
    const entries = storage.getStatuses().filter((entry) => books.has(entry.bookId));
    const quotes = storage.getQuotes();
    counts.books.textContent = shelf.length;
    counts.lists.textContent = entries.length;
    counts.quotes.textContent = quotes.length;

    lists.books.replaceChildren(...(shelf.length ? shelf.map(shelfItem) : [emptyState('Откройте карточку книги в зале и нажмите «На полку».')]));

    renderFilters(entries);
    const shown = statusFilter === 'all' ? entries : entries.filter((entry) => entry.status === statusFilter);
    const emptyText =
      statusFilter === 'all'
        ? 'Списки пусты. В карточке книги выберите «Читаю», «В планах» или «Прочитано».'
        : `В списке «${statusById.get(statusFilter)?.title}» пока ничего нет.`;
    lists.statuses.replaceChildren(...(shown.length ? shown.map(statusItem) : [emptyState(emptyText)]));

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
    hideUndo();
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
