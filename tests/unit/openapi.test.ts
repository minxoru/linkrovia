import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const apiRoot = join(root, 'src/routes/api/v1');
const document = readFileSync(join(root, 'static/openapi.yaml'), 'utf8');

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === '+server.ts' ? [path] : [];
  });
}

function routePath(file: string): string {
  const route = relative(apiRoot, file)
    .replace(/\\/g, '/')
    .replace('/+server.ts', '');
  return `/${route.replace(/\[([^\]]+)\]/g, '{$1}')}`;
}

describe('public OpenAPI contract', () => {
  it('covers every implemented v1 method without inventing a route', () => {
    const files = routeFiles(apiRoot);
    const implementedPaths = new Set(files.map(routePath));
    const documentedPaths = new Set(
      [...document.matchAll(/^  (\/[^:]+):\s*$/gm)].map((match) => match[1]),
    );
    expect(documentedPaths).toEqual(implementedPaths);
    for (const file of files) {
      const path = routePath(file);
      const source = readFileSync(file, 'utf8');
      const pathStart = document.indexOf(`  ${path}:`);
      expect(pathStart, `OpenAPI is missing ${path}`).toBeGreaterThanOrEqual(0);
      const nextPath = document.indexOf('\n  /', pathStart + 1);
      const operationBlock = document.slice(
        pathStart,
        nextPath < 0 ? document.length : nextPath,
      );
      for (const method of source.matchAll(
        /export const (GET|POST|PUT|PATCH|DELETE)\b/g,
      )) {
        expect(
          operationBlock,
          `OpenAPI is missing ${method[1]} ${path}`,
        ).toContain(`    ${method[1].toLowerCase()}:`);
      }
    }
  });

  it('declares the public security and error contract', () => {
    expect(document).toContain('openapi: 3.1.0');
    expect(document).toContain('bearerAuth:');
    expect(document).toContain('ownerCookie:');
    expect(document).toContain('X-CSRF-Token');
    expect(document).toContain('application/problem+json');
  });
});
