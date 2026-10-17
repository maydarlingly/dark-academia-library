import gsap from 'gsap';
import { loadBookText } from '../data/catalog.js';
import { storage } from '../store/storage.js';
import { compareAnchors, paginate, renderBlock } from './paginate.js';

const TITLE_ANCHOR = { c: 0, p: -2, w: 0 }; // титульный лист — раньше любой главы
const isSingle = () => window.matchMedia('(width < 48rem)').matches;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Образец с кириллицей: без него браузер подгрузит только латинский набор шрифта
const SAMPLE = 'Аа Яя Ёё Aa';

function waitForBookFonts() {
  if (!document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load('400 18px "Old Standard TT"', SAMPLE),
    document.fonts.load('italic 400 18px "Old Standard TT"', SAMPLE),
    document.fonts.load('600 18px "Cormorant SC"', SAMPLE),
  ]).catch(() => {});
}

/**
 * Читалка: разворот старинной книги поверх размытой сцены.
 *   — текст из public/data/books/<id>.json раскладывается по страницам под текущий экран;
 *   — закладка (страница + точное место в тексте) пишется в localStorage при каждом листании;
 *   — выделенный текст можно сохранить как цитату (появится в «Моих полках»).
 */
export function createReader({ root, onClose }) {
  const spread = root.querySelector('[data-spread]');
  const sides = Object.fromEntries(
    [...root.querySelectorAll('[data-side]')].map((article) => [
      article.dataset.side,
      {
        article,
        head: article.querySelector('[data-head]'),
        body: article.querySelector('[data-body]'),
        folio: article.querySelector('[data-folio]'),
      },
    ]),
  );
  const counter = root.querySelector('[data-field="counter"]');
  const progress = root.querySelector('[data-progress]');
  const prevButton = root.querySelector('[data-action="prev"]');
  const nextButton = root.querySelector('[data-action="next"]');
  const quoteButton = root.querySelector('#save-quote');
  const toast = root.querySelector('[data-toast]');

  let book = null; // метаданные из каталога
  let text = null; // содержимое data/books/<id>.json
  let pages = [];
  let index = 0; // первая видимая страница
  let anchor = TITLE_ANCHOR; // точное место чтения; переживает перевёрстку при смене размера
  let perSpread = 2;
  let isOpen = false;
  let pendingQuote = null;
  let openToken = 0;

  // ─── Вёрстка ───

  function titlePage() {
    const wrap = document.createElement('div');
    wrap.className = 'title-page';
    const line = (tag, className, value) => {
      if (!value) return;
      wrap.append(Object.assign(document.createElement(tag), { className, textContent: value }));
    };
    line('p', 'title-page__author', book.author);
    line('h3', 'title-page__title', book.title);
    if (text?.originalTitle) line('p', 'title-page__note', text.originalTitle);
    line('p', 'title-page__ornament', '❦');
    line('p', 'title-page__note', book.year < 1000 ? `ок. ${book.year} г.` : String(book.year));
    if (text?.translator) {
      const year = text.translationYear ? `, ${text.translationYear}` : '';
      line('p', 'title-page__note', `Перевод: ${text.translator}${year}`);
    }
    if (text?.translationTitle) line('p', 'title-page__note', `В переводе — «${text.translationTitle}»`);
    if (text?.language === 'en') line('p', 'title-page__note', 'Текст на языке оригинала');
    if (text?.source?.url) {
      const source = Object.assign(document.createElement('a'), {
        className: 'title-page__source',
        href: text.source.url,
        target: '_blank',
        rel: 'noopener',
        textContent: `Текст: ${text.source.name}${text.source.license ? ` · ${text.source.license}` : ''}`,
      });
      wrap.append(source);
    }
    return wrap;
  }

  function messagePage(message) {
    return { start: TITLE_ANCHOR, node: Object.assign(document.createElement('p'), { className: 'reader-message', textContent: message }) };
  }

  /** Пробная страница того же размера, что и настоящая (на телефоне видна только правая). */
  function layout() {
    perSpread = isSingle() ? 1 : 2;
    const reference = sides.right.body;
    const probe = document.createElement('div');
    probe.className = 'book-page book-page--probe';
    probe.lang = text.language ?? 'ru';
    // Дробные размеры (clientWidth округляет до целых — пробная страница выходила на полпикселя шире).
    // Округляем вниз: строка, влезшая в пробу, гарантированно влезет и в настоящую страницу.
    const size = getComputedStyle(reference);
    const floor = (value) => Math.floor(parseFloat(value) * 100) / 100 - 0.05;
    const body = document.createElement('div');
    body.className = 'page-body';
    body.style.cssText = `width:${floor(size.width)}px;height:${floor(size.height)}px;flex:none;`;
    probe.append(body);
    root.append(probe);

    const content = paginate(text.chapters, body, { excerpt: text.excerpt, endUrl: text.source?.url });
    probe.remove();
    pages = [{ start: TITLE_ANCHOR, title: true }, ...content];
  }

  /** Индекс страницы, на которой находится место `anchor`, выровненный по развороту. */
  function pageForAnchor(target) {
    const found = pages.findLastIndex((page) => compareAnchors(page.start, target) <= 0);
    const page = Math.max(0, found);
    return page - (page % perSpread);
  }

  // ─── Отрисовка ───

  function fillSide(side, pageIndex) {
    const { article, head, body, folio } = sides[side];
    const page = pages[pageIndex];
    article.dataset.index = page ? pageIndex : '';
    head.textContent = page && !page.title && !page.node ? (side === 'left' && perSpread === 2 ? book.author : book.title) : '';
    folio.textContent = page && !page.title && !page.node ? String(pageIndex) : '';
    if (!page) body.replaceChildren();
    else if (page.title) body.replaceChildren(titlePage());
    else if (page.node) body.replaceChildren(page.node);
    else body.replaceChildren(...page.blocks.map(renderBlock));
  }

  function render() {
    if (perSpread === 2) {
      fillSide('left', index);
      fillSide('right', index + 1);
    } else {
      fillSide('right', index);
      fillSide('left', -1);
    }

    const last = pages.length - 1;
    const lastVisible = Math.min(index + perSpread - 1, last);
    const label = perSpread === 2 && lastVisible > index ? `${index}–${lastVisible}` : String(index);
    counter.textContent = index === 0 ? `Титульный лист · всего ${last} стр.` : `Стр. ${label} из ${last}`;
    progress.style.width = `${last ? (lastVisible / last) * 100 : 100}%`;
    prevButton.disabled = index === 0;
    nextButton.disabled = index + perSpread > last;
    hideQuoteButton();
  }

  function saveProgress() {
    if (!book || !text) return; // текст не загрузился — закладку не трогаем
    storage.setProgress(book.id, { page: index, total: pages.length - 1, anchor });
  }

  function turnTo(target, direction) {
    if (target < 0 || target >= pages.length || target === index) return;
    index = target;
    anchor = pages[index].start;
    saveProgress();
    render();
    if (reducedMotion()) return;
    gsap.fromTo(
      [sides.left.body, sides.right.body],
      { autoAlpha: 0, x: 16 * direction },
      { autoAlpha: 1, x: 0, duration: 0.45, ease: 'power3.out', overwrite: true },
    );
  }

  const next = () => turnTo(index + perSpread, 1);
  const prev = () => turnTo(Math.max(0, index - perSpread), -1);

  // ─── Открытие / закрытие ───

  async function open(bookMeta) {
    const token = ++openToken;
    book = bookMeta;
    text = null;
    anchor = TITLE_ANCHOR;
    isOpen = true;
    root.hidden = false;
    root.querySelector('[data-field="title"]').textContent = `${book.title} — ${book.author}`;

    gsap.set(spread, { autoAlpha: 0 });
    gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out', overwrite: true });

    try {
      [text] = await Promise.all([loadBookText(book.id), waitForBookFonts()]);
      if (token !== openToken) return;
      layout();
      anchor = storage.getBookmark(book.id)?.anchor ?? TITLE_ANCHOR;
      index = pageForAnchor(anchor);
    } catch (error) {
      if (token !== openToken) return;
      console.warn(error);
      perSpread = isSingle() ? 1 : 2;
      pages = [{ start: TITLE_ANCHOR, title: true }, messagePage('Текст этой книги ещё не переплетён. Загляните позже — переписчики уже трудятся.')];
      index = 0;
    }

    spread.lang = text?.language ?? 'ru'; // правила переносов — по языку текста
    render();
    gsap.fromTo(spread, { autoAlpha: 0, y: 26, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out', overwrite: true });
    nextButton.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    openToken++;
    window.getSelection()?.removeAllRanges();
    hideQuoteButton();
    gsap.to(root, {
      autoAlpha: 0,
      duration: 0.45,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => {
        root.hidden = true;
      },
    });
    onClose?.(book);
  }

  // ─── Цитаты ───

  function hideQuoteButton() {
    pendingQuote = null;
    quoteButton.hidden = true;
  }

  function updateQuoteButton() {
    if (!isOpen) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return hideQuoteButton();

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const article = startNode?.closest?.('[data-side]');
    const quote = selection.toString().replace(/\s+/g, ' ').trim();
    if (!article || !spread.contains(article) || article.dataset.index === '' || quote.length < 3) return hideQuoteButton();

    pendingQuote = { text: quote.slice(0, 1200), page: Number(article.dataset.index) };
    const rect = range.getBoundingClientRect();
    const touch = window.matchMedia('(pointer: coarse)').matches; // на телефоне сверху системное меню
    quoteButton.hidden = false;
    const { width, height } = quoteButton.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 8), window.innerWidth - width - 8);
    const y = touch || rect.top < height + 16 ? rect.bottom + 12 : rect.top - height - 10;
    quoteButton.style.left = `${x}px`;
    quoteButton.style.top = `${Math.min(y, window.innerHeight - height - 8)}px`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    gsap
      .timeline({ defaults: { overwrite: true } })
      .fromTo(toast, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power3.out' })
      .to(toast, { autoAlpha: 0, y: 6, duration: 0.4, delay: 2.2, ease: 'power2.in', onComplete: () => (toast.hidden = true) });
  }

  quoteButton.addEventListener('pointerdown', (event) => event.preventDefault()); // не сбрасывать выделение
  quoteButton.addEventListener('click', () => {
    if (!pendingQuote || !book) return;
    storage.addQuote({ bookId: book.id, ...pendingQuote });
    window.getSelection()?.removeAllRanges();
    hideQuoteButton();
    showToast('Цитата сохранена в «Мои полки»');
  });
  document.addEventListener('selectionchange', updateQuoteButton);

  // ─── Управление ───

  nextButton.addEventListener('click', next);
  prevButton.addEventListener('click', prev);
  root.querySelector('[data-action="close"]').addEventListener('click', close);

  window.addEventListener('keydown', (event) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (['ArrowRight', 'PageDown'].includes(event.key)) {
      event.preventDefault();
      next();
    } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      prev();
    }
  });

  // Свайп пальцем по развороту
  let swipe = null;
  spread.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') swipe = { x: event.clientX, y: event.clientY };
  });
  spread.addEventListener('pointerup', (event) => {
    if (!swipe || event.pointerType !== 'touch') return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (!window.getSelection()?.isCollapsed) return;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 60) (dx < 0 ? next : prev)();
  });

  // При смене размера окна перевёрстываем и остаёмся на том же месте текста
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!isOpen || !text) return;
      layout();
      index = pageForAnchor(anchor);
      render();
    }, 200);
  });

  return { open, close, isOpen: () => isOpen };
}
