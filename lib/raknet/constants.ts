/**
 * FUN RAKBOT WEB — константы протокола RakNet (SA-MP 0.3.7 / CRMP 0.3e).
 * Комментарии на русском языке (open source стандарт проекта).
 */

/** Идентификатор протокола SA-MP, записывается в handshake (8 байт ASCII). */
export const SAMP_PROTOCOL_ID = 'raknet1';

/** Версии RakNet, используемые SA-MP 0.3.7 и CRMP 0.3e. */
export const RAKNET_VERSION_SAMP = '5.0';
export const RAKNET_VERSION_LEGACY = '3.9.0';

/** Reliable-UDP магическое число (4 байта), начало каждого датаграммы RakNet. */
export const RAKNET_MAGIC = [0x00, 0xf, 0xff, 0x7f] as const;

/** Байты идентификаторов сообщений (MessageIDs) нерассылаемой части. */
export const MsgId = {
  /** От клиента: запрос соединения (handshake, этап 1). */
  CONNECTION_OPEN_REQUEST: 0x00,
  /** От сервера: соединение принято (handshake, этап 2). */
  CONNECTION_ACCEPTED: 0x01,
  /** От сервера: отказ в соединении. */
  CONNECTION_LOSS: 0x05,
  /** От сервера: проверка живости ( unreliable ping ). */
  NEW_INCOMING_PING: 0x0d,
  /** От клиента: ответ на NEW_INCOMING_PING. */
  NEW_OUTGOING_PONG: 0x0c,
  /** От клиента: подтверждение получения надёжных пакетов. */
  ACKNOWLEDGE_PACKETS: 0x06,
  /** Нерассылаемый NACK (подтверждение потери) — используется редко. */
  NACK: 0x07,
  /** Сегментированная доставка больших пакетов. */
  OPEN_CONNECTION_REQUEST_2: 0x07,
  /** Рассылаемый пакет с полезной нагрузкой (RPC / InGame). */
  IN_GAME: 0x53, // 'S' — маркер SA-MP InGame пакета
} as const;

/** Идентификаторы RPC-вызовов SA-MP (ключевые для keep-alive). */
export const Rpc = {
  RPC_SERVER_LOGON: 53,          // вход игрока на сервер (ник + параметры)
  RPC_PING: 5,                   // ping-запрос от сервера → отвечаем RPC_PING_BACK
  RPC_PING_BACK: 6,              // наш ответ на пинг
  RPC_ACKNOWLEDGE_TICKS: 46,     // AcknowledgeTicks — anti-cheat heartbeat
  RPC_SET_PLAYER_NAME: 38,       // зарезервировано (не используется ботом)
  RPC_JOIN_VEHICLE: 0,           // заглушка, не шлём
  RPC_HEAD_MOVE: 23,             // «движение головы» — дешёвая имитация активности
  RPC_SERVER_SYNC: 33,           // входящий синк от сервера (обрабатываем молча)
  RPC_CLIENT_SYNC: 20,           // WASD/камера-синк клиента (anti-AFK активность)
} as const;

/** Типы ID в RakNet (3 байта для SA-MP 0.3.7). */
export const PLAYER_ID_BYTES = 3;
