import { storage } from '../store/storage.js';

/**
 * Боковая панель «Мои полки»: книги, отложенные читателем, и сохранённые цитаты.
 * Данные берутся из localStorage (src/store/storage.js), метаданные книг — из каталога.
 */
export function createShelvesPanel({ root, trigger, catalog, onOpenBook }) {
  const books = new Map(catalog.books.map((book) => [book.id, book]));
  const lists = {
    books: root.querySelector('[data-list="books"]'),
    quotes: root.querySelector('[data-list="quotes"]'),
  };
  const counts = {
    books: root.querySelector('[data-count="books"]'),
    quotes: root.querySelector('[data-count="quotes"]'),
  };
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const closeButton = root.querySelector('[data-close]');
  let isOpen = false;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const emptyState = (text) => el('li', 'py-6 text-center italic text-ink-soft', text);

  function bookItem(bookId) {
    const book = books.get(bookId);
    const item = el('li', 'border-b border-ink/15 pb-3');
    const button = el('button', 'group block w-full text-left');
    button.type = 'button';
    button.append(
      el('p', 'font-display text-lg leading-tight text-ink transition group-hover:text-oxblood', book?.title ?? bookId),
      el('p', 'text-sm italic text-ink-soft', book ? `${book.author}, ${book.year}` : ''),
    );
    const page = storage.getProgress(bookId);
    if (page > 0) button.append(el('p', 'mt-1 text-xs tracking-wider text-oxblood', `Закладка на стр. ${page + 1}`));
    button.addEventListener('click', () => {
      close();
      onOpenBook?.(bookId);
    });
    item.append(button);
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
      el('p', 'mt-1 text-xs tracking-wider text-ink-soft', `— ${book?.title ?? quote.bookId}, стр. ${quote.page + 1}`),
      remove,
    );
    return item;
  }

  function render() {
    const shelf = storage.getShelf();
    const quotes = storage.getQuotes();
    counts.books.textContent = shelf.length;
    counts.quotes.textContent = quotes.length;

    lists.books.replaceChildren(
      ...(shelf.length ? shelf.map(bookItem) : [emptyState('Полка пока пуста. Откройте карточку книги и нажмите «На полку».')]),
    );
    lists.quotes.replaceChildren(
      ...(quotes.length ? quotes.map(quoteItem) : [emptyState('Выделите строку в читалке и нажмите «Сохранить цитату».')]),
    );
  }

  function selectTab(name) {
    for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
    for (const [key, list] of Object.entries(lists)) list.hidden = key !== name;
  }

  function open() {
    render();
    isOpen = true;
    root.classList.add('is-open');
    root.inert = false;
    root.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
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
  closeButton.addEventListener('click', close);
  tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.preventDefault(); // Esc уже обработан — карточка книги его не тронет
    close();
  });
  storage.subscribe(() => isOpen && render());

  return { open, close, render, isOpen: () => isOpen };
}
