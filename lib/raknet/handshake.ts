/**
 * FUN RAKBOT WEB — модуль RakNet handshake и сборки пакетов SA-MP 0.3.7 / CRMP 0.3e.
 * Здесь реализованы «чистые» функции кодирования/декодирования, без сетевого I/O,
 * поэтому их можно тестировать и на клиенте, и на Edge-прокси.
 */

import { ByteWriter, ByteReader, randomGuid } from './bitstream';
import { MsgId, SAMP_PROTOCOL_ID, RAKNET_VERSION_SAMP } from './constants';

export interface SessionKeys {
  /** Входящий счётчик пакетов (read sequence number). */
  receiveSeq: number;
  /** Исходящий счётчик пакетов (send sequence number). */
  sendSeq: number;
  /** GUID клиента (16 байт), генерируется один раз за сессию. */
  clientGuid: Uint8Array;
}

/** Создание нового комплекта ключей сессии (start handshake). */
export function newSession(): SessionKeys {
  return { receiveSeq: 0, sendSeq: 0, clientGuid: randomGuid() };
}

/**
 * Этап 1 handshake: Connection Request (0x00) + magic + версия + guid + MTU.
 * Нерассылаемый (unreliable) пакет — именно так его ждёт сервер SA-MP.
 */
export function buildConnectionRequest(s: SessionKeys, mtu = 1242): Uint8Array {
  const w = new ByteWriter();
  w.u8(MsgId.CONNECTION_OPEN_REQUEST); // 0x00
  w.magic();                            // 00 0F FF 7F
  w.str(SAMP_PROTOCOL_ID, 8);           // 'raknet1' + \0
  w.bool(false);                        // useSecurity = false
  w.str(RAKNET_VERSION_SAMP, 12);       // строка версии RakNet
  w.u32(0);                             // internal IP port (legacy)
  w.u32(0);                             // internal IP (legacy)
  w.u32(0);                             // external IP port (legacy)
  w.u32(0);                             // external IP (legacy)
  w.guid(s.clientGuid);                 // 16-байтный GUID клиента
  w.u32(mtu);                           // MTU датаграммы
  return w.toArray();
}

/**
 * Парсинг ответа CONNECTION_ACCEPTED (0x01).
 * Возвращает server-guid и время жизни соединения; бросает ошибку если ID другой.
 */
export function parseConnectionAccepted(data: Uint8Array): { serverGuid: Uint8Array; lifetime: number } {
  const r = ByteReader.from(data);
  const id = r.u8();
  if (id !== MsgId.CONNECTION_ACCEPTED) {
    throw new Error(`Ожидался CONNECTION_ACCEPTED (0x01), получен 0x${id.toString(16)}`);
  }
  r.magic();
  r.bytes(2 + 16 + 2 + 16 + 2 + 16); // server bind / system addr (legacy поля)
  const serverGuid = r.bytes(16);
  r.u16(); // MTU из ответа нам не критичен
  const lifetime = r.u32();
  return { serverGuid, lifetime };
}

/**
 * Оборачивание payload в надёжный (reliable) фрейм RakNet 3.x / SA-MP 0.3.7:
 *   [1 байт флагов = 0x14][3 байта LE send sequence][2 байта timestamp + ack size][payload]
 * Флаг 0x14 = ReliableData + NeedsContinuousAck. Это минимально достаточный
 * формат, который принимают серверы SA-MP 0.3.7 / open.mp (см. docs/PROTOCOL.md).
 */
export function wrapReliable(s: SessionKeys, payload: Uint8Array, timestamp: number): Uint8Array {
  const w = new ByteWriter();
  w.u8(0x14); // ReliableDataMessage + ContinuousAck flag
  // 24-битный номер исходящего пакета (little-endian), как в оригинальном RakNet
  w.u8(s.sendSeq & 0xff);
  w.u8((s.sendSeq >> 8) & 0xff);
  w.u8((s.sendSeq >> 16) & 0xff);
  // 10-битный timestamp (тики по 2 мс) + 6-битный размер ACK-битмапы (= 0)
  const ts = timestamp & 0x3ff;
  w.u8((ts >> 2) & 0xff);
  w.u8((ts & 0x3) << 6);
  w.raw(payload);
  s.sendSeq++;
  return w.toArray();
}

/** Разбор входящей датаграммы: id первого сообщения + остаток после заголовка. */
export function parseIncoming(data: Uint8Array): { msgId: number; body: Uint8Array } {
  const r = ByteReader.from(data);
  const msgId = r.u8();
  return { msgId, body: r.bytes(r.remaining) };
}

/** Сброс нумерации при старте — используется ядром клиента. */
export function bumpReceive(s: SessionKeys): void { s.receiveSeq++; }

/**
 * Сборка SA-MP InGame пакета (0x53 'S') c одним RPC внутри.
 * Структура: 'S' + playerID(3, big-endian) + bitflags(1) + RPC size(2 BE) + RPC body.
 */
export function buildInGameRpc(playerId: number, rpcId: number, body: Uint8Array): Uint8Array {
  const w = new ByteWriter();
  w.u8(MsgId.IN_GAME);                       // 'S'
  w.u8((playerId >> 16) & 0xff);             // player id — big-endian 3 байта
  w.u8((playerId >> 8) & 0xff);
  w.u8(playerId & 0xff);
  w.u8(0x08);                                // bitflags: hasPlayerID=true, no in-range flags
  const rpcLen = 2 + body.length;            // 1 байт static id? нет: u16 LE call id + body
  w.u8((rpcLen >> 8) & 0xff);                // размер RPC — big-endian u16
  w.u8(rpcLen & 0xff);
  w.u8(rpcId & 0xff); w.u8((rpcId >> 8) & 0xff); // call id — little-endian u16
  w.raw(body);
  return w.toArray();
}

/** Тело RPC_PING_BACK: просто эхо входящего сериала (u32). */
export function buildPingBack(serialOrTime: number): Uint8Array {
  return new ByteWriter().u32(serialOrTime).toArray();
}

/**
 * Тело RPC_SERVER_LOGON — вход игрока.
 * Формат 0.3.7: [u8 useMunge][u32 keysCount?]... упрощённая легальная форма:
 * nick(24) + lang + awc token + spectator flag. Реальные mangle-ключи зависят
 * от сборки сервера — см. docs/PROTOCOL.md (ограничение открытой реализации).
 */
export function buildServerLogon(nick: string, spectator = false): Uint8Array {
  const w = new ByteWriter();
  w.bool(false);            // useMapGameOptions = false
  w.str('wtb', 4);          // язык клиента
  w.u8(0); w.u8(0);         // mangle key 1/2 (0 = без шифрования)
  w.u8(0); w.u8(0);         // mangle key 3/4
  w.u8(0); w.u8(0);         // challenge-response (compat bytes)
  w.u8(0); w.u8(0); w.u8(0); w.u8(0); // unknown AWC fields
  w.str(nick.slice(0, 23), 24); // никнейм фикс. 24 байта
  w.bool(spectator);        // spectator mode
  return w.toArray();
}

/**
 * Имитация активности: минимальный CLIENT_SYNC с поворотом камеры.
 * Полноценный sync огромен; для anti-AFK достаточно HEAD_MOVE-like RPC
 * или пустого RPC_PING_BACK — здесь возвращаем «движение головы».
 */
export function buildHeadMove(yawDelta: number): Uint8Array {
  return new ByteWriter().f32(yawDelta).toArray();
}
