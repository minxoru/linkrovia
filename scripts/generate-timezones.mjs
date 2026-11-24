import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2];
if (!source)
  throw new Error(
    'Pass the directory containing zone.tab and version from IANA tzdata.',
  );

const tzdb = readFileSync(join(source, 'version'), 'utf8').trim();
const entries = readFileSync(join(source, 'zone.tab'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split('\t')[2]);

const zones = ['UTC', ...new Set(entries.sort())];
writeFileSync(
  new URL('../src/lib/timezone/timezones.json', import.meta.url),
  JSON.stringify({ tzdb, zones }, null, 2) + '\n',
);
