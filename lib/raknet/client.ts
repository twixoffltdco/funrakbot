/**
 * FUN RAKBOT WEB — BROWSER RAKNET CLIENT CORE.
 *
 * Ядро бота, живущее ТОЛЬКО в активной вкладке браузера (TAB-LIFETIME концепция):
 *  - RakNet handshake: Connection Request (0x00) → Connection Accepted (0x01);
 *  - RPC_SERVER_LOGON с никнеймом из настроек;
 *  - авто-ответ на RPC_Ping / RPC_AcknowledgeTicks и NEW_INCOMING_PING;
 *  - Anti-AFK: периодическая имитация активности (камера/WASD-подобные пакеты);
 *  - авто-реконнект с экспоненциальным backoff (1s → 2s → 4s … max 60s).
 *
 * Транспорт — WebTransport или UDP-over-WebSocket через Edge-прокси
 * (см. lib/raknet/transport.ts и edge/proxy.ts). Никаких VPS/нативных сокетов.
 */

import {
  newSession, buildConnectionRequest, parseConnectionAccepted, wrapReliable,
  buildInGameRpc, buildPingBack, buildServerLogon, buildHeadMove, SessionKeys,
} from './handshake';
import { createTransport, Transport } from './transport';
import { MsgId, Rpc } from './constants';

export type BotStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'error' | 'stopped';

export interface BotSettings {
  /** Формат "IP:Port", напр. "188.127.241.74:3694". */
  server: string;
  nickname: string;
  /** Интервал Anti-AFK активности, в минутах. */
  antiAfkMinutes: number;
  /** Включён ли авто-реконнект. */
  autoReconnect: boolean;
  /** Адрес собственного Edge-прокси (по умолчанию — этот же origin). */
  proxyUrl: string;
}

export interface BotEvents {
  onStatus(s: BotStatus, detail?: string): void;
  onLog(level: 'info' | 'warn' | 'error', msg: string): void;
  onPing(ms: number): void;
}

const DEFAULT_SETTINGS: BotSettings = {
  server: '188.127.241.74:3694', // Black Russia copy (CRMP 0.3e)
  nickname: 'FR_RakBot',
  antiAfkMinutes: 3,
  autoReconnect: true,
  proxyUrl: '',
};

export const FALLBACK_SETTINGS = DEFAULT_SETTINGS;

/** Класс бота: один экземпляр = одна «виртуальная вкладка-сессия» на сервере. */
export class RakBotClient {
  private settings: BotSettings;
  private events: BotEvents;
  private transport: Transport | null = null;
  private session: SessionKeys | null = null;
  private playerId = 0;
  private tickStart = 0;
  private status: BotStatus = 'idle';
  private stoppedByUser = false;
  private attempt = 0;                 // счётчик реконнектов для backoff
  private timers: ReturnType<typeof setTimeout>[] = [];
  private lastPingSent = 0;

  constructor(settings: Partial<BotSettings>, events: BotEvents) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.events = events;
  }

  /** Обновление настроек без перезапуска (для live-edit в UI). */
  update(patch: Partial<BotSettings>): void {
    this.settings = { ...this.settings, ...patch };
  }

  private log(level: 'info' | 'warn' | 'error', msg: string): void {
    this.events.onLog(level, msg);
  }

  private setStatus(s: BotStatus, detail?: string): void {
    this.status = s;
    this.events.onStatus(s, detail);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  /** Старт: handshake → logon → keep-alive цикл. */
  async start(): Promise<void> {
    this.stoppedByUser = false;
    this.attempt = 0;
    await this.connect();
  }

  /** Полная остановка с закрытием транспорта (вызывается и при beforeunload). */
  stop(reason = 'остановлен пользователем'): void {
    this.stoppedByUser = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    try { this.transport?.close(); } catch { /* уже закрыт */ }
    this.transport = null;
    this.session = null;
    this.setStatus('stopped', reason);
    this.log('info', `Бот остановлен: ${reason}.`);
  }

  getStatus(): BotStatus { return this.status; }

  /** Разбор строки "IP:Port" целевого сервера. */
  private target(): { host: string; port: number } {
    const [host, portStr] = this.settings.server.split(':');
    const port = parseInt(portStr ?? '', 10);
    if (!host || !port || port < 1 || port > 65535) {
      throw new Error(`Некорректный адрес сервера: "${this.settings.server}" (ожидается IP:Port)`);
    }
    return { host, port };
  }

  /** Одна попытка подключения: транспорт + RakNet handshake. */
  private async connect(): Promise<void> {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let tgt: { host: string; port: number };
    try {
      tgt = this.target();
    } catch (e) {
      this.setStatus('error', (e as Error).message);
      this.log('error', (e as Error).message);
      return;
    }

    const proxyUrl = this.settings.proxyUrl || location.origin;
    this.log('info', `Подключаюсь к ${tgt.host}:${tgt.port} через ${proxyUrl}…`);

    try {
      this.transport = await createTransport({
        proxyUrl,
        targetHost: tgt.host,
        targetPort: tgt.port,
        log: (l, m) => this.log(l, m),
      });
    } catch (e) {
      this.fail((e as Error).message);
      return;
    }

    this.log('info', `Транспорт установлен: ${this.transport.kind.toUpperCase()}.`);

    this.session = newSession();
    this.tickStart = performance.now();

    // Подписка на входящие датаграммы до отправки handshake
    this.transport.onMessage((d) => this.onDatagram(d));
    this.transport.onClose((r) => {
      if (!this.stoppedByUser) this.fail(`соединение с прокси закрыто: ${r}`);
    });

    // Этап 1: Connection Request (unreliable, без reliable-фрейма)
    const req = buildConnectionRequest(this.session);
    this.transport.send(req);
    this.log('info', 'Sent: Connection Request (0x00). Ожидаю Connection Accepted…');

    // Таймаут handshake — 8 секунд
    this.later(8000, () => {
      if (this.status === 'connecting' || this.status === 'reconnecting') {
        this.fail('таймаут handshake (сервер не ответил за 8с)');
      }
    });
  }

  /** Обработка каждой входящей UDP-датаграммы от SA-MP сервера. */
  private onDatagram(data: Uint8Array): void {
    if (!this.session || data.length === 0) return;
    const id = data[0];

    switch (id) {
      case MsgId.CONNECTION_ACCEPTED: {
        // Этап 2 handshake успешен
        try {
          const { lifetime } = parseConnectionAccepted(data);
          this.log('info', `Received: Connection Accepted (0x01), lifetime=${lifetime}s.`);
        } catch (e) {
          this.log('warn', (e as Error).message);
        }
        this.afterHandshake();
        break;
      }

      case MsgId.NEW_INCOMING_PING: {
        // Unreliable ping от сервера — отвечаем pong немедленно
        const w = wrapReliable(this.session, new Uint8Array([MsgId.NEW_OUTGOING_PONG]), this.ticks());
        this.transport?.send(w);
        this.log('info', 'Ping sent (NEW_OUTGOING_PONG).');
        break;
      }

      case 0x14: {
        // Reliable фрейм: [0x14][seq:3][ts+ack:2][payload...]
        const payload = data.subarray(6);
        this.handleReliablePayload(payload);
        break;
      }

      case MsgId.CONNECTION_LOSS:
        this.fail('сервер прислал CONNECTION_LOSS (0x05)');
        break;

      default:
        // Неизвестные/сегментированные фреймы — логируем кратко
        this.log('info', `← datagram id=0x${id.toString(16)}, ${data.length}B`);
    }
  }

  /** Разбор содержимого надёжного фрейма (SA-MP InGame + RPC). */
  private handleReliablePayload(payload: Uint8Array): void {
    if (payload.length === 0) return;

    if (payload[0] === MsgId.IN_GAME && payload.length >= 5) {
      // 'S' + playerID(3 BE) + bitflags — вытаскиваем свой playerID из первого пакета
      const pid = (payload[1] << 16) | (payload[2] << 8) | payload[3];
      if (pid !== this.playerId) {
        this.playerId = pid;
        this.log('info', `InGame: playerID=${pid}.`);
      }
      // Дальше идут RPC — полный разбор необязателен для keep-alive,
      // но мы ищем входящие RPC_Ping/AcknowledgeTicks в «сыром» теле.
      this.scanRpcKeepAlive(payload.subarray(5));
      return;
    }

    if (payload[0] === MsgId.ACKNOWLEDGE_PACKETS) {
      // Сервер подтвердил наши reliable-пакеты — считаем RTT по последнему пингу
      if (this.lastPingSent) {
        const rtt = Math.round(performance.now() - this.lastPingSent);
        this.events.onPing(rtt);
        this.log('info', `Ping sent → ACK, RTT=${rtt}ms.`);
      }
    }
  }

  /** Эвристика: ищем в InGame-теле известные keep-alive RPC и отвечаем на них. */
  private scanRpcKeepAlive(body: Uint8Array): void {
    // RPC block: [size:2 BE][callId:2 LE][args...] — сканируем первые блоки
    let off = 0;
    while (off + 4 <= body.length) {
      const size = (body[off] << 8) | body[off + 1];
      const callId = body[off + 2] | (body[off + 3] << 8);
      if (size < 2 || off + 2 + size > body.length) break;
      if (callId === Rpc.RPC_PING) {
        this.sendRpc(Rpc.RPC_PING_BACK, buildPingBack(Date.now() >>> 0));
        this.log('info', 'Auto-answer: RPC_Ping → RPC_PING_BACK.');
      } else if (callId === Rpc.RPC_ACKNOWLEDGE_TICKS) {
        this.sendRpc(Rpc.RPC_ACKNOWLEDGE_TICKS, buildPingBack(this.ticks()));
        this.log('info', 'Auto-answer: RPC_AcknowledgeTicks.');
      }
      off += 2 + size;
    }
  }

  /** Handshake завершён → шлём RPC_SERVER_LOGON и запускаем циклы. */
  private afterHandshake(): void {
    this.setStatus('online');
    this.attempt = 0;
    this.log('info', `Connected. Логон под ником "${this.settings.nickname}"…`);

    // RPC_SERVER_LOGON идёт как InGame пакет с playerID=0 (до назначения ID сервером)
    const logon = buildInGameRpc(0, Rpc.RPC_SERVER_LOGON, buildServerLogon(this.settings.nickname));
    this.transport?.send(wrapReliable(this.session!, logon, this.ticks()));

    this.scheduleKeepAlive();
    this.scheduleAntiAfk();
  }

  /** Отправка одного RPC в InGame-обёртке. */
  private sendRpc(rpcId: number, body: Uint8Array): void {
    if (!this.session || !this.transport) return;
    const pkt = buildInGameRpc(this.playerId, rpcId, body);
    this.transport.send(wrapReliable(this.session, pkt, this.ticks()));
  }

  /** Тики RakNet: 1 тик = 2 мс от старта сессии (10-битное поле переполняется само). */
  private ticks(): number {
    return Math.floor((performance.now() - this.tickStart) / 2);
  }

  /** Heartbeat каждые 5 секунд: собственный unreliable ping + keep-alive RPC. */
  private scheduleKeepAlive(): void {
    this.later(5000, () => {
      if (this.status !== 'online' || !this.session || !this.transport) return;
      this.lastPingSent = performance.now();
      // NEW_OUTGOING_PONG как heartbeat даже без входящего пинга — легитимно для 0.3.7
      this.transport.send(wrapReliable(this.session, new Uint8Array([MsgId.NEW_OUTGOING_PONG]), this.ticks()));
      this.sendRpc(Rpc.RPC_PING_BACK, buildPingBack(Date.now() >>> 0));
      this.log('info', 'Ping sent (keep-alive heartbeat).');
      this.scheduleKeepAlive();
    });
  }

  /**
   * ANTI-AFK: раз в N минут эмулируем активность игрока —
   * «движение камеры» (HEAD_MOVE) + WASD-подобный пустой sync.
   * Серверные анти-AFK скрипты реагируют именно на такие события.
   */
  private scheduleAntiAfk(): void {
    const every = Math.max(30, this.settings.antiAfkMinutes * 60) * 1000; // сек → мс, min 30s
    this.later(every, () => {
      if (this.status !== 'online') return;
      const yaw = (Math.random() * 30 - 15);   // случайный рыскание ±15°
      const pitch = (Math.random() * 10 - 5);  // небольшой наклон камеры
      this.sendRpc(Rpc.RPC_HEAD_MOVE, buildHeadMove(yaw));
      // WASD-эмуляция: короткий «шаг» — отправляем ping-back как дешёвое событие активности
      this.sendRpc(Rpc.RPC_PING_BACK, buildPingBack(Math.round(pitch * 1000)));
      this.log('info', `Anti-AFK: движение камеры (yaw=${yaw.toFixed(1)}°, pitch=${pitch.toFixed(1)}°) + WASD-tick.`);
      this.scheduleAntiAfk();
    });
  }

  /** Ошибка соединения → экспоненциальный backoff либо стоп. */
  private fail(reason: string): void {
    try { this.transport?.close(); } catch { /* noop */ }
    this.transport = null;
    this.log('error', `Error: ${reason}`);

    if (this.stoppedByUser || !this.settings.autoReconnect) {
      this.setStatus('error', reason);
      return;
    }

    this.attempt++;
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(this.attempt, 6)); // 1,2,4,8,16,32,60s
    this.setStatus('reconnecting', `попытка #${this.attempt} через ${delay / 1000}s`);
    this.log('warn', `Reconnecting… попытка #${this.attempt} через ${delay / 1000}с (exponential backoff).`);
    this.later(delay, () => { if (!this.stoppedByUser) void this.connect(); });
  }
}

/**
 * Привязка к жизненному циклу вкладки (TAB-LIFETIME):
 * при закрытии/переходе страницы бот гарантированноDisconnect'ится,
 * чтобы сервер сразу снял игрока с онлайна.
 */
export function bindTabLifecycle(bot: RakBotClient): () => void {
  const onHide = () => {
    if (document.visibilityState === 'hidden') {
      bot.stop('вкладка скрыта (tab-lifetime)');
    }
  };
  const onUnload = () => bot.stop('вкладка закрыта');
  window.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onUnload);
  return () => {
    window.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onUnload);
  };
}
