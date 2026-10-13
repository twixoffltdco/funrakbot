/**
 * FUN RAKBOT WEB — транспортный слой браузера.
 *
 * ВАЖНО (ограничение браузера): нативных UDP-сокетов в браузере нет, поэтому
 * весь RakNet-трафик проходит через Edge-прокси:
 *   1) WebTransport (HTTP/3, datagrams) — предпочтительный путь, если браузер
 *      и платформа деплоя его поддерживают;
 *   2) WebSocket (binary frames) — fallback («UDP-over-WebSocket»), работает везде.
 *
 * Прокси на другом конце открывает UDP-сокет к целевому SA-MP серверу и
 * пересылает датаграммы туда-обратно 1-в-1 (бинарные данные не трансформируются).
 */

import { fromB64, toB64 } from './bitstream';

export interface Transport {
  /** Отправить одну UDP-датаграмму на прокси. */
  send(data: Uint8Array): void;
  /** Колбэк входящей датаграммы от прокси. */
  onMessage(cb: (data: Uint8Array) => void): void;
  /** Колбэк закрытия/ошибки соединения с прокси. */
  onClose(cb: (reason: string) => void): void;
  close(): void;
  readonly kind: 'webtransport' | 'websocket';
}

export interface TransportOptions {
  /** Адрес Edge-прокси, напр. https://bot.example.com или wss://... */
  proxyUrl: string;
  /** Целевой SA-MP сервер (пробрасывается прокси как заголовок/первый фрейм). */
  targetHost: string;
  targetPort: number;
  /** Вызов для логирования событий UI. */
  log: (level: 'info' | 'warn' | 'error', msg: string) => void;
}

/** Есть ли у браузера WebTransport (Chromium-based, HTTPS + HTTP/3). */
export function hasWebTransport(): boolean {
  return typeof (globalThis as Record<string, unknown>).WebTransport === 'function';
}

/**
 * Создание транспорта: сначала пробуем WebTransport, при неудаче — WebSocket.
 * Возвращаемый объект единообразен для ядра клиента.
 */
export async function createTransport(opts: TransportOptions): Promise<Transport> {
  if (hasWebTransport()) {
    try {
      return await openWebTransport(opts);
    } catch (e) {
      opts.log('warn', `WebTransport недоступен (${(e as Error).message}), переключаюсь на WebSocket…`);
    }
  }
  return openWebSocket(opts);
}

/** Транспорт поверх WebTransport (datagram transport, без гарантий доставки — как UDP). */
async function openWebTransport(o: TransportOptions): Promise<Transport> {
  const url = new URL('/wt', o.proxyUrl.startsWith('ws') ? 'https://' + o.proxyUrl.replace(/^wss?:\/\//, '') : o.proxyUrl);
  url.searchParams.set('host', o.targetHost);
  url.searchParams.set('port', String(o.targetPort));

  const wt = new (globalThis as never as { WebTransport: new (u: string) => WebTransportLike }).WebTransport(url.toString());
  await wt.ready; // ждём установления QUIC-соединения

  const writer = wt.datagrams.writable.getWriter();
  const reader = wt.datagrams.readable.getReader();
  let closed = false;
  const handlers: Array<(d: Uint8Array) => void> = [];
  const closeHandlers: Array<(r: string) => void> = [];

  // Фоновая читалка датаграмм → колбэки подписчикам
  (async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const h of handlers) h(new Uint8Array(value));
      }
    } catch { /* соединение разорвано */ }
    for (const h of closeHandlers) h('WebTransport closed');
  })();

  return {
    kind: 'webtransport',
    send(data) {
      if (closed) throw new Error('транспорт закрыт');
      void writer.write(data);
    },
    onMessage(cb) { handlers.push(cb); },
    onClose(cb) { closeHandlers.push(cb); },
    close() { closed = true; try { wt.close({ reasonCode: 0, description: 'bot stop' }); } catch {} },
  };
}

/** Минимальные типы WebTransport (без lib.dom расширений в старых TS). */
interface WebTransportLike {
  ready: Promise<void>;
  datagrams: {
    writable: WritableStream<Uint8Array>;
    readable: ReadableStream<ArrayBuffer>;
  };
  close(opt: { reasonCode: number; description: string }): void;
}

/**
 * Fallback: WebSocket в бинарном режиме.
 * Первый текстовый фрейм — JSON «connect» (host/port), далее — чистые байты RakNet.
 * Если платформа не даёт dgram (например, чисто статический хостинг), используется
 * HTTP long-polling вариант из edge/proxy.ts (см. docs/DEPLOY.md).
 */
function openWebSocket(o: TransportOptions): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const wsUrl = o.proxyUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/api/proxy';
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    const timers = setTimeout(() => reject(new Error('WebSocket timeout')), 8000);

    ws.onopen = () => {
      clearTimeout(timers);
      // Первым сообщением говорим прокси, куда форвардить UDP
      ws.send(JSON.stringify({ type: 'bind', host: o.targetHost, port: o.targetPort }));
      const handlers: Array<(d: Uint8Array) => void> = [];
      const closeHandlers: Array<(r: string) => void> = [];
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') return; // служебные JSON-ответы игнорируем
        for (const h of handlers) h(new Uint8Array(ev.data as ArrayBuffer));
      };
      ws.onclose = (ev) => { for (const h of closeHandlers) h(ev.reason || 'WebSocket closed'); };
      resolve({
        kind: 'websocket',
        send(data) { ws.send(data); },
        onMessage(cb) { handlers.push(cb); },
        onClose(cb) { closeHandlers.push(cb); },
        close() { try { ws.close(1000, 'bot stop'); } catch {} },
      });
    };
    ws.onerror = () => { clearTimeout(timers); reject(new Error('WebSocket error')); };
  });
}

export { toB64, fromB64 };
