/** Списки чтения. Порядок — как в меню и фильтрах. */
export const STATUSES = [
  { id: 'reading', title: 'Читаю', color: '#8a6420' },
  { id: 'planned', title: 'В планах', color: '#2c3f5c' },
  { id: 'read', title: 'Прочитано', color: '#2f4a30' },
  { id: 'paused', title: 'Отложено', color: '#6a4a2c' },
  { id: 'dropped', title: 'Заброшено', color: '#4a4440' },
];

export const statusById = new Map(STATUSES.map((status) => [status.id, status]));
