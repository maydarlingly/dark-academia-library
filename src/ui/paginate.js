/**
 * Вёрстка книги по страницам.
 *
 * Текст раскладывается в невидимую «пробную» страницу ровно того же размера и с теми же
 * стилями, что и настоящая. Абзац, который не влез, делится по словам (бинарным поиском),
 * остаток переносится на следующую страницу. Каждая глава начинается с новой страницы.
 *
 * Страница: { blocks, start }, где start = { c, p, w } — глава, абзац и слово,
 * с которых она начинается (p = -1 — заголовок главы). По start восстанавливается закладка.
 */

/** Сравнение позиций в тексте: <0 — a раньше b. */
export const compareAnchors = (a, b) => a.c - b.c || a.p - b.p || a.w - b.w;

/** Один блок страницы → DOM. Используется и для измерения, и для показа. */
export function renderBlock(block) {
  if (block.type === 'chapter') {
    const heading = document.createElement('h3');
    heading.className = 'chapter-title';
    heading.textContent = block.text;
    return heading;
  }

  if (block.type === 'end') {
    const end = document.createElement('div');
    end.className = 'book-end';
    end.append(Object.assign(document.createElement('p'), { className: 'book-end__mark', textContent: 'Конец отрывка' }));
    if (block.url) {
      const link = Object.assign(document.createElement('a'), {
        href: block.url,
        target: '_blank',
        rel: 'noopener',
        textContent: 'Полный текст — на сайте источника',
      });
      end.append(link);
    }
    return end;
  }

  const paragraph = document.createElement('p');
  if (block.verse) paragraph.classList.add('verse');
  if (block.first) paragraph.classList.add('first');
  if (block.cont) paragraph.classList.add('cont');
  if (block.split) paragraph.classList.add('split');
  paragraph.textContent = block.text;
  return paragraph;
}

/**
 * @param {Array<{title?: string, verse?: boolean, paragraphs: string[]}>} chapters
 * @param {HTMLElement} body — пробная страница (.page-body фиксированного размера)
 * @param {{ endUrl?: string|null, excerpt?: boolean }} options
 */
export function paginate(chapters, body, { excerpt = false, endUrl = null } = {}) {
  const pages = [];
  let page = { blocks: [], start: { c: 0, p: -1, w: 0 } };
  const fits = () => body.scrollHeight <= body.clientHeight + 1;

  const flush = (nextStart) => {
    pages.push(page);
    body.replaceChildren();
    page = { blocks: [], start: nextStart };
  };

  /** Добавить блок целиком, если влезает. */
  const tryAppend = (block) => {
    const el = body.appendChild(renderBlock(block));
    if (fits()) {
      page.blocks.push(block);
      return true;
    }
    el.remove();
    return false;
  };

  chapters.forEach((chapter, c) => {
    if (page.blocks.length) flush({ c, p: -1, w: 0 });
    else page.start = { c, p: -1, w: 0 };

    if (chapter.title) tryAppend({ type: 'chapter', text: chapter.title });

    chapter.paragraphs.forEach((text, p) => {
      const verse = Boolean(chapter.verse);
      const units = verse ? text.split('\n') : text.split(/\s+/).filter(Boolean);
      const joiner = verse ? '\n' : ' ';
      let i = 0;

      while (i < units.length) {
        const block = { type: 'p', verse, first: !verse && p === 0 && i === 0 && Boolean(chapter.title), cont: i > 0 };

        // Остаток абзаца влезает целиком?
        if (tryAppend({ ...block, text: units.slice(i).join(joiner) })) break;

        // Нет — ищем, сколько слов (строк стиха) влезает
        const el = body.appendChild(renderBlock({ ...block, split: true, text: '' }));
        let lo = 0;
        let hi = units.length - i;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          el.textContent = units.slice(i, i + mid).join(joiner);
          if (fits()) lo = mid;
          else hi = mid;
        }

        if (lo === 0) {
          el.remove();
          if (page.blocks.length) {
            flush({ c, p, w: i });
            continue;
          }
          lo = 1; // пустая страница, а не влезает даже слово — ставим силой, чтобы не зациклиться
        }

        page.blocks.push({ ...block, split: true, text: units.slice(i, i + lo).join(joiner) });
        i += lo;
        flush({ c, p, w: i });
      }
    });
  });

  if (excerpt) {
    const end = { type: 'end', url: endUrl };
    if (!tryAppend(end)) {
      flush({ c: chapters.length, p: -1, w: 0 });
      tryAppend(end);
    }
  }

  if (page.blocks.length) pages.push(page);
  body.replaceChildren();
  return pages;
}
