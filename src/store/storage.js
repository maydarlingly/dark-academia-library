/**
 * Локальная «база данных» читателя: прогресс чтения, книги на полке, списки чтения, цитаты.
 * Всё лежит в одном ключе localStorage. Если хранилище недоступно
 * (приватный режим, запрет cookies) — приложение работает, просто ничего не помнит.
 */
const KEY = 'bibliotheca-noctis:v1';

const emptyState = () => ({ progress: {}, shelf: [], quotes: [], statuses: {}, settings: {} });

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
    if (onShelf) storage.removeFromShelf(bookId);
    else storage.addToShelf(bookId);
    return !onShelf;
  },
  /** Ставит книгу на полку; index — чтобы «Вернуть» поставило её на прежнее место. */
  addToShelf(bookId, index = 0) {
    if (state.shelf.includes(bookId)) return;
    const shelf = [...state.shelf];
    shelf.splice(Math.min(index, shelf.length), 0, bookId);
    state.shelf = shelf;
    commit();
  },
  /** Снимает книгу с полки. Возвращает её прежнюю позицию (или −1). */
  removeFromShelf(bookId) {
    const index = state.shelf.indexOf(bookId);
    if (index < 0) return -1;
    state.shelf = state.shelf.filter((id) => id !== bookId);
    commit();
    return index;
  },

  /** Список чтения книги: 'planned' | 'reading' | 'read' | 'paused' | 'dropped' | null. */
  getStatus(bookId) {
    return state.statuses?.[bookId]?.status ?? null;
  },
  /** Все книги в списках: [{ bookId, status, updatedAt }], свежие сверху. */
  getStatuses() {
    return Object.entries(state.statuses ?? {})
      .map(([bookId, entry]) => ({ bookId, ...entry }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  setStatus(bookId, status) {
    const statuses = { ...state.statuses };
    if (status) statuses[bookId] = { status, updatedAt: Date.now() };
    else delete statuses[bookId];
    state.statuses = statuses;
    commit();
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
  /** Удаляет цитату. Возвращает { quote, index } — для «Вернуть». */
  removeQuote(quoteId) {
    const index = state.quotes.findIndex((q) => q.id === quoteId);
    if (index < 0) return null;
    const quote = state.quotes[index];
    state.quotes = state.quotes.filter((q) => q.id !== quoteId);
    commit();
    return { quote, index };
  },
  restoreQuote({ quote, index }) {
    if (state.quotes.some((q) => q.id === quote.id)) return;
    const quotes = [...state.quotes];
    quotes.splice(Math.min(index, quotes.length), 0, quote);
    state.quotes = quotes;
    commit();
  },

  /** Настройки читателя (например, { sound: false }). */
  getSetting(key, fallback) {
    return state.settings?.[key] ?? fallback;
  },
  setSetting(key, value) {
    state.settings = { ...state.settings, [key]: value };
    commit();
  },

  /** Подписка на любые изменения. Возвращает функцию отписки. */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
