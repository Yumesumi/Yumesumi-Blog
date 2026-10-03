import type { APIRoute } from 'astro';

/**
 * 动态生成 robots.txt。
 * 用 .ts 而不是放在 public/ 里的原因：sitemap 地址要手写域名的话，
 * 换域名就得改两个文件。这里从 astro.config 的 site 派生，改一处即可。
 */
export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://yumesumi.cyou');
  const sitemapUrl = new URL('/sitemap-index.xml', base).href;

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
