/**
 * Локальная «база данных» читателя: прогресс чтения, книги на полке, цитаты.
 * Всё лежит в одном ключе localStorage. Если хранилище недоступно
 * (приватный режим, запрет cookies) — приложение работает, просто ничего не помнит.
 */
const KEY = 'bibliotheca-noctis:v1';

const emptyState = () => ({ progress: {}, shelf: [], quotes: [] });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
  } catch {
    return emptyState();
  }
}

let state = load();
const listeners = new Set();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* хранилище недоступно — живём в памяти */
  }
  listeners.forEach((fn) => fn(state));
}

// Синхронизация между вкладками
window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  state = load();
  listeners.forEach((fn) => fn(state));
});

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const storage = {
  /** Номер страницы, на которой читатель остановился (0 — титульный лист, книга не начата). */
  getProgress(bookId) {
    return state.progress[bookId]?.page ?? 0;
  },
  /**
   * Полная закладка: { page, total, anchor, updatedAt }.
   * anchor = { c, p, w } — глава, абзац и слово, с которых начинается страница.
   * По нему читалка находит то же место, даже если на другом экране страниц стало больше или меньше.
   */
  getBookmark(bookId) {
    return state.progress[bookId] ?? null;
  },
  setProgress(bookId, { page, total, anchor }) {
    state.progress[bookId] = { page, total, anchor, updatedAt: Date.now() };
    commit();
  },

  getShelf() {
    return [...state.shelf];
  },
  isOnShelf(bookId) {
    return state.shelf.includes(bookId);
  },
  /** Добавляет книгу на полку или убирает её. Возвращает новое состояние. */
  toggleShelf(bookId) {
    const onShelf = state.shelf.includes(bookId);
    state.shelf = onShelf ? state.shelf.filter((id) => id !== bookId) : [bookId, ...state.shelf];
    commit();
    return !onShelf;
  },

  getQuotes() {
    return [...state.quotes];
  },
  addQuote({ bookId, text, page }) {
    const quote = { id: makeId(), bookId, text: text.trim(), page, createdAt: Date.now() };
    state.quotes = [quote, ...state.quotes];
    commit();
    return quote;
  },
  removeQuote(quoteId) {
    state.quotes = state.quotes.filter((q) => q.id !== quoteId);
    commit();
  },

  /** Подписка на любые изменения. Возвращает функцию отписки. */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
