import gsap from 'gsap';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const coarse = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * Режим «у полки»: камера подходит к шкафу и смотрит прямо на один ряд книг.
 *
 *   — другая полка: кнопки ▲▼, колёсико мыши, стрелки ↑↓, вертикальный свайп;
 *   — вдоль полки (если ряд не влез): кнопки ◀▶, стрелки ←→, перетаскивание мышью или пальцем;
 *   — книги каталога этого ряда — крупными кнопками-корешками в панели: на них легко попасть;
 *   — «В зал» или Esc — вернуться к общему виду.
 */
export function createShelfView({ experience, library, root, onPickBook, onModeChange, isBlocked = () => false }) {
  const label = root.querySelector('[data-hud-label]');
  const sub = root.querySelector('[data-hud-sub]');
  const chips = root.querySelector('[data-hud-books]');
  const buttons = Object.fromEntries([...root.querySelectorAll('[data-hud]')].map((button) => [button.dataset.hud, button]));

  let active = false;
  let suspended = false; // у полки, но открыта карточка книги
  let row = 0;
  let x = 0;
  let view = null;
  let hoveredBook = null;
  let wheelLock = 0;

  // ─── Камера ───

  function fly(duration = 0.8) {
    view = library.rowView(row, x, experience.camera);
    x = view.x;
    experience.flyTo({ position: view.position, target: view.target, duration, parallax: 0.12 });
    renderHud();
  }

  function enter(newRow, worldX, { duration = 1.3 } = {}) {
    const wasVisible = active && !suspended;
    active = true;
    suspended = false;
    row = clamp(newRow, 0, library.rowCount - 1);
    x = worldX;
    library.setShelfMode(true);
    fly(duration);
    if (!wasVisible) {
      showHud(true);
      onModeChange?.(true);
    }
  }

  function leave() {
    if (!active) return;
    active = false;
    suspended = false;
    library.setShelfMode(false);
    library.hover(null);
    showHud(false);
    experience.flyHome(1.4);
    onModeChange?.(false);
  }

  /** Открыли карточку книги: панель прячем, режим помним, чтобы вернуться к полке. */
  function suspend() {
    if (!active || suspended) return;
    suspended = true;
    showHud(false);
  }

  function changeRow(delta) {
    const next = clamp(row + delta, 0, library.rowCount - 1);
    if (next === row) return;
    row = next;
    fly(0.75);
  }

  function pan(direction) {
    if (!view || view.maxPan <= 0.01) return;
    x += direction * view.viewWidth * 0.6;
    fly(0.6);
  }

  // ─── Панель ───

  function showHud(visible) {
    if (visible) {
      root.hidden = false;
      gsap.fromTo(root, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', overwrite: true });
    } else {
      gsap.to(root, { autoAlpha: 0, y: 10, duration: 0.25, ease: 'power2.in', overwrite: true, onComplete: () => (root.hidden = true) });
    }
  }

  function subText() {
    if (hoveredBook) return `«${hoveredBook.title}» — ${hoveredBook.author}`;
    const position = `Полка ${library.rowCount - row} из ${library.rowCount}`;
    if (view?.maxPan > 0.01 && coarse()) return `${position} · листайте пальцем`;
    return coarse() ? position : `${position} · колёсико — другие полки`;
  }

  function renderHud() {
    label.textContent = library.rowLabel(row);
    sub.textContent = subText();
    buttons.up.disabled = row >= library.rowCount - 1;
    buttons.down.disabled = row <= 0;

    const canPan = view?.maxPan > 0.01;
    buttons.left.hidden = !canPan;
    buttons.right.hidden = !canPan;
    if (canPan) {
      const center = library.position.x;
      buttons.left.disabled = x <= center - view.maxPan + 0.01;
      buttons.right.disabled = x >= center + view.maxPan - 0.01;
    }

    const books = library.rowBooks(row);
    chips.replaceChildren(
      ...books.map((book) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'hud-chip';
        chip.textContent = book.title;
        chip.style.setProperty('--chip', book.spine.color);
        chip.setAttribute('aria-label', `Открыть «${book.title}» — ${book.author}`);
        chip.addEventListener('click', () => onPickBook(book.id));
        chip.addEventListener('pointerenter', () => library.hover(book.id));
        chip.addEventListener('pointerleave', () => library.hover(null));
        chip.addEventListener('focus', () => library.hover(book.id));
        chip.addEventListener('blur', () => library.hover(null));
        return chip;
      }),
    );
  }

  /** Подпись под названием полки показывает книгу под курсором. */
  function setHovered(book) {
    hoveredBook = book;
    if (active && !suspended) sub.textContent = subText();
  }

  buttons.back.addEventListener('click', leave);
  buttons.up.addEventListener('click', () => changeRow(1));
  buttons.down.addEventListener('click', () => changeRow(-1));
  buttons.left.addEventListener('click', () => pan(-1));
  buttons.right.addEventListener('click', () => pan(1));

  // ─── Жесты ───

  const usable = () => active && !suspended && !isBlocked();

  experience.onDrag = (phase, drag) => {
    if (!usable()) return;
    if (phase === 'move') {
      if (!view || view.maxPan <= 0.01) return;
      // «Тянем» полку: палец влево — камера вправо
      const metersPerPixel = view.viewWidth / window.innerWidth;
      const center = library.position.x;
      x = clamp(x - drag.dx * metersPerPixel, center - view.maxPan, center + view.maxPan);
      gsap.killTweensOf([experience.rig.position, experience.rig.target], 'x');
      experience.rig.position.x = x;
      experience.rig.target.x = x;
      return;
    }
    // Вертикальный свайп — соседняя полка (тянем вниз — поднимаемся выше)
    if (Math.abs(drag.totalY) > 60 && Math.abs(drag.totalY) > Math.abs(drag.totalX) * 1.4) changeRow(drag.totalY > 0 ? 1 : -1);
    else renderHud();
  };

  experience.canvas.addEventListener(
    'wheel',
    (event) => {
      if (!usable()) return;
      event.preventDefault();
      const now = performance.now();
      if (now < wheelLock) return;
      wheelLock = now + 450;
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) pan(Math.sign(event.deltaX || event.deltaY));
      else changeRow(event.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (event) => {
    if (!usable() || event.defaultPrevented) return;
    const actions = { ArrowUp: () => changeRow(1), ArrowDown: () => changeRow(-1), ArrowLeft: () => pan(-1), ArrowRight: () => pan(1) };
    if (!actions[event.key]) return;
    event.preventDefault();
    actions[event.key]();
  });

  return {
    enter,
    leave,
    suspend,
    setHovered,
    refresh: () => active && !suspended && fly(0.5),
    isActive: () => active,
  };
}
