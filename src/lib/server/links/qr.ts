import qrcode from 'qrcode-generator';

export function qrUrl(hostname: string, token: string, origin: URL) {
  const loopback = ['localhost', '127.0.0.1', '[::1]'];
  const base =
    loopback.includes(origin.hostname) && origin.hostname === hostname
      ? origin.origin
      : `https://${hostname}`;
  return `${base}/q/${encodeURIComponent(token)}`;
}

export function qrFilename(slug: string) {
  return (
    slug
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'link'
  );
}

function matrix(url: string) {
  // Hostnames and tokens are bounded; reject unexpected input before allocating an image.
  if (url.length > 512) throw new RangeError('QR URL is too long');
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  return qr;
}

export function qrSvg(url: string) {
  const qr = matrix(url);
  const count = qr.getModuleCount();
  const size = count + 8;
  let path = '';
  for (let y = 0; y < count; y++)
    for (let x = 0; x < count; x++) {
      if (qr.isDark(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#000" d="${path}"/></svg>`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(new TextEncoder().encode(type), 4);
  result.set(data, 8);
  view.setUint32(result.length - 4, crc32(result.subarray(4, -4)));
  return result;
}
export async function qrPng(url: string) {
  const qr = matrix(url);
  const count = qr.getModuleCount();
  const scale = 8;
  const size = (count + 8) * scale;
  const raw = new Uint8Array((size + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - 4;
      const col = Math.floor(x / scale) - 4;
      raw[y * (size + 1) + x + 1] =
        row >= 0 &&
        col >= 0 &&
        row < count &&
        col < count &&
        qr.isDark(row, col)
          ? 0
          : 255;
    }
  }
  const compressed = await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer();
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header[8] = 8;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(compressed)),
    chunk('IEND', new Uint8Array()),
  ];
  const output = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
