import gsap from 'gsap';
import { STATUSES, statusById } from '../data/statuses.js';
import { sound } from './sound.js';

let openPicker = null; // одновременно открыт только один лист

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Закрыть открытый лист (например, когда закрывается панель, в которой он открыт). */
export function closeListPicker() {
  openPicker?.close();
}

/**
 * Выбор списка чтения в стиле библиотеки: кнопка в чернильной рамке и выпадающий лист
 * старой бумаги с сургучными печатями вместо системного <select>.
 *
 *   const picker = createListPicker({ value, onChange: (statusId | null) => …, allowNone: true });
 *   container.append(picker.el); picker.set('reading'); picker.close();
 *
 * Клавиатура: ↑↓ / Home / End — по пунктам, Enter / пробел — выбрать, Esc — закрыть.
 */
export function createListPicker({ value = null, onChange, label = 'Список чтения', allowNone = true, size = 'normal' } = {}) {
  const trigger = el('button', `list-picker${size === 'small' ? ' list-picker--small' : ''}`);
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const seal = el('span', 'list-picker__seal');
  seal.setAttribute('aria-hidden', 'true');
  const text = el('span', 'list-picker__text');
  const chevron = el('span', 'list-picker__chevron');
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(seal, text, chevron);

  let current = value;
  let menu = null;
  let cleanup = () => {};

  function render() {
    const status = statusById.get(current);
    text.textContent = status?.title ?? 'Не в списке';
    trigger.dataset.status = current ?? '';
    trigger.style.setProperty('--status', status?.color ?? 'transparent');
    trigger.setAttribute('aria-label', `${label}: ${status?.title ?? 'не в списке'}`);
  }

  const choices = () => [...STATUSES, ...(allowNone ? [{ id: null, title: 'Не в списке', note: 'убрать из списков' }] : [])];

  function buildMenu() {
    const sheet = el('div', 'list-menu parchment parchment--torn');
    sheet.setAttribute('role', 'listbox');
    sheet.setAttribute('aria-label', label);
    sheet.append(el('p', 'list-menu__title', 'В какой список?'));
    const flourish = el('div', 'flourish list-menu__flourish');
    flourish.setAttribute('aria-hidden', 'true');
    sheet.append(flourish);

    for (const choice of choices()) {
      if (choice.id === null) sheet.append(el('div', 'list-menu__divider'));
      const option = el('button', 'list-menu__option');
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(choice.id === current));
      option.dataset.id = choice.id ?? '';
      const optionSeal = el('span', `list-menu__seal${choice.id === null ? ' list-menu__seal--empty' : ''}`);
      optionSeal.setAttribute('aria-hidden', 'true');
      if (choice.color) optionSeal.style.setProperty('--status', choice.color);
      const words = el('span', 'list-menu__words');
      words.append(el('span', 'list-menu__label', choice.title));
      if (choice.note) words.append(el('span', 'list-menu__note', choice.note));
      const check = el('span', 'list-menu__check', '✓');
      check.setAttribute('aria-hidden', 'true');
      option.append(optionSeal, words, check);
      option.addEventListener('click', () => choose(choice.id));
      sheet.append(option);
    }
    return sheet;
  }

  /** Лист раскрывается вниз, а если места нет — вверх. */
  function place(sheet) {
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 224);
    sheet.style.width = `${width}px`;
    const height = sheet.offsetHeight;
    const below = window.innerHeight - rect.bottom;
    const up = below < height + 16 && rect.top > below;
    const left = Math.min(Math.max(rect.left, 10), window.innerWidth - width - 10);
    sheet.style.left = `${left}px`;
    sheet.style.top = `${up ? rect.top - height - 8 : rect.bottom + 8}px`;
    sheet.style.transformOrigin = up ? 'bottom center' : 'top center';
    return up;
  }

  function focusOption(index) {
    const options = [...menu.querySelectorAll('[role="option"]')];
    options[(index + options.length) % options.length]?.focus();
  }

  function open() {
    openPicker?.close();
    openPicker = api;
    menu = buildMenu();
    menu.style.visibility = 'hidden';
    document.body.append(menu);
    const up = place(menu);
    menu.style.visibility = '';
    trigger.setAttribute('aria-expanded', 'true');

    // Прозрачность, а не visibility: в невидимый элемент нельзя перевести фокус клавиатуры
    const options = [...menu.querySelectorAll('[role="option"]')];
    gsap.fromTo(menu, { opacity: 0, scaleY: 0.55, y: up ? 8 : -8 }, { opacity: 1, scaleY: 1, y: 0, duration: 0.34, ease: 'back.out(1.5)' });
    gsap.fromTo(options, { opacity: 0, y: up ? 4 : -4 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.03, delay: 0.08, ease: 'power2.out' });
    sound.play('paper');

    const selected = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
    focusOption(Math.max(0, selected));

    const onKey = (event) => {
      const index = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') focusOption(index + 1);
      else if (event.key === 'ArrowUp') focusOption(index - 1);
      else if (event.key === 'Home') focusOption(0);
      else if (event.key === 'End') focusOption(options.length - 1);
      else if (event.key === 'Escape') close({ focus: true });
      else if (event.key === 'Tab') return close();
      else return;
      event.preventDefault(); // Esc здесь не должен закрыть карточку или панель
    };
    const onOutside = (event) => {
      if (!menu?.contains(event.target) && !trigger.contains(event.target)) close();
    };
    const onScroll = (event) => {
      if (!menu?.contains(event.target)) close();
    };
    menu.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    cleanup = () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }

  function close({ focus = false } = {}) {
    if (!menu) return;
    const sheet = menu;
    menu = null;
    if (openPicker === api) openPicker = null;
    cleanup();
    trigger.setAttribute('aria-expanded', 'false');
    gsap.to(sheet, { autoAlpha: 0, scaleY: 0.85, duration: 0.18, ease: 'power2.in', onComplete: () => sheet.remove() });
    if (focus) trigger.focus({ preventScroll: true });
  }

  function choose(id) {
    const changed = id !== current;
    current = id;
    render();
    close({ focus: true });
    if (changed) onChange?.(id);
  }

  trigger.addEventListener('click', () => (menu ? close() : open()));
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!menu) open();
  });

  const api = {
    el: trigger,
    set(next) {
      current = next ?? null;
      render();
    },
    close: () => close(),
  };
  render();
  return api;
}
