import * as THREE from 'three';
import { createPlaqueTexture, createWoodTexture } from './textures.js';

/**
 * Книжный шкаф. Начало координат — по центру основания, фасад смотрит в +Z.
 *
 * `slots` описывает каждую полку (снизу вверх), на них встают книги:
 *   { index, y, lipY, height, width, depth }  — y = верхняя плоскость доски, lipY = центр кромки
 */
export class Bookshelf extends THREE.Group {
  constructor({ id = 'main', title = '', width = 3, height = 3.4, depth = 0.46, shelves = 5 } = {}) {
    super();
    this.name = `bookshelf:${id}`;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.slots = [];
    this.books = new THREE.Group();
    this.books.name = 'books';

    const grainAcross = createWoodTexture({ seed: 3, base: '#3a2212' });
    const grainUp = grainAcross.clone();
    grainUp.center.set(0.5, 0.5);
    grainUp.rotation = Math.PI / 2;

    const boards = new THREE.MeshStandardMaterial({ map: grainAcross, roughness: 0.48 });
    const frame = new THREE.MeshStandardMaterial({ map: grainUp, roughness: 0.48 });
    const backPanel = new THREE.MeshStandardMaterial({ map: grainUp, color: '#6a5446', roughness: 0.8 });

    const box = (w, h, d, material, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
      return mesh;
    };

    const side = 0.07;
    const board = 0.035;
    const plinth = 0.14;
    const crown = 0.26;
    const body = height - crown;
    const innerW = width - side * 2;

    // Боковины с накладными пилястрами
    for (const s of [-1, 1]) {
      box(side, body, depth, frame, s * (width / 2 - side / 2), body / 2, 0);
      box(side + 0.025, body - plinth, 0.025, frame, s * (width / 2 - side / 2), plinth + (body - plinth) / 2, depth / 2 + 0.012);
    }

    // Задняя стенка, цоколь
    box(innerW, body - plinth, 0.02, backPanel, 0, plinth + (body - plinth) / 2, -depth / 2 + 0.01);
    box(width + 0.04, plinth, depth + 0.04, boards, 0, plinth / 2, 0.01);

    // Карниз: фриз и два выступа
    box(width + 0.02, 0.14, depth + 0.02, boards, 0, body + 0.07, 0.01);
    box(width + 0.1, 0.07, depth + 0.07, boards, 0, body + 0.175, 0.035);
    box(width + 0.16, 0.05, depth + 0.1, boards, 0, body + 0.235, 0.05);

    // Полки
    const compartment = (body - plinth) / shelves;
    for (let i = 0; i < shelves; i++) {
      const y = plinth + i * compartment;
      box(innerW, board, depth - 0.03, boards, 0, y + board / 2, 0.005);
      box(innerW, board + 0.02, 0.022, boards, 0, y + (board + 0.02) / 2, depth / 2 - 0.011);
      this.slots.push({
        index: i,
        y: y + board,
        lipY: y + (board + 0.02) / 2,
        height: compartment - board,
        width: innerW - 0.04,
        depth: depth - 0.06,
      });
    }

    // Латунная табличка на карнизе
    if (title) {
      const plaque = createPlaque(title, 0.64, 0.12);
      plaque.position.set(0, body + 0.07, depth / 2 + 0.022);
      this.add(plaque);
    }

    this.add(this.books);
  }

  /** Маленькая табличка на кромке полки — например, название жанра. */
  addRowLabel(index, text) {
    const slot = this.slots[index];
    if (!slot) return;
    const plaque = createPlaque(text, 0.26, 0.042);
    plaque.position.set(0, slot.lipY, this.depth / 2 + 0.0015);
    this.add(plaque);
  }
}

function createPlaque(text, width, height) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: createPlaqueTexture(text),
      metalness: 0.7,
      roughness: 0.32,
      emissive: '#2a1a06',
      emissiveIntensity: 0.4,
    }),
  );
}
