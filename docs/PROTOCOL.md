# RakNet / SA-MP протокол в FUN RAKBOT WEB

## Жизненный цикл подключения

```
Browser tab                    Edge proxy                SA-MP server
     │  WS/WT binary frame         │                          │
     │ ── bind {host,port} ───────▶│                          │
     │ ◀────────── bound ──────────│                          │
     │ ── [0x00 magic raknet1…] ──▶│ ── UDP datagram ────────▶│ Connection Request
     │                             │◀── UDP datagram ─────────│ CONNECTION_ACCEPTED
     │ ◀── raw bytes ──────────────│                          │
     │ ── reliable[0x14]+InGame ──▶│ ────────────────────────▶│ RPC_SERVER_LOGON
     │        … keep-alive loop …  │                          │
```

## Ключевые пакеты (реализовано в lib/raknet/handshake.ts)

| ID | Название | Направление | Статус в боте |
|---|---|---|---|
| 0x00 | Connection Request | C→S | ✅ отправляется |
| 0x01 | Connection Accepted | S→C | ✅ парсится |
| 0x05 | Connection Lost | S→C | ✅ вызывает реконнект |
| 0x0D | New Incoming Ping | S→C | ✅ авто-pong |
| 0x0C | New Outgoing Pong | C→S | ✅ heartbeat |
| 0x14 | Reliable Data Frame | оба | ✅ минимальный framing |
| 'S' (0x53) | InGame packet | оба | ✅ RPC-обёртка |

## Reliable framing (SA-MP 0.3.7)

```
[0]=0x14  flags: ReliableData + ContinuousAck
[1..3]    send sequence number, little-endian 24-bit
[4..5]    timestamp: 10 bit (тики ×2 мс) + ack bitmap size (6 bit) = 0
[6..]     payload
```

## RPC (call id little-endian u16, размер блока big-endian u16)

- `RPC_PING (5)` → отвечаем `RPC_PING_BACK (6)` c u32 эхом;
- `RPC_ACKNOWLEDGE_TICKS (46)` → отвечаем текущими тиками;
- `RPC_SERVER_LOGON (53)` → ник(24)+lang+mangle keys+spectator;
- `RPC_HEAD_MOVE (23)` → f32 delta yaw — anti-AFK активность.

## Честно об ограничениях открытой реализации

1. **Mangle/AWC ключи.** Реальный SA-MP шифрует InGame-поток per-server ключами.
   Бот отправляет нулевые mangle-ключи — проходит на серверах с выключенным
   `mp_settings: usemangle=false` и на большинстве open.mp-сборок. Для полностью
   закрытых сборок потребуется допилить `buildServerLogon()` (issue #1, help wanted).
2. **ACK-битмапы.** Мы не подтверждаем входящие reliable-пакеты битмапами —
   сервер может ретрансмить garbage; для keep-alive это безвредно, но увеличивает
   трафик (~2×). Полноценный sliding-window ACK — roadmap v1.1.
3. **Полный CLIENT_SYNC** (позиция, здоровье, транспорт) не эмулируется: сервер
   видит игрока в точке спавна. Anti-AFK скрипты, реагирующие на координаты,
   могут не засчитать активность — используйте интервалы ≤3 минут.

## Тест побайтовости

```bash
npx tsx lib/raknet/selftest.ts
```
