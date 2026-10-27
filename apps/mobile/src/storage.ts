import Storage from "expo-sqlite/kv-store";

/** Leitura síncrona do armazenamento local (SQLite); null se não houver ou se falhar. */
export function readJson<T>(key: string): T | null {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) Storage.removeItemSync(key);
    else Storage.setItemSync(key, JSON.stringify(value));
  } catch {
    /* sem storage */
  }
}
