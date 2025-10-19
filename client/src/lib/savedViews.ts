export type SavedView<T> = {
  id: string;
  name: string;
  value: T;
  isDefault?: boolean;
  createdAt: number;
};

const keyFor = (pageId: string) => `${pageId}:savedViews`;

export function loadSavedViews<T>(pageId: string): SavedView<T>[] {
  try {
    const raw = localStorage.getItem(keyFor(pageId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSavedViews<T>(pageId: string, views: SavedView<T>[]) {
  localStorage.setItem(keyFor(pageId), JSON.stringify(views));
}

export function addSavedView<T>(pageId: string, name: string, value: T, makeDefault = false): SavedView<T>[] {
  const views = loadSavedViews<T>(pageId);
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const next: SavedView<T> = { id, name, value, isDefault: makeDefault, createdAt: Date.now() };
  const updated = makeDefault
    ? [{ ...next, isDefault: true }, ...views.map(v => ({ ...v, isDefault: false }))]
    : [next, ...views];
  saveSavedViews(pageId, updated);
  return updated;
}

export function deleteSavedView<T>(pageId: string, id: string): SavedView<T>[] {
  const views = loadSavedViews<T>(pageId).filter(v => v.id !== id);
  saveSavedViews(pageId, views);
  return views;
}

export function setDefaultSavedView<T>(pageId: string, id: string): SavedView<T>[] {
  const views = loadSavedViews<T>(pageId).map(v => ({ ...v, isDefault: v.id === id }));
  saveSavedViews(pageId, views);
  return views;
}
