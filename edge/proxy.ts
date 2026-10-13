/**
 * FUN RAKBOT WEB — Edge Function прокси (WebTransport/WebSocket ↔ UDP).
 *
 * Назначение: браузер не умеет отправлять UDP, поэтому Edge-платформа
 * (Tatnet / Layer0 / Onreza / Vercel-compatible) принимает бинарные сообщения
 * от вкладки и переправляет их как UDP-датаграммы на SA-MP/CRMP сервер,
 * и обратно. Бинарные данные RakNet проходят 1-в-1 без трансформации.
 *
 * ВАЖНО ПРО RUNTIME:
 *  - На платформах с полноценным Node-runtime в edge (Tatnet, Layer0) здесь
 *    используется dgram-сокет — это НЕ VPS, а serverless-функция провайдера.
 *  - Если среда поддерживает только Web Streams (без dgram), включается
 *    HTTP-relay режим: функция делает fetch на внутренний relay-сервис
 *    провайдера (RABBIT_RELAY_URL). См. docs/DEPLOY.md.
 *
 * Лимиты DDoS-защиты: максимум MAX_SESSIONS одновременных UDP-сессий с одного IP.
 */

// Типы Node в edge-среде Tatnet/Layer0 предоставляет провайдер
import dgram from 'node:dgram';
import { Buffer } from 'node:buffer';

/** Объект WebSocket-клиента Layer0/Tatnet (accept/send/close + события). */
interface EdgeWsClient {
  data?: { ip: string };
  accept(): void;
  send(data: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  addEventListener(ev: string, cb: (e: { data: ArrayBuffer | string }) => void): void;
}

/** Расширенный контекст edge-функции с upgrader'ом .ws у Tatnet/Layer0. */
interface ProxyCtx {
  waitUntil?(p: Promise<unknown>): void;
  ws?(handler: (client: EdgeWsClient) => void | Promise<void>): Response;
}

export const config = { runtime: 'edge' };

/** Максимум одновременных сессий (UDP-сокетов) с одного клиентского IP. */
const MAX_SESSIONS_PER_IP = 5;
/** Простаивавшая без трафика сессия закрывается через 90 секунд. */
const SESSION_TTL_MS = 90_000;
/** Жёсткий whitelist целевых портов SA-MP/CRMP (защита от port-scan из браузера). */
const ALLOWED_PORTS = new Set<number>([7777, 3694, 8192, 7778]);

interface UdpSession {
  socket: import('node:dgram').Socket;
  lastSeen: number;
  /** Целевой SA-MP сервер, сохранённый при bind. */
  target: { host: string; port: number };
}

/** Реестр активных сессий: ws-client → udp socket. Память живёт в warm-instance. */
const sessions = new Map<unknown, UdpSession>();
/** Счётчик сессий по IP клиента для anti-DDoS лимита. */
const ipCount = new Map<string, number>();

/** Разбор "host:port" из запроса браузера с валидацией. */
function parseTarget(rawHost: unknown, rawPort: unknown): { host: string; port: number } {
  const host = String(rawHost ?? '');
  const port = Number(rawPort ?? 0);
  if (!/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9.-]+$/i.test(host)) {
    throw new Error('некорректный host');
  }
  if (!Number.isInteger(port) || !ALLOWED_PORTS.has(port)) {
    throw new Error(`порт ${port} запрещён policy (разрешены SA-MP/CRMP: ${[...ALLOWED_PORTS].join(', ')})`);
  }
  return { host, port };
}

/** Освобождение сессии и счётчика IP. */
function release(client: unknown, ip?: string): void {
  const s = sessions.get(client);
  if (s) {
    try { s.socket.close(); } catch { /* уже закрыт */ }
    sessions.delete(client);
    if (ip) ipCount.set(ip, Math.max(0, (ipCount.get(ip) ?? 1) - 1));
  }
}

/** Периодическая чистка мёртвых сессий (NAT traversal: keep-alive со стороны proxy). */
setInterval(() => {
  const now = Date.now();
  for (const [client, s] of sessions) {
    if (now - s.lastSeen > SESSION_TTL_MS) release(client);
  }
}, 15_000).unref?.();

/**
 * Точка входа Edge Function.
 * Ожидает upgrade на WebSocket (Layer0/Tatnet прокидывают `ctx.ws`) либо
 * POST c JSON { host, port, data(b64) } в HTTP-relay режиме.
 */
export default async function handler(req: Request, ctx: ProxyCtx): Promise<Response | undefined> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // ---- Режим WebSocket (UDP-over-WebSocket fallback) ----
  if (typeof ctx?.ws === 'function') {
    return ctx.ws(async (client: EdgeWsClient) => {
      client.data = { ip };

      // Защита: лимит 5 одновременных подключений с одного IP (anti-DDoS)
      if ((ipCount.get(ip) ?? 0) >= MAX_SESSIONS_PER_IP) {
        client.accept();
        client.send(JSON.stringify({ type: 'error', message: 'limit: максимум 5 сессий на IP' }));
        client.close(1013, 'rate limited');
        return;
      }

      let bound = false;
      client.accept();

      client.addEventListener('message', (ev: { data: ArrayBuffer | string }) => {
        if (typeof ev.data === 'string') {
          // Первый фрейм — JSON bind: { type:'bind', host, port }
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'bind' && !bound) {
              const target = parseTarget(msg.host, msg.port);
              const socket = dgram.createSocket('udp4');

              // Обратный путь (NAT traversal): UDP-ответ сервера → тот же WS-клиент.
              // Сокет привязан к тому же 4-tuple, поэтому сервер «видит» один источник.
              socket.on('message', (buf: Uint8Array) => {
                const s = sessions.get(client);
                if (s) s.lastSeen = Date.now();
                try { client.send(buf); } catch { /* клиент ушёл */ }
              });

              sessions.set(client, { socket, lastSeen: Date.now(), target });
              ipCount.set(ip, (ipCount.get(ip) ?? 0) + 1);
              bound = true;
              client.send(JSON.stringify({ type: 'bound', host: target.host, port: target.port }));
            }
          } catch (e) {
            client.send(JSON.stringify({ type: 'error', message: (e as Error).message }));
          }
          return;
        }

        // Все остальные фреймы — чистые байты RakNet → UDP датаграмма на SA-MP сервер
        const s = sessions.get(client);
        if (!s) return;
        s.lastSeen = Date.now();
        s.socket.send(Buffer.from(ev.data), s.target.port, s.target.host, (err) => {
          if (err) {
            try { client.send(JSON.stringify({ type: 'error', message: `udp send: ${err.message}` })); } catch { /* noop */ }
          }
        });
      });

      const cleanup = () => release(client, ip);
      client.addEventListener('close', cleanup);
      client.addEventListener('error', cleanup);
    });
  }

  // ---- Режим HTTP-relay (для платформ без WS/dgram в edge) ----
  if (req.method === 'POST') {
    const body = await req.json().catch(() => null);
    const relayUrl = process.env.RABBIT_RELAY_URL; // внутренний relay провайдера
    if (!body || !relayUrl) {
      return new Response(JSON.stringify({ error: 'relay не настроен (RABBIT_RELAY_URL)' }), { status: 501, headers: { 'content-type': 'application/json' } });
    }
    // Relay сам держит UDP-сокеты и применяет те же лимиты; здесь — только проброс + авторизация по IP
    const resp = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-ip': ip },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return new Response(resp.body, { status: resp.status, headers: { 'content-type': 'application/json' } });
  }

  return new Response('FUN RAKBOT EDGE PROXY — use WebSocket upgrade or POST relay', { status: 200 });
}
