/**
 * FUN RAKBOT WEB — selftest побайтовой корректности пакетов RakNet.
 * Запуск: npx tsx lib/raknet/selftest.ts
 * Работает в Node 18+ (crypto/btoa/atob глобальны начиная с Node 16/19).
 */

import { newSession, buildConnectionRequest, wrapReliable, buildInGameRpc } from './handshake';
import { MsgId } from './constants';

let failed = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) failed++;
}

// 1) Connection Request
const s = newSession();
const req = buildConnectionRequest(s);
check('id = 0x00', req[0] === MsgId.CONNECTION_OPEN_REQUEST);
check('magic 00 0F FF 7F', req[1] === 0x00 && req[2] === 0x0f && req[3] === 0xff && req[4] === 0x7f);
check('raknet1 в байте 5..12', String.fromCharCode(req[5], req[6], req[7]) === 'rak');
check('длина ≥ 32 (guid+mtu)', req.length >= 32);

// 2) Reliable frame
const before = s.sendSeq;
const frame = wrapReliable(s, new Uint8Array([0xAA, 0xBB]), 512);
check('frame flag 0x14', frame[0] === 0x14);
check('seq little-endian', frame[1] === (before & 0xff) && frame[2] === ((before >> 8) & 0xff));
check('payload в конце', frame[frame.length - 2] === 0xaa && frame[frame.length - 1] === 0xbb);
check('sendSeq инкрементирован', s.sendSeq === before + 1);

// 3) InGame RPC wrapper
const pkt = buildInGameRpc(0x010203, 53, new Uint8Array([0x01]));
check("'S' маркер", pkt[0] === MsgId.IN_GAME);
check('playerID big-endian', pkt[1] === 0x01 && pkt[2] === 0x02 && pkt[3] === 0x03);
check('rpc size BE = 3 (2 id + 1 body)', pkt[5] === 0x00 && pkt[6] === 0x03);
check('call id LE = 53', pkt[7] === 53 && pkt[8] === 0x00);

console.log(failed === 0 ? '\nSELFTEST PASSED' : `\nSELFTEST FAILED (${failed})`);
process.exit(failed === 0 ? 0 : 1);
