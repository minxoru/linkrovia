const reservedSlugs = new Set([
  '_app',
  'admin',
  'api',
  'gate',
  'health',
  'login',
  'logout',
  'mcp',
  'q',
  'setup',
]);

const generatedSlugLength = 6;
const generatedAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const generatedAlphabetSize = generatedAlphabet.length;
// Reject the incomplete final bucket before taking a remainder. This keeps
// every alphanumeric character equally likely instead of introducing modulo bias.
const generatedRandomLimit =
  Math.floor(256 / generatedAlphabetSize) * generatedAlphabetSize;

export function isValidSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{3,64}$/.test(value) &&
    !reservedSlugs.has(value.toLowerCase())
  );
}

export function generateSlug(): string {
  let slug = '';
  while (slug.length < generatedSlugLength) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    for (const byte of bytes) {
      if (byte >= generatedRandomLimit) continue;
      slug += generatedAlphabet[byte % generatedAlphabetSize];
      if (slug.length === generatedSlugLength) break;
    }
  }
  return slug;
}
