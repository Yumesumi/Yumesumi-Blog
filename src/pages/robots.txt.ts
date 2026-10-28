import type { APIRoute } from 'astro';
import { SITE_ORIGIN } from '@/lib/site';

/**
 * 动态生成 robots.txt。
 * Sitemap 地址从 astro.config 的 site 派生，换域名时只需改 site.ts 一处。
 */
export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL(SITE_ORIGIN);
  const sitemapUrl = new URL('/sitemap-index.xml', origin).href;

  const body = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
