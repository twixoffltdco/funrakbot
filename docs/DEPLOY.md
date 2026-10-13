# Деплой FUN RAKBOT WEB

## Tatnet (рекомендуемый путь)

1. Пушните репозиторий на **Gitverse.ru** (Tatnat нативно работает с Gitverse).
2. В панели Tatnet: *Создать приложение → из Git-репозитория* → выберите его.
3. Платформа сама подхватит `vercel.json` и Next.js 14 (App Router).
4. ENV-переменные в разделе «Настройки → Переменные»:
   - `MAX_SESSIONS_PER_IP` — лимит UDP-сессий на IP (по умолчанию 5);
   - `RABBIT_RELAY_URL` — только если edge-среда без `node:dgram` (HTTP-relay режим).
5. Деплой → HTTPS-домен. Для WebTransport нужен HTTP/3; при его отсутствии
   клиент автоматически падает на WebSocket-fallback (`wss://…/api/proxy`).

## Layer0

```bash
npm i -g @layer0/cli
layer0 init            # использует layer0.config.js
layer0 deploy          # production
layer0 dev             # локальная песочница edge-функций
```

Layer0 выполняет edge-функции на Node-runtime: `edge/proxy.ts` получает
`node:dgram` и WebSocket upgrade (`ctx.ws`) без дополнительных настроек.

## Onreza

```bash
onreza login
onreza deploy --prod
```

Формат конфигурации — Vercel-совместимый (`vercel.json`). Если в их edge-песочнице
запрещён `dgram`, включите HTTP-relay: платформа провайдера держит UDP-сокеты,
а функция только пересылает JSON `{ host, port, data(b64), session }`.

## Двойная публикация GitHub + Gitverse (CI)

`.github/workflows/mirror.yml`:

```yaml
name: mirror-to-gitverse
on: [push]
jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: |
          git remote add gitverse https://oauth2:${{ secrets.GITVERSE_TOKEN }}@gitverse.ru/USER/fun-rakbot-web.git
          git push gitverse main --force
```

## Ограничения платформ

| Платформа | WS upgrade в edge | node:dgram | WebTransport (HTTP/3) |
|---|---|---|---|
| Tatnet | ✅ | ✅ | ⚠️ зависит от тарифа |
| Layer0 | ✅ (ctx.ws) | ✅ | ❌ → fallback WS |
| Onreza | ⚠️ | ❌ → relay-режим | ❌ → fallback WS |

Бот остаётся работоспособным в любом сочетании: транспорт выбирается
автоически (см. `lib/raknet/transport.ts`).
