import gsap from 'gsap';

const turnEase = gsap.parseEase('power2.inOut');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const SHADOW = '28 13 5';

/**
 * Мягкий переворот страницы.
 *
 * Лист режется на вертикальные полосы, вложенные друг в друга цепочкой (каждая — внутри соседней,
 * ближе к корешку). Каждая полоса повёрнута относительно предыдущей, поэтому лист изгибается дугой:
 * внешний край уходит вперёд, у корешка бумага отстаёт, а в конце край ложится первым.
 * Полосы затеняются по углу к зрителю, на соседние страницы падает мягкая тень.
 *
 * @param {object} o
 * @param {HTMLElement} o.host       — контейнер с perspective (разворот книги)
 * @param {object} o.rect            — { left, top, width, height } листа внутри host
 * @param {HTMLElement} o.front      — копия страницы на лицевой стороне листа
 * @param {HTMLElement} [o.back]     — копия страницы на обороте (ляжет по другую сторону корешка)
 * @param {'left'|'right'} o.hinge   — с какой стороны листа корешок
 * @param {number} o.from, o.to      — углы поворота, градусы (например 0 → −180)
 * @param {object} [o.castOn]        — { source, target } прямоугольники страниц, на которые падает тень
 * @param {'in'|'out'} [o.fade]      — проявление/исчезновение листа (одна страница на телефоне)
 * @returns gsap.core.Timeline — по завершении сам убирает за собой элементы
 */
export function curlPage({ host, rect, front, back = null, hinge = 'left', from = 0, to = -180, duration = 1, strips = 10, bend = 58, castOn = null, fade = null }) {
  const W = rect.width;
  const w = W / strips;
  const leftHinge = hinge === 'left';
  const elements = [];

  const place = (el, r) => Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

  // Тени на страницах под листом: «откуда» (открывается новая) и «куда» (ляжет лист)
  const casts = {};
  if (castOn) {
    for (const key of ['source', 'target']) {
      if (!castOn[key]) continue;
      const cast = document.createElement('div');
      cast.className = 'page-curl__cast';
      place(cast, castOn[key]);
      host.append(cast);
      elements.push(cast);
      casts[key] = cast;
    }
  }

  const root = document.createElement('div');
  root.className = 'page-curl';
  place(root, rect);
  host.append(root);
  elements.push(root);

  const face = (content, offset, isBack) => {
    const el = document.createElement('div');
    el.className = `page-curl__face${isBack ? ' page-curl__face--back' : ''}`;
    const copy = content.cloneNode(true);
    Object.assign(copy.style, { left: `${offset}px`, width: `${W}px` });
    const shade = document.createElement('div');
    shade.className = 'page-curl__shade';
    el.append(copy, shade);
    return { el, shade };
  };

  const chain = [];
  let parent = root;
  for (let i = 0; i < strips; i++) {
    const strip = document.createElement('div');
    strip.className = 'page-curl__strip';
    strip.style.width = `${w + 0.8}px`; // перекрытие — без щелей между полосами
    strip.style.transformOrigin = leftHinge ? 'left center' : 'right center';
    strip.style[leftHinge ? 'left' : 'right'] = i === 0 ? '0px' : `${w}px`;

    // Какой кусок страницы показывает полоса (на лице и на обороте)
    const fromSpine = i * w;
    const frontOffset = leftHinge ? -fromSpine : -(W - fromSpine - w);
    const backOffset = leftHinge ? -(W - fromSpine - w) : -fromSpine;
    const f = face(front, frontOffset, false);
    strip.append(f.el);
    const b = back ? face(back, backOffset, true) : null;
    if (b) strip.append(b.el);

    parent.append(strip);
    parent = strip;
    chain.push({ strip, front: f.shade, back: b?.shade, g: Math.pow(i / Math.max(1, strips - 1), 1.6) });
  }

  const total = to - from;
  const dir = Math.sign(total);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const state = { p: 0 };

  // Свет: лицо ярче всего, когда смотрит на зрителя; на изгибе бумага темнеет.
  const shadeOf = (angle, crease, back) => {
    const facing = Math.cos((angle * Math.PI) / 180) * (back ? -1 : 1);
    return (1 - Math.max(0, facing)) * 0.42 + crease * 0.12;
  };
  // Градиент внутри полосы — между соседями: без «ступенек» освещения на изгибе
  const towardsOuter = leftHinge ? 'to right' : 'to left';
  const towardsOuterBack = leftHinge ? 'to left' : 'to right'; // оборот зеркален
  const paint = (el, direction, a, b) => {
    el.style.background = `linear-gradient(${direction}, rgb(30 15 5 / ${a.toFixed(3)}), rgb(30 15 5 / ${b.toFixed(3)}))`;
  };

  const angles = new Array(strips).fill(0);
  const creases = new Array(strips).fill(0);

  const apply = () => {
    const p = state.p;
    const base = from + total * turnEase(p);
    const curl = bend * Math.sin(Math.PI * p);
    chain.forEach((link, i) => {
      angles[i] = clamp(base + dir * curl * link.g, lo, hi);
      creases[i] = Math.abs(curl * link.g) / (bend + 1);
    });

    let previous = 0;
    chain.forEach((link, i) => {
      link.strip.style.transform = `rotateY(${(angles[i] - previous).toFixed(3)}deg)`;
      previous = angles[i];
      const inner = (angles[Math.max(0, i - 1)] + angles[i]) / 2;
      const outerEdge = (angles[i] + angles[Math.min(strips - 1, i + 1)]) / 2;
      const crease = creases[i];
      paint(link.front, towardsOuter, shadeOf(inner, crease, false), shadeOf(outerEdge, crease, false));
      if (link.back) paint(link.back, towardsOuterBack, shadeOf(inner, crease, true), shadeOf(outerEdge, crease, true));
    });
    const outer = angles[strips - 1];

    // Тень у кромки листа: где кромка «проецируется» на страницу снизу — там и полутень
    const strength = 0.45 * Math.sin(Math.PI * p);
    const edge = Math.cos((outer * Math.PI) / 180); // 1 — лист лежит на исходной странице, −1 — на целевой
    // Чем ниже лист над страницей (reach → 1), тем гуще тень; стоящий вертикально лист тени почти не даёт
    const shadow = (el, towards, reach) => {
      if (!el) return;
      const at = clamp(reach * 100, 0, 100);
      const alpha = (strength * reach).toFixed(3);
      el.style.background = `linear-gradient(${towards}, rgb(${SHADOW} / 0) ${at}%, rgb(${SHADOW} / ${alpha}) ${at}%, rgb(${SHADOW} / 0) ${Math.min(100, at + 14)}%)`;
    };
    // На исходной стороне кромка уходит от внешнего края к корешку, на целевой — растёт от корешка
    shadow(casts.source, leftHinge ? 'to right' : 'to left', Math.max(0, edge));
    shadow(casts.target, leftHinge ? 'to left' : 'to right', Math.max(0, -edge));
  };

  apply();
  const tl = gsap.timeline({ onComplete: () => elements.forEach((el) => el.remove()) });
  tl.to(state, { p: 1, duration, ease: 'none', onUpdate: apply });
  if (fade === 'out') tl.to(root, { autoAlpha: 0, duration: duration * 0.22, ease: 'power1.in' }, duration * 0.74);
  if (fade === 'in') tl.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: duration * 0.25, ease: 'power1.out' }, 0);
  return tl;
}
