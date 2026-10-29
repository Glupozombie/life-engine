const DB_NAME = 'life-engine-storage';
const DB_VERSION = 1;
const STORE = 'worlds';
const FALLBACK_PREFIX = 'life-engine-save:';
let dbPromise;

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB недоступен'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть локальное хранилище'));
    request.onblocked = () => reject(new Error('Хранилище занято другой вкладкой'));
  });
  return dbPromise;
}

function fallbackSave(key, record) {
  try {
    localStorage.setItem(FALLBACK_PREFIX + key, JSON.stringify(record));
    return true;
  } catch (error) {
    throw new Error(`Не удалось записать сохранение в браузере: ${error.message || 'недостаточно места'}`);
  }
}

export async function saveWorld(key, world, label = key) {
  const savedAt = Date.now();
  const snapshot = JSON.parse(JSON.stringify(world));
  const record = { key, label, savedAt, version: snapshot.version, world: snapshot };
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Не удалось сохранить мир'));
      tx.onabort = () => reject(tx.error || new Error('Запись сохранения отменена'));
    });
  } catch (error) {
    // IndexedDB may be blocked by browser settings; use localStorage as a fallback, never clear the existing record first.
    fallbackSave(key, record);
  }
  return { key, label, savedAt };
}

export async function loadWorld(key) {
  try {
    const db = await openDatabase();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Не удалось прочитать сохранение'));
    });
    if (record) return record;
  } catch {
    // Read through the fallback below.
  }
  try {
    const raw = localStorage.getItem(FALLBACK_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function listWorldSaves() {
  let records = [];
  try {
    const db = await openDatabase();
    records = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('Не удалось получить список сохранений'));
    });
  } catch {
    records = [];
  }
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (full?.startsWith(FALLBACK_PREFIX)) keys.push(full.slice(FALLBACK_PREFIX.length));
    }
    for (const key of keys) {
      try {
        const fallback = JSON.parse(localStorage.getItem(FALLBACK_PREFIX + key));
        if (fallback && !records.some(record => record.key === key)) records.push(fallback);
      } catch { /* Skip malformed fallback record. */ }
    }
  } catch { /* Browser storage may be disabled. */ }
  return records.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).map(record => ({
    key: record.key, label: record.label || record.key, savedAt: record.savedAt || 0,
    population: record.world?.organisms?.length ?? 0,
    generation: record.world?.generation ?? 0
  }));
}

export async function deleteWorldSave(key) {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* Try to remove the fallback as well. */ }
  try { localStorage.removeItem(FALLBACK_PREFIX + key); } catch { /* Ignore disabled local storage. */ }
}

export function formatSavedAt(timestamp) {
  if (!timestamp) return 'без даты';
  try { return new Date(timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return 'сохранено'; }
}
