import { Buffer } from 'node:buffer';

export const encode = new TextEncoder();

export function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function randomHex(size: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', encode.encode(value)),
  );
}

export function uuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const time = Date.now();
  const fields = new DataView(bytes.buffer);
  fields.setUint32(0, Math.floor(time / 0x10000));
  fields.setUint16(4, time % 0x10000);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const id = hex(bytes);
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
