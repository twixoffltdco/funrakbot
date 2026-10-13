/**
 * FUN RAKBOT WEB — конфигурация Layer0 (ex-Delta).
 * Layer0 выполняет Edge Functions на Node-runtime → прокси (edge/proxy.ts)
 * получает доступ к dgram для UDP-проброса к SA-MP серверу.
 *
 * Документация: https://docs.layer0.co
 */
const { config, edge } = require('@layer0/core/config');

module.exports = config({
  // Все не-CSS/JS пути отдаём через Next.js; /api/proxy — через Edge Function
  routes: [
    edge('/api/proxy'),
  ],

  // Настройки edge-функции прокси
  featureFlags: {
    'layer0_takeover_apis': false, // API остаётся на Layer0 edge, не takeover
  },

  // ENV для edge-среды (секреты через layer0 secrets set ...)
  env: {
    production: {
      MAX_SESSIONS_PER_IP: '5',
    },
  },

  buildCommand: 'npm run build',
});
