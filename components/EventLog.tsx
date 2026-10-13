/**
 * FUN RAKBOT WEB — real-time лог событий + индикатор статуса подключения.
 * Стиль — админский чат FR_: моноширинный тёмный консольный вывод.
 */

'use client';

import { useEffect, useRef } from 'react';
import type { BotStatus } from '@/lib/raknet/client';

export interface LogLine {
  ts: number;                 // epoch ms
  level: 'info' | 'warn' | 'error';
  msg: string;
}

const STATUS_META: Record<BotStatus, { color: string; label: string }> = {
  idle:        { color: 'bg-zinc-500',  label: 'OFFLINE' },
  connecting:  { color: 'bg-yellow-400', label: 'CONNECTING' },
  reconnecting:{ color: 'bg-yellow-400', label: 'RECONNECTING' },
  online:      { color: 'bg-emerald-500', label: 'ONLINE' },
  error:       { color: 'bg-red-500',   label: 'ERROR' },
  stopped:     { color: 'bg-red-500',   label: 'STOPPED' },
};

interface StatusProps { status: BotStatus; detail?: string; ping: number | null }

/** Визуальный индикатор: зелёный / красный / жёлтый + текст статуса. */
export function StatusBadge({ status, detail, ping }: StatusProps) {
  const m = STATUS_META[status];
  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {(status === 'online' || status === 'reconnecting') && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${m.color}`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${m.color}`} />
      </span>
      <span className="text-xs font-bold tracking-widest text-zinc-200">{m.label}</span>
      {detail && <span className="hidden text-[11px] text-zinc-500 sm:inline">{detail}</span>}
      {ping !== null && status === 'online' && (
        <span className="ml-auto text-[11px] font-mono text-emerald-400">{ping}ms</span>
      )}
    </div>
  );
}

interface LogProps { lines: LogLine[]; onClear(): void }

/** Лента событий с автопрокруткой вниз (как терминал). */
export function EventLog({ lines, onClear }: LogProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight; // autoscroll к последней строке
  }, [lines]);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400">
          ▸ Real-time лог
        </h2>
        <button
          onClick={onClear}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-red-500 hover:text-red-400"
        >
          Clear Logs
        </button>
      </header>

      <div ref={boxRef} className="h-64 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed lg:h-80">
        {lines.length === 0 && (
          <p className="text-zinc-700">// Логи появятся после нажатия Start…</p>
        )}
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 text-zinc-600">
              {new Date(l.ts).toLocaleTimeString('ru-RU')}
            </span>
            <span
              className={
                l.level === 'error' ? 'text-red-400' :
                l.level === 'warn'  ? 'text-yellow-400' : 'text-zinc-300'
              }
            >
              {l.msg}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
