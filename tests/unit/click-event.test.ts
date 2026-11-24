import { describe, expect, it } from 'vitest';
import { clickDataPoint } from '../../src/lib/server/analytics/click-event';
import { getVisitorContext } from '../../src/lib/server/targeting';

describe('click data point', () => {
  it('records only the approved dimensions in their fixed column order', () => {
    const request = new Request(
      'https://go.example.com/q/private-token?cl_ref=opaque',
      {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          referer:
            'https://news.example.com:8443/private/path?account=secret#private',
          'cf-connecting-ip': '192.0.2.10',
        },
      },
    );
    expect(
      clickDataPoint({
        linkId: 'link-id',
        domainId: 'domain-id',
        matchedRuleId: 'rule-id',
        source: 'qr',
        referrer: request.headers.get('referer'),
        visitor: getVisitorContext(request, {
          country: 'jp',
          regionCode: '13',
        }),
      }),
    ).toEqual({
      indexes: ['link-id'],
      blobs: [
        'domain-id',
        'JP',
        'JP-13',
        'news.example.com',
        'desktop',
        'windows',
        'chrome',
        'rule-id',
        'qr',
        'human',
        'none',
      ],
      doubles: [1],
    });
  });

  it.each([
    'http://127.0.0.1/private',
    'http://192.0.2.10/private',
    'http://[2001:db8::1]/private',
    'ftp://news.example.com/private',
    '/private',
  ])(
    'omits unsupported referrer %s and arbitrary browser names',
    (referrer) => {
      const request = new Request('https://go.example.com/link', {
        headers: { 'user-agent': 'PrivateAgent/3.2.1 (custom)' },
      });
      expect(
        clickDataPoint({
          linkId: 'link-id',
          domainId: 'domain-id',
          matchedRuleId: null,
          source: 'link',
          referrer,
          visitor: getVisitorContext(request),
        }),
      ).toMatchObject({
        blobs: [
          'domain-id',
          'XX',
          'unknown',
          'unknown',
          'other',
          'other',
          'unknown',
          'default',
          'link',
          'unknown',
          'none',
        ],
      });
    },
  );
});
