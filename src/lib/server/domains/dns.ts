import { isIP } from 'node:net';
import { domainHostname } from './connection';

export type DnsResult =
  'public_dns' | 'dns_pending' | 'dns_unsafe' | 'dns_unavailable';

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 6) {
    // Exclude special-use and transition ranges. Public Cloudflare AAAA records are global unicast.
    return (
      /^[23][0-9a-f]{3}:/i.test(address) && !/^(2001|2002|3fff):/i.test(address)
    );
  }
  if (family !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(
    [0, 10, 127].includes(a) ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 &&
      (b === 168 ||
        (b === 0 && [0, 2].includes(c)) ||
        (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

async function queryAddresses(
  hostname: string,
  type: 'A' | 'AAAA',
  send: typeof fetch,
) {
  const endpoint = new URL('https://cloudflare-dns.com/dns-query');
  endpoint.search = new URLSearchParams({ name: hostname, type }).toString();
  const response = await send(endpoint, {
    headers: { accept: 'application/dns-json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('DNS response failed');
  const {
    Status,
    TC,
    Answer = [],
  } = (await response.json()) as {
    Status?: number;
    TC?: boolean;
    Answer?: { type: number; data: string }[];
  };
  if (TC || (Status !== 0 && Status !== 3) || !Array.isArray(Answer))
    throw new Error('DNS reply unavailable');
  return Answer.filter(({ type }) => type === 1 || type === 28).map(
    ({ data }) => data,
  );
}

export async function checkPublicDns(
  hostname: string,
  send: typeof fetch = fetch,
): Promise<DnsResult> {
  if (domainHostname(hostname) !== hostname) return 'dns_unsafe';
  try {
    const addresses = (
      await Promise.all([
        queryAddresses(hostname, 'A', send),
        queryAddresses(hostname, 'AAAA', send),
      ])
    ).flat();
    if (!addresses.length) return 'dns_pending';
    return addresses.every(
      (address) => typeof address === 'string' && isPublicAddress(address),
    )
      ? 'public_dns'
      : 'dns_unsafe';
  } catch {
    return 'dns_unavailable';
  }
}
