const localSuffixes = new Set([
  'arpa',
  'corp',
  'example',
  'home',
  'internal',
  'invalid',
  'lan',
  'linklocal',
  'local',
  'localdomain',
  'localhost',
  'onion',
  'test',
]);
const loopbackHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);

function removeRootDot(hostname: string) {
  return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
}

function isPublicHostname(hostname: string) {
  if (hostname.length > 253) return false;
  const labels = hostname.split('.');
  const extension = labels.at(-1) ?? '';
  return (
    labels.length >= 2 &&
    /[a-z]/.test(extension) &&
    !localSuffixes.has(extension) &&
    labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  );
}

function parseAuthority(value: string) {
  const authority =
    /^(\[[a-f0-9:.]+\]|[^:%/?#@\\\s]+)(?::([0-9]{1,5}))?$/i.exec(value);
  if (!authority) return null;
  const [, hostname, port] = authority;
  if (port !== undefined && (Number(port) === 0 || Number(port) > 65535))
    return null;
  return hostname;
}

/**
 * Normalize an authority from a trusted request URL or an administrator.
 * The result must still be matched against an active domain before use.
 */
export function normalizeHostname(
  value: unknown,
  { allowLoopback = false } = {},
): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 1024 ||
    /[\x00-\x20\x7f]/.test(value)
  )
    return null;
  const authority = parseAuthority(value);
  if (!authority) return null;
  try {
    const hostname = removeRootDot(new URL(`https://${value}`).hostname);
    if (
      allowLoopback &&
      loopbackHostnames.has(removeRootDot(authority.toLowerCase()))
    )
      return hostname;
    return isPublicHostname(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

/** Validate a browser redirect destination, without resolving or fetching it. */
export function parseDestinationUrl(value: unknown): URL | null {
  if (
    typeof value !== 'string' ||
    value.length > 8192 ||
    /[\x00-\x20\x7f\\]/.test(value)
  )
    return null;
  const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority || !parseAuthority(authority)) return null;
  try {
    const url = new URL(value);
    const hostname = removeRootDot(url.hostname);
    if (url.username || url.password || !isPublicHostname(hostname))
      return null;
    url.hostname = hostname;
    return url;
  } catch {
    return null;
  }
}
