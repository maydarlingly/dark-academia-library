# Bibliotheca Noctis — Полуночная библиотека

Интерактивная 3D-библиотека в стиле Dark Academia: тёмное дерево, свечи, камин, лунный свет из окна и старинные шкафы, разбитые по жанрам.

**Стек:** Vite · Three.js · GSAP · Tailwind CSS v4 · JSON + `localStorage` · деплой на Vercel.

## Запуск

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production-сборка в dist/
npm run preview   # проверить сборку локально
```

Нужен Node.js 20.19+ (или 22.12+).

## Структура

```
├── index.html               # холст + 2D-интерфейс (шапка, карточка книги, читалка, «Мои полки», загрузка)
├── vite.config.js           # Vite + плагин Tailwind
├── vercel.json              # настройки сборки и кэша для Vercel
├── public/                  # отдаётся как есть, по корневому URL
│   ├── data/
│   │   ├── catalog.json     # жанры и метаданные книг
│   │   └── books/           # тексты книг: <id>.json
│   ├── models/              # 3D-модели (.glb / .gltf)
│   └── textures/            # фото-текстуры (дерево, кожа, бумага)
└── src/
    ├── main.js              # точка входа: каталог → сцена → интерфейс
    ├── scene/               # всё про Three.js
    │   ├── Experience.js    # рендерер, камера, bloom, цикл анимации, flyTo()
    │   ├── Room.js          # пол, стены, панели, потолок, ковёр, окно
    │   ├── Fireplace.js     # камин с шейдерным огнём и портретом
    │   ├── Bookshelf.js     # шкаф жанра; slots — места под книги
    │   ├── Candle.js        # свечи с мерцанием, канделябр
    │   ├── Lighting.js      # общий свет и луна
    │   ├── Dust.js          # пылинки в воздухе
    │   └── textures.js      # процедурные текстуры на <canvas>
    ├── ui/                  # 2D-интерфейс
    │   ├── loader.js        # экран загрузки
    │   └── shelvesPanel.js  # «Мои полки»: книги и цитаты
    ├── store/storage.js     # прогресс, полка, цитаты в localStorage
    ├── data/catalog.js      # загрузка JSON из public/data
    ├── styles/main.css      # Tailwind-тема и компоненты (пергамент, кнопки, разворот книги)
    └── assets/ui/           # картинки интерфейса (зерно бумаги)
```

## Формат данных

`public/data/catalog.json` — список жанров (каждый жанр = шкаф) и книг:

```json
{
  "id": "dracula",
  "title": "Дракула",
  "author": "Брэм Стокер",
  "year": 1897,
  "genre": "gothic",
  "description": "…",
  "spine": { "color": "#4a1414", "height": 0.25, "thickness": 0.055 }
}
```

`spine` задаёт внешний вид корешка в метрах: высоту и толщину.

`public/data/books/<id>.json` — текст книги (грузится только при открытии):

```json
{
  "id": "dracula",
  "chapters": [
    { "title": "Глава I", "paragraphs": ["…", "…"] }
  ]
}
```

## Деплой на Vercel

1. Запушьте репозиторий на GitHub.
2. На [vercel.com/new](https://vercel.com/new) нажмите **Import** у этого репозитория.
3. Vercel сам определит Vite (`npm run build` → `dist`). Нажмите **Deploy**.

После этого каждый `git push` в `main` автоматически пересобирает сайт.

## Дальнейшие шаги

- [ ] Книги на полках: корешки из `catalog.json`, выдвижение при наведении (Raycaster)
- [ ] Клик по книге → `experience.flyTo()` → карточка книги
- [ ] Читалка: разбивка текста на страницы, закладка через `storage.setProgress()`
- [ ] Выделение текста → «Сохранить цитату»
- [ ] Шкафы для остальных жанров
