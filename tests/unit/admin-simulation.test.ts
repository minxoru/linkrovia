import { describe, expect, it } from 'vitest';
import { parseSimulationForm } from '../../src/routes/admin/links/[id]/simulate/form';

describe('admin rule simulator', () => {
  it('converts the supplied user agent and regional fields into the shared visitor input', () => {
    const result = parseSimulationForm(
      new URLSearchParams({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        country: 'jp',
        region: 'JP-13',
        language: 'ja',
      }),
    );

    expect(result).toMatchObject({
      input: {
        at: expect.any(Number),
        visitor: {
          os: 'ios',
          device: 'mobile',
          country: 'JP',
          region: 'JP-13',
          language: 'ja',
          trafficKind: 'unknown',
        },
      },
    });
  });

  it('defaults blank fields to unknown visitor metadata', () => {
    expect(parseSimulationForm(new URLSearchParams())).toMatchObject({
      input: {
        visitor: {
          os: 'other',
          device: 'other',
          country: 'unknown',
          region: 'unknown',
          language: 'unknown',
        },
      },
    });
  });

  it('returns invalid field names and retains the entered values', () => {
    const result = parseSimulationForm(
      new URLSearchParams({
        userAgent: '悪い形式',
        country: 'JP',
        region: 'US-CA',
        language: 'ja',
      }),
    );

    expect(result).toEqual({
      values: {
        userAgent: '悪い形式',
        country: 'JP',
        region: 'US-CA',
        language: 'ja',
      },
      invalidFields: ['userAgent', 'region'],
    });
  });
});
