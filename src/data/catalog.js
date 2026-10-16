/**
 * Контент библиотеки лежит в public/data как обычные JSON-файлы:
 *   data/catalog.json      — жанры и метаданные книг (для шкафов и карточек)
 *   data/books/<id>.json   — полный текст книги (грузится, только когда её открывают)
 */
const BASE = import.meta.env.BASE_URL;

async function fetchJson(path) {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path} (${response.status})`);
  return response.json();
}

export function loadCatalog() {
  return fetchJson('data/catalog.json');
}

export function loadBookText(bookId) {
  return fetchJson(`data/books/${bookId}.json`);
}
