import gsap from 'gsap';
import { STATUSES } from '../data/statuses.js';
import { storage } from '../store/storage.js';

const isNarrow = () => window.matchMedia('(width < 40rem)').matches;

/** Год для подписи: «1897» или «ок. 180 г. н. э.» для античных авторов. */
const formatYear = (year) => (year < 1000 ? `ок. ${year} г. н. э.` : String(year));

/**
 * Карточка книги, которая появляется после подлёта камеры.
 * Кнопки: «Читать» (onRead), «На полку» (localStorage + onShelved), «Вернуть» (onClose).
 * Список чтения («Читаю», «В планах», «Прочитано»…) — выпадающий список под кнопками.
 */
export function createBookCard({ root, onClose, onRead, onShelved }) {
  const fields = Object.fromEntries([...root.querySelectorAll('[data-field]')].map((el) => [el.dataset.field, el]));
  const shelveButton = root.querySelector('[data-action="shelve"]');
  const readButton = root.querySelector('[data-action="read"]');
  const statusSelect = root.querySelector('[data-field="status"]');
  let current = null;

  statusSelect.append(
    new Option('— не в списке —', ''),
    ...STATUSES.map((status) => new Option(status.title, status.id)),
  );

  function syncStatus() {
    statusSelect.value = current ? (storage.getStatus(current.id) ?? '') : '';
    statusSelect.dataset.status = statusSelect.value;
  }

  function syncReadButton() {
    const page = current ? storage.getProgress(current.id) : 0;
    readButton.textContent = page > 0 ? `Продолжить · стр. ${page}` : 'Читать';
  }

  function syncShelveButton() {
    const onShelf = current ? storage.isOnShelf(current.id) : false;
    shelveButton.setAttribute('aria-pressed', String(onShelf));
    shelveButton.textContent = onShelf ? 'На полке ✓' : 'На полку';
  }

  function show(book, genre) {
    current = book;
    fields.genre.textContent = genre?.title ?? '';
    fields.title.textContent = book.title;
    fields.author.textContent = `${book.author} · ${formatYear(book.year)}`;
    fields.description.textContent = book.description;
    syncShelveButton();
    syncReadButton();
    syncStatus();

    root.hidden = false;
    const narrow = isNarrow();
    gsap.fromTo(
      root,
      { autoAlpha: 0, x: narrow ? 0 : 28, y: narrow ? 28 : 0 },
      { autoAlpha: 1, x: 0, y: 0, duration: 0.8, ease: 'power3.out', overwrite: true },
    );
  }

  function hide() {
    current = null;
    if (root.hidden) return;
    const narrow = isNarrow();
    gsap.to(root, {
      autoAlpha: 0,
      x: narrow ? 0 : 20,
      y: narrow ? 20 : 0,
      duration: 0.35,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => {
        root.hidden = true;
      },
    });
  }

  shelveButton.addEventListener('click', () => {
    if (!current) return;
    const added = storage.toggleShelf(current.id);
    syncShelveButton();
    onShelved?.(current, added, shelveButton);
  });
  readButton.addEventListener('click', () => current && onRead?.(current));
  statusSelect.addEventListener('change', () => {
    if (current) storage.setStatus(current.id, statusSelect.value || null);
  });
  root.querySelector('[data-action="close"]').addEventListener('click', onClose);
  storage.subscribe(() => {
    syncShelveButton();
    syncReadButton();
    syncStatus();
  });

  return { show, hide };
}
