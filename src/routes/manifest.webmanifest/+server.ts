import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { brand } from '$lib/brand';

export const GET: RequestHandler = () =>
  json(
    {
      name: brand.name,
      short_name: brand.name,
      description:
        'Open-source smart link management on your Cloudflare account.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#0D1729',
      theme_color: '#0D1729',
      icons: [
        { src: '/brand/icon-32.png', sizes: '32x32', type: 'image/png' },
        { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    {
      headers: {
        'cache-control': 'public, max-age=3600',
        'content-type': 'application/manifest+json',
      },
    },
  );
