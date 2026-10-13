# Вклад в FUN RAKBOT WEB

Спасибо, что хотите улучшить проект! Ниже — правила, которые сохраняют
кодовую базу читаемой и предсказуемой.

## Правила проекта

1. **Комментарии в коде — на русском языке.** Это открытый стандарт репозитория:
   любой русскоязычный SA-MP/CRMP разработчик должен понимать логику протокола.
2. **Никаких VPS/Docker-зависимостей в основном стеке.** Проект принципиально
   NO-VPS: весь сетевой слой живёт на Edge-платформах (Tatnet / Layer0 / Onreza).
   Эксперименты с нативными сокетами допускаются только в `/docs/experiments`.
3. **TAB-LIFETIME неприкосновенен.** Бот обязан умирать при закрытии вкладки.
   PR, добавляющие service worker'ы или фоновые keep-alive вне вкладки — rejected.
4. **MIT-лицензия.** Весь вклад распространяется под MIT автоматически.

## Процесс

```bash
git checkout -b feature/my-improvement
# ... коммиты с понятными сообщениями (feat|fix|docs|refactor): описание ...
npm run build && npx tsx lib/raknet/selftest.ts   # обязательная проверка
git push origin feature/my-improvement            # GitHub
git push gitverse feature/my-improvement          # Gitverse.ru (зеркало)
```

Далее открывайте Pull Request (или Merge Request на Gitverse) в `main`
с описанием **что** и **почему**. Один PR = одна логическая изменение.

## Структура для новичков

| Путь | Назначение |
|---|---|
| `lib/raknet/constants.ts` | ID сообщений и RPC — начинайте здесь |
| `lib/raknet/handshake.ts` | Кодирование пакетов (чистые функции, легко тестировать) |
| `lib/raknet/client.ts` | Ядро: циклы keep-alive / anti-AFK / backoff |
| `edge/proxy.ts` | Edge Function WS↔UDP + лимиты |
| `components/` | UI (Next.js App Router, 'use client') |

## Стиль кода

- TypeScript strict, без `any` кроме boundary-слоёв WebTransport API.
- Prettier-совместимое форматирование, 2 пробела, одинарные кавычки.
- Никаких внешних рантайм-зависимостей кроме Next/React — размер бандла важен.

## Вопросы безопасности

Уязвимости прокси (обход whitelist портов, превышение лимита сессий) —
пишите приватно, не в публичный issue.
