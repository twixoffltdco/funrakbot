/**
 * FUN RAKBOT WEB — низкоуровневые помощники для чтения/записи байтов RakNet.
 * RakNet использует little-endian порядок байт (как и x86), реализация на DataView.
 */

/** Создаёт новый растущий буфер-писатель (аналог Stream::Write). */
export class ByteWriter {
  private buf: number[] = [];

  u8(v: number): this { this.buf.push(v & 0xff); return this; }

  /** Запись 16-битного значения (little-endian). */
  u16(v: number): this {
    this.u8(v & 0xff); this.u8((v >> 8) & 0xff); return this;
  }

  /** Запись 32-битного значения с плавающей точкой (little-endian). */
  f32(v: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    return this.raw(b);
  }

  /** Запись 32-битного значения (little-endian). */
  u32(v: number): this {
    for (let i = 0; i < 4; i++) this.u8((v >>> (i * 8)) & 0xff);
    return this;
  }

  /** Запись 64-битного значения двумя половинками (little-endian). */
  u64(lo: number, hi: number): this { this.u32(lo); this.u32(hi); return this; }

  /** Запись строки фиксированной длины с нулевым заполнением. */
  str(s: string, fixedLen?: number): this {
    const enc = new TextEncoder().encode(s);
    if (fixedLen === undefined) {
      this.u32(enc.length); // RakNet Write(SYSTEMSTRING) — длина + байты
    }
    const len = fixedLen ?? enc.length;
    for (let i = 0; i < len; i++) this.u8(i < enc.length ? enc[i] : 0);
    return this;
  }

  raw(bytes: ArrayLike<number>): this {
    for (let i = 0; i < bytes.length; i++) this.u8(bytes[i]);
    return this;
  }

  bool(v: boolean): this { return this.u8(v ? 1 : 0); }

  /** 4 байта «магического» идентификатора протокола SA-MP. */
  magic(): this { return this.raw([0x00, 0x0f, 0xff, 0x7f]); }

  /** 16-байтный GUID клиента (рандомный, генерируется один раз за сессию). */
  guid(g: Uint8Array): this { return this.raw(g); }

  toArray(): Uint8Array { return new Uint8Array(this.buf); }
}

/** Курсор-читатель поверх Uint8Array (аналог Stream::Read). */
export class ByteReader {
  private pos = 0;
  constructor(private dv: DataView) {}

  static from(u8: Uint8Array): ByteReader {
    return new ByteReader(new DataView(u8.buffer, u8.byteOffset, u8.byteLength));
  }

  get offset(): number { return this.pos; }
  get remaining(): number { return this.dv.byteLength - this.pos; }

  u8(): number { const v = this.dv.getUint8(this.pos); this.pos += 1; return v; }
  u16(): number { const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  u32(): number { const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  f32(): number { const v = this.dv.getFloat32(this.pos, true); this.pos += 4; return v; }

  /** Чтение 64-битного числа как пары [lo, hi]. */
  u64(): [number, number] { const lo = this.u32(); const hi = this.u32(); return [lo, hi]; }

  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.u8();
    return out;
  }

  /** Чтение строки фиксированной длины (handshake SA-MP). */
  fixedStr(n: number): string {
    return new TextDecoder().decode(this.bytes(n)).replace(/\0.*$/s, '');
  }

  /** Чтение SYSTEMSTRING (u32 длина + байты). */
  str(): string {
    const len = this.u32();
    return new TextDecoder().decode(this.bytes(len));
  }

  bool(): boolean { return this.u8() !== 0; }

  /** Пропуск 4-байтного «магического» идентификатора протокола. */
  magic(): void {
    const a = this.u8(), b = this.u8(), c = this.u8(), d = this.u8();
    if (!(a === 0x00 && b === 0x0f && c === 0xff && d === 0x7f)) {
      throw new Error('битый magic RakNet (ожидалось 00 0F FF 7F)');
    }
  }
}

/** Генерация случайного 16-байтного GUID клиента. */
export function randomGuid(): Uint8Array {
  const g = new Uint8Array(16);
  crypto.getRandomValues(g);
  return g;
}

/** Упаковка массива байт в base64 (для передачи через WebSocket-прокси). */
export function toB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

/** Обратная распаковка base64 → Uint8Array. */
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
