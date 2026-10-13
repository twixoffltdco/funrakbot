/**
 * FUN RAKBOT WEB — хранилище настроек (localStorage + IndexedDB fallback).
 * Без регистрации: всё живёт в браузере пользователя; при закрытии вкладки
 * бот умирает, но настройки остаются для следующего визита.
 */

import type { BotSettings } from './raknet/client';

const LS_KEY = 'fr_rakbot_settings_v1';
const DB_NAME = 'fun-rakbot-web';
const STORE = 'settings';

/** Дефолтные настройки проекта (целевой сервер Black Russia copy). */
export const DEFAULTS: BotSettings = {
  server: '188.127.241.74:3694',
  nickname: 'FR_RakBot',
  antiAfkMinutes: 3,
  autoReconnect: true,
  proxyUrl: '',
};

/** Загрузка настроек: localStorage → IndexedDB → дефолты. */
export async function loadSettings(): Promise<BotSettings> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return sanitize({ ...DEFAULTS, ...JSON.parse(raw) });
  } catch { /* приватный режим — идём в IndexedDB */ }

  const fromIdb = await idbGet();
  return fromIdb ? sanitize(fromIdb) : { ...DEFAULTS };
}

/** Сохранение настроек сразу в оба хранилища (надёжность против очистки LS). */
export async function saveSettings(s: BotSettings): Promise<void> {
  const clean = sanitize(s);
  try { localStorage.setItem(LS_KEY, JSON.stringify(clean)); } catch { /* quota/private mode */ }
  await idbPut(clean);
}

/** Валидация/очистка значений — защита от битых данных в хранилище. */
function sanitize(s: BotSettings): BotSettings {
  return {
    server: /^[\w.-]+:\d{1,5}$/.test(s.server ?? '') ? s.server : DEFAULTS.server,
    nickname: String(s.nickname ?? '').slice(0, 23) || DEFAULTS.nickname,
    antiAfkMinutes: Math.min(60, Math.max(1, Number(s.antiAfkMinutes) || DEFAULTS.antiAfkMinutes)),
    autoReconnect: Boolean(s.autoReconnect),
    proxyUrl: /^https?:\/\/|^$/.test(s.proxyUrl ?? '') ? s.proxyUrl : '',
  };
}

// ---------- IndexedDB helpers (fallback-хранилище) ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<BotSettings | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get('current');
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbPut(s: BotSettings): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(s, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* IndexedDB недоступен — localStorage достаточно */ }
}
