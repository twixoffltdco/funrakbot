# FUN RAKBOT WEB 🤖

**Браузерный RakNet-бот для удержания онлайна на SA-MP / CRMP серверах — без VPS, без установки, без регистрации.**

Открыл вкладку — бот работает. Закрыл вкладку — бот отключился. Всё гениально просто.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Next.js 14](https://img.shields.io/badge/Next.js-14%20App%20Router-black)](https://nextjs.org)
[![Edge Runtime](https://img.shields.io/badge/Runtime-Edge-brightgreen)](#-как-запустить-на-tatnet)
[![Gitverse](https://img.shields.io/badge/mirror-Gitverse.ru-orange)](https://gitverse.ru)

---

## ✨ Возможности

| Модуль | Описание |
|---|---|
| 🧠 **Browser RakNet Core** | Полный handshake `Connection Request (0x00) → Connection Accepted (0x01)` для SA-MP 0.3.7 / CRMP 0.3e |
| 📡 **Keep-Alive** | Авто-ответ на `RPC_Ping`, `RPC_AcknowledgeTicks`, `NEW_INCOMING_PING`; heartbeat каждые 5 секунд |
| 🎥 **Anti-AFK** | Рандомное «движение камеры» + WASD-подобные события раз в N минут (настраивается в UI) |
| 🔁 **Auto-Reconnect** | Экспоненциальный backoff при обрыве: 1s → 2s → 4s → … → 60s |
| 🌍 **Edge Proxy** | WebTransport (HTTP/3 datagrams) с fallback на UDP-over-WebSocket; живёт на Edge Runtime |
| 💾 **No-Auth Storage** | Настройки в `localStorage` + `IndexedDB`. Никаких аккаунтов и баз данных |
| 🖥️ **Dark Mode UI** | Минималистичная консоль в стиле админ-чата FR_: статус-индикатор, real-time логи, RTT ping |

## 🚫 Главные ограничения (прочитайте до использования!)

1. **TAB-LIFETIME**: бот живёт **только пока открыта вкладка браузера**. При закрытии или сворачивании в фоне (visibilitychange) соединение гарантированно рвётся — это осознанное поведение, а не баг.
2. **Никаких нативных сокетов в браузере**. Весь UDP-трафик RakNet идёт через ваш собственный Edge-прокси (`edge/proxy.ts`). Браузер физически не умеет отправлять UDP — это компенсирует прокладку на Edge-платформе.
3. Прокси ограничивает целевые порты whitelist'ом SA-MP/CRMP (`7777, 3694, 8192, 7778`) и выдаёт **не более 5 одновременных сессий на IP** (DDoS-защита).
4. Использование бота на серверах может нарушать их правила. Целевой сервер по умолчанию — `188.127.241.74:3694` (Black Russia copy). **Ответственность за бан — только ваша.**

## 🚀 Быстрый старт (локально)

```bash
git clone https://github.com/fun-rakbot/fun-rakbot-web.git
cd fun-rakbot-web
npm install
npm run dev
# → http://localhost:3000 → нажмите Start
```

## 🌐 Как запустить на Tatnet

Tatnet (Татнет) выполняет Next.js 14 приложения на Edge Runtime — идеально для нашего прокси:

1. Зарегистрируйте аккаунт и создайте приложение типа **Node.js / Next.js**.
2. Свяжите репозиторий с **Gitverse.ru** (нативная интеграция) или загрузите архив.
3. В настройках приложения укажите:
   - Build command: `npm run build`
   - Output: `standalone` (добавьте `output: 'standalone'` в `next.config.js`, если платформа требует)
4. Добавьте переменные окружения:
   ```
   MAX_SESSIONS_PER_IP=5
   ```
5. Деплой. Файл `vercel.json` совместим с Tatnet-конвейером (edge-функции объявлены в `functions`).
6. Откройте выданный HTTPS-домен — WebTransport потребует HTTP/3 (QUIC); если Tatnet его не отдаёт, клиент **автоматически переключится на WebSocket-fallback** — бот заработает всё равно.

### Деплой на Layer0

```bash
npm i -g @layer0/cli
layer0 init            # подхватит layer0.config.js из корня репо
layer0 deploy
```

Layer0 запускает edge-функции на Node-runtime → `edge/proxy.ts` получает `node:dgram` и полноценный UDP-проброс + WebSocket upgrade из коробки.

### Деплой на Onreza

Onreza использует тот же `vercel.json` / App Router формат:

```bash
onreza deploy --prod
```

Если среда Onreza не даёт `dgram` в edge, включается **HTTP-relay режим**: укажите `RABBIT_RELAY_URL` — внутренний relay провайдера, который держит UDP-сокеты (см. `docs/DEPLOY.md`).

## ⚙️ Настройка Anti-AFK

В интерфейсе (поле **Anti-AFK Interval (min)**):

| Параметр | Диапазон | Рекомендация |
|---|---|---|
| Интервал активности | 1–60 мин | **3 минуты** — баланс между детектом серверных скриптов и нагрузкой |
| Heartbeat (служебный) | фиксирован, 5 сек | менять не нужно — отвечает на `RPC_Ping`/`AcknowledgeTicks` |
| Auto-Reconnect | in/out | оставьте включённым; backoff защищает сервер от флуда |

Каждый «анти-АФК тик» отправляет `RPC_HeadMove` со случайным yaw ±15° и pitch ±5° — имитация движения мыши игрока, плюс WASD-подобное событие синхронизации.

## 🏗 Архитектура

```
┌─────────────── Browser Tab ───────────────┐        ┌──────── Edge Platform ────────┐
│  app/ (Next.js UI, dark console)          │        │  edge/proxy.ts (Edge Function)│
│  lib/raknet/client.ts  ← ядро бота        │  WT/WS │   WS upgrade → node:dgram     │
│  lib/raknet/handshake.ts ← пакеты RakNet  │◄──────►│   bind → UDP socket per tab   │
│  lib/raknet/transport.ts                  │binary  │   лимит 5 сессий / IP         │
│  localStorage / IndexedDB (настройки)     │frames  │   TTL мёртвых сессий: 90 c    │
└───────────────────────────────────────────┘        └───────────────┬───────────────┘
                                                                     │ UDP
                                                          SA-MP/CRMP сервер
                                                       188.127.241.74:3694
```

Структура репозитория:

```
/app              Next.js UI (App Router)
/components       BotConsole, SettingsPanel, EventLog
/lib/raknet       constants · bitstream · handshake · transport · client
/edge             proxy.ts — Edge Function (WebTransport/WS ↔ UDP)
/docs             DEPLOY.md · PROTOCOL.md · LIMITATIONS.md
vercel.json       конфиг Tatnet/Onreza/Vercel-compatible
layer0.config.js  конфиг Layer0
```

## 🔄 Публикация на Gitverse + GitHub одновременно

```bash
git remote add github  https://github.com/<you>/fun-rakbot-web.git
git remote add gitverse https://gitverse.ru/<you>/fun-rakbot-web.git
git push github main && git push gitverse main
# или автоматически через CI (см. docs/DEPLOY.md — action с двумя remote'ами)
```

## 🧪 Тесты протокола

```bash
npx tsx lib/raknet/selftest.ts
```

Проверяет побайтовую корректность `Connection Request`, reliable-фрейма и InGame RPC-обёртки.

## 📜 Лицензия

[MIT](./LICENSE) — используйте, модифицируйте, публикуйте свободно.

## 🤝 Вклад

Прочитайте [CONTRIBUTING.md](./CONTRIBUTING.md) перед PR. Комментарии в коде — на русском языке (стандарт проекта).

---

*Сделано комьюнити FR_. Не является официальным продуктом SA-MP / open.mp / CRMP.*
