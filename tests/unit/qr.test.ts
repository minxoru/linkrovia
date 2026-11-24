import { describe, expect, it } from 'vitest';
import { qrUrl, qrSvg, qrPng, qrFilename } from '../../src/lib/server/links/qr';

describe('QR images', () => {
  it('uses the registered host and preserves a matching loopback origin', () => {
    expect(
      qrUrl('links.example', 'abc', new URL('http://localhost:5173')),
    ).toBe('https://links.example/q/abc');
    expect(qrUrl('localhost', 'abc', new URL('http://localhost:5173'))).toBe(
      'http://localhost:5173/q/abc',
    );
  });
  it('generates bounded safe SVG and real PNG', async () => {
    const svg = qrSvg('https://links.example/q/abc');
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('https://links.example');
    const png = await qrPng('https://links.example/q/abc');
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new DataView(png.buffer).getUint32(16)).toBeLessThanOrEqual(1024);
  });
  it('sanitizes filenames', () => {
    expect(qrFilename('../danger <name>')).toBe('danger-name');
  });
});

it('renders PNG modules with a four-module white border and valid chunk checksums', async () => {
  const { inflateSync } = await import('node:zlib');
  const { default: qrcode } = await import('qrcode-generator');
  const value = 'https://links.example/q/' + 'a'.repeat(64);
  const bytes = await qrPng(value);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let compressed = new Uint8Array();
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    if (
      new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8)) ===
      'IDAT'
    )
      compressed = bytes.slice(offset + 8, offset + 8 + length);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(offset + 4, offset + 8 + length)) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    expect((crc ^ 0xffffffff) >>> 0).toBe(view.getUint32(offset + 8 + length));
    offset += length + 12;
  }
  expect(offset).toBe(bytes.length);
  const data = inflateSync(compressed);
  const width = view.getUint32(16);
  const qr = qrcode(0, 'M');
  qr.addData(value, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  expect(width).toBe((count + 8) * 8);
  for (let y = 0; y < count + 8; y++) {
    for (let x = 0; x < count + 8; x++) {
      const dark =
        x >= 4 &&
        y >= 4 &&
        x < count + 4 &&
        y < count + 4 &&
        qr.isDark(y - 4, x - 4);
      expect(data[(y * 8 + 4) * (width + 1) + x * 8 + 5]).toBe(dark ? 0 : 255);
    }
  }
});
