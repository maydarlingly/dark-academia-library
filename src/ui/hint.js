import gsap from 'gsap';

const hint = document.querySelector('#hint');
const defaultText = hint?.querySelector('[data-hint-default]');
const bookText = hint?.querySelector('[data-hint-book]');

/** Подсказка внизу экрана: название книги под курсором или общая инструкция. */
export function setHintBook(book) {
  if (!hint) return;
  bookText.textContent = book ? `«${book.title}» — ${book.author}` : '';
  bookText.hidden = !book;
  defaultText.hidden = Boolean(book);
}

export function showHint(visible) {
  if (hint) gsap.to(hint, { autoAlpha: visible ? 1 : 0, duration: 0.5, ease: 'power2.out', overwrite: true });
}
