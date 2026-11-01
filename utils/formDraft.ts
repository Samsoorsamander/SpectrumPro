const PREFIX = "spectrum_pro_draft:";

export function readFormDraft<T>(id: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeFormDraft(id: string, value: unknown) {
  localStorage.setItem(PREFIX + id, JSON.stringify(value));
}

export function clearFormDraft(id: string) {
  localStorage.removeItem(PREFIX + id);
}
