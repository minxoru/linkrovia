import { describe, expect, it } from 'vitest';
import { parseLinkPayload } from '../../src/lib/server/links/api-input';
import {
  applyUtmConfig,
  parseUtmConfig,
  parseUtmValues,
  previewUtm,
} from '../../src/lib/server/utm';
import { parseUtmTemplateInput } from '../../src/lib/server/utm/templates';

describe('UTM composition', () => {
  it('replaces duplicate campaign values and preserves unrelated encoding and fragments', () => {
    const destination =
      'https://example.org/landing?foo=%7e%20&amp=encoded%26data&%75tm_source=old&utm_source=older&foo=second#details';
    expect(
      previewUtm(destination, { source: '週刊 & More', utm_id: 'id=1' }),
    ).toEqual({
      before: destination,
      after:
        'https://example.org/landing?foo=%7e%20&amp=encoded%26data&utm_source=%E9%80%B1%E5%88%8A+%26+More&foo=second&utm_id=id%3D1#details',
    });
  });

  it('adds values without damaging a bare fragment or changing the input URL object', () => {
    const source = new URL('https://example.org/landing#details');
    const result = applyUtmConfig(
      source,
      '{"default":{"campaign":"Spring launch"}}',
      null,
    );
    expect(result.href).toBe(
      'https://example.org/landing?utm_campaign=Spring+launch#details',
    );
    expect(source.href).toBe('https://example.org/landing#details');
  });

  it('applies separate snapshots to fallback and explicitly selected rules', () => {
    const config = JSON.stringify({
      default: { source: 'Newsletter' },
      rules: { first: { content: 'Blue' } },
    });
    const destination = new URL(
      'https://example.org/info?utm_source=existing#offer',
    );
    expect(applyUtmConfig(destination, config, null).href).toBe(
      'https://example.org/info?utm_source=Newsletter#offer',
    );
    expect(applyUtmConfig(destination, config, 'first').href).toBe(
      'https://example.org/info?utm_source=existing&utm_content=Blue#offer',
    );
    expect(applyUtmConfig(destination, config, 'other-rule').href).toBe(
      destination.href,
    );
    expect(
      applyUtmConfig(destination, '{"default":{"redirect":"unsafe"}}', null)
        .href,
    ).toBe(destination.href);
  });

  it.each([
    { utm_custom: 'unsupported' },
    { source: 'x', utm_source: 'duplicate alias' },
    { source: ['not', 'a', 'string'] },
    { source: 'internal\ncontrol' },
    { source: 'a'.repeat(257) },
  ])('rejects invalid UTM names or values', (input) => {
    expect(parseUtmValues(input)).toBeNull();
  });

  it('does not interpret templates or visitor query settings in redirect snapshots', () => {
    expect(
      parseUtmConfig({ default: { source: 'demo' }, templateId: 'dynamic-id' }),
    ).toBeNull();
    expect(parseUtmConfig({ passthrough: ['secret'] })).toBeNull();
    expect(
      parseUtmConfig(
        JSON.parse('{"rules":{"__proto__":{"source":"unknown"}}}'),
      ),
    ).toBeNull();
    expect(
      previewUtm('https://localhost/?existing=1', { source: 'Mail' }),
    ).toBeNull();
  });
});

describe('UTM template inputs', () => {
  it('normalizes template metadata and snapshots configured values', () => {
    expect(
      parseUtmTemplateInput({
        name: ' Spring ',
        description: ' Owner email ',
        values: { source: 'Mail', medium: 'email' },
      }),
    ).toEqual({
      name: 'Spring',
      description: 'Owner email',
      values: { utm_source: 'Mail', utm_medium: 'email' },
    });
  });

  it('rejects empty templates and controls in metadata', () => {
    expect(parseUtmTemplateInput({ name: 'Campaign', values: {} })).toBeNull();
    expect(
      parseUtmTemplateInput({
        name: '\u0000Campaign',
        values: { source: 'Mail' },
      }),
    ).toBeNull();
  });
});

describe('link API UTM snapshots', () => {
  const current = {
    id: 'link-a',
    domainId: 'domain-a',
    hostname: 'go.example.org',
    slug: 'example',
    destinationUrl: 'https://example.org/landing?old=1#target',
    title: null,
    redirectType: 302 as const,
    isActive: true,
    startsAt: null,
    expiresAt: null,
    tags: [],
    createdAt: 1,
    updatedAt: 2,
    utmConfigJson: '{"default":{"utm_source":"previous"}}',
    protectionMode: 'none' as const,
    consumedAt: null,
  };

  it('canonicalizes explicit snapshots while leaving the destination unchanged', () => {
    const parsed = parseLinkPayload(
      {
        updatedAt: 2,
        utmConfig: { default: { source: 'newsletter' } },
      },
      current,
    );
    expect(parsed).toMatchObject({
      input: {
        destinationUrl: current.destinationUrl,
        utmConfigJson: '{"default":{"utm_source":"newsletter"}}',
      },
    });
  });

  it('clears only an explicit null and rejects non-snapshot configuration', () => {
    expect(parseLinkPayload({ updatedAt: 2 }, current)).not.toHaveProperty(
      'input.utmConfigJson',
    );
    expect(
      parseLinkPayload({ updatedAt: 2, utmConfig: null }, current),
    ).toHaveProperty('input.utmConfigJson', null);
    expect(
      parseLinkPayload(
        { updatedAt: 2, utmConfig: { templateId: 'template-a' } },
        current,
      ),
    ).toHaveProperty('fieldErrors.utmConfig');
  });
});
