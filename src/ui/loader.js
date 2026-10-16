import gsap from 'gsap';

const loader = document.querySelector('#loader');

export function setLoaderStatus(text) {
  const status = loader?.querySelector('[data-status]');
  if (status) status.textContent = text;
}

/** Гасит экран загрузки и проявляет интерфейс. */
export async function hideLoader() {
  if (!loader) return;
  await gsap.to(loader, { autoAlpha: 0, duration: 1.4, ease: 'power2.inOut' });
  loader.remove();
}

export function revealInterface() {
  gsap.from('[data-reveal]', {
    autoAlpha: 0,
    y: -10,
    duration: 1.6,
    ease: 'power3.out',
    stagger: 0.18,
    delay: 1.2,
  });
}
