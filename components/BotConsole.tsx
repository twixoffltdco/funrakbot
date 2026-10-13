/**
 * FUN RAKBOT WEB — главный контроллер UI: Start / Stop, связка ядра бота,
 * настроек (localStorage) и real-time лога. Клиентский компонент ('use client').
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RakBotClient, bindTabLifecycle, BotSettings, BotStatus } from '@/lib/raknet/client';
import { loadSettings, saveSettings } from '@/lib/settings';
import SettingsPanel from './SettingsPanel';
import { EventLog, StatusBadge, LogLine } from './EventLog';

const MAX_LOG_LINES = 500; // защита памяти вкладки при многодневной работе

export default function BotConsole() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [status, setStatus] = useState<BotStatus>('idle');
  const [detail, setDetail] = useState<string | undefined>();
  const [ping, setPing] = useState<number | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);

  const botRef = useRef<RakBotClient | null>(null);
  const running = status === 'online' || status === 'connecting' || status === 'reconnecting';

  /** Добавление строки в лог (с ограничением длины). */
  const pushLog = useCallback((level: LogLine['level'], msg: string) => {
    setLines((prev) => {
      const next = [...prev, { ts: Date.now(), level, msg }];
      return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
    });
  }, []);

  // Загрузка настроек из localStorage/IndexedDB при монтировании
  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  // Создание ядра бота + привязка к жизненному циклу вкладки (TAB-LIFETIME)
  useEffect(() => {
    if (!settings) return;
    const bot = new RakBotClient(settings, {
      onStatus: (s, d) => { setStatus(s); setDetail(d); if (s !== 'online') setPing(null); },
      onLog: (lvl, msg) => pushLog(lvl, msg),
      onPing: (ms) => setPing(ms),
    });
    botRef.current = bot;
    const unbind = bindTabLifecycle(bot);
    return () => { unbind(); bot.stop('компонент размонтирован'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings === null]);

  /** Старт бота с текущими настройками. */
  const onStart = async () => {
    if (!settings || !botRef.current) return;
    await saveSettings(settings);
    botRef.current.update(settings);
    pushLog('info', '=== FUN RAKBOT WEB: запуск (бот живёт, пока открыта вкладка) ===');
    void botRef.current.start();
  };

  /** Полная остановка. */
  const onStop = () => {
    botRef.current?.stop('нажата кнопка Stop');
  };

  /** Live-обновление настроек + автосейв. */
  const patch = (p: Partial<BotSettings>) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...p };
      botRef.current?.update(p);
      void saveSettings(next);
      return next;
    });
  };

  if (!settings) {
    return <div className="p-8 text-center text-zinc-600">Загрузка настроек…</div>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-4 sm:p-6">
      {/* Шапка в стиле FR_ */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div>
          <h1 className="text-lg font-black tracking-tight text-zinc-100">
            FUN <span className="text-emerald-400">RAKBOT</span> WEB
          </h1>
          <p className="text-[11px] text-zinc-500">
            SA-MP 0.3.7 / CRMP 0.3e · NO-VPS · Edge Proxy · Tab-Lifetime
          </p>
        </div>
        <StatusBadge status={status} detail={detail} ping={ping} />
      </header>

      <SettingsPanel settings={settings} disabled={running} onChange={patch} />

      {/* Кнопки управления */}
      <div className="flex gap-3">
        <button
          onClick={() => void onStart()}
          disabled={running}
          className="flex-1 rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ▶ Start
        </button>
        <button
          onClick={onStop}
          disabled={!running}
          className="flex-1 rounded-md border border-red-500/60 bg-transparent px-4 py-2.5 text-sm font-bold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ■ Stop
        </button>
      </div>

      <EventLog lines={lines} onClear={() => setLines([])} />

      <footer className="pb-4 text-center text-[11px] text-zinc-700">
        MIT License · Бот отключается автоматически при закрытии вкладки ·{' '}
        <a className="text-zinc-500 underline hover:text-emerald-400" href="/docs">Docs</a>
      </footer>
    </main>
  );
}
