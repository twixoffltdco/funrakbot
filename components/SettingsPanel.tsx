/**
 * FUN RAKBOT WEB — панель настроек бота (Dark Mode, стиль админ-чата FR_).
 * Все значения сохраняются в localStorage/IndexedDB (см. lib/settings.ts).
 */

'use client';

import type { BotSettings } from '@/lib/raknet/client';

interface Props {
  settings: BotSettings;
  disabled: boolean;            // во время работы меняем только через Stop
  onChange(patch: Partial<BotSettings>): void;
}

const inputCls =
  'w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40';

const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500';

export default function SettingsPanel({ settings, disabled, onChange }: Props) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-400">
        ⚙ Настройки RakBot
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="server">Server IP:Port</label>
          <input
            id="server" className={inputCls} disabled={disabled}
            value={settings.server} placeholder="188.127.241.74:3694"
            onChange={(e) => onChange({ server: e.target.value })}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="nick">Bot Nickname</label>
          <input
            id="nick" className={inputCls} disabled={disabled} maxLength={23}
            value={settings.nickname} placeholder="FR_RakBot"
            onChange={(e) => onChange({ nickname: e.target.value })}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="afk">Anti-AFK Interval (min)</label>
          <input
            id="afk" className={inputCls} disabled={disabled} type="number"
            min={1} max={60}
            value={settings.antiAfkMinutes}
            onChange={(e) => onChange({ antiAfkMinutes: Number(e.target.value) })}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="proxy">Edge Proxy URL (опционально)</label>
          <input
            id="proxy" className={inputCls} disabled={disabled}
            value={settings.proxyUrl} placeholder="по умолчанию — этот же origin"
            onChange={(e) => onChange({ proxyUrl: e.target.value })}
          />
        </div>
      </div>

      {/* Toggle: Auto-Reconnect */}
      <label className="mt-4 flex cursor-pointer items-center gap-3 select-none">
        <button
          type="button" role="switch" aria-checked={settings.autoReconnect}
          onClick={() => !disabled && onChange({ autoReconnect: !settings.autoReconnect })}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            settings.autoReconnect ? 'bg-emerald-500' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-zinc-100 transition-all ${
              settings.autoReconnect ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </button>
        <span className="text-sm text-zinc-300">
          Auto-Reconnect <span className="text-zinc-600">(экспоненциальный backoff 1→60с)</span>
        </span>
      </label>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
        Настройки хранятся локально (localStorage / IndexedDB) — без регистрации и серверной части.
        Бот работает только пока открыта эта вкладка.
      </p>
    </section>
  );
}
