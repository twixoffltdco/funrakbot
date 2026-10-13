/**
 * FUN RAKBOT WEB — API-роут Next.js (App Router), пробрасывающий запрос
 * в Edge Function прокси (edge/proxy.ts). Runtime: edge — совместимо с
 * Tatnet / Layer0 / Onreza без Node-зависимостей на уровне роутера.
 *
 * Сами UDP-сокины живут в edge/proxy.ts; здесь — только перенаправление
 * WebSocket upgrade и HTTP-relay трафика.
 */

export const runtime = 'edge';

// Импорт общей логики прокси: на платформах, где Next не даёт экспортировать
// handler напрямую, используется ре-экспорт по умолчанию из ../../edge/proxy.
import proxyHandler from '../../edge/proxy';

type EdgeCtx = { waitUntil?: (p: Promise<unknown>) => void; ws?: unknown };

/** GET — информационный ответ (браузер проверяет доступность прокси). */
export async function GET(req: Request, ctx: EdgeCtx): Promise<Response> {
  const r = await (proxyHandler as unknown as (req: Request, ctx: EdgeCtx) => Promise<Response | undefined>)(req, ctx);
  return r ?? new Response('proxy ok', { status: 200 });
}

/** POST — HTTP-relay режим (base64 датаграммы через JSON). */
export async function POST(req: Request, ctx: EdgeCtx): Promise<Response> {
  const r = await (proxyHandler as unknown as (req: Request, ctx: EdgeCtx) => Promise<Response | undefined>)(req, ctx);
  return r ?? new Response('no handler', { status: 500 });
}
