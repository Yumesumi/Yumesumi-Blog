/**
 * 站点级常量。
 *
 * 这里是所有对外可见的站点信息的唯一来源：域名、站名、描述、
 * 联系方式与默认分享图。astro.config.mjs 也从这里读取域名，
 * 改域名时只需改 {@link SITE_ORIGIN} 一处。
 */

/** 站点主域名（与 astro.config.mjs 的 site 一致）。 */
export const SITE_ORIGIN = 'https://blog.yumesumi.cyou';

/** 梦澄中心，博客的上一级门户。 */
export const CENTER_URL = 'https://yumesumi.cyou/';
export const CENTER_NAME = '梦澄中心';

export const SITE_NAME = '梦澄博客';
export const SITE_WORDMARK = 'YUMESUMI BLOG';
export const SITE_TAGLINE = '记录 · 思考 · 分享';
export const SITE_DESCRIPTION = '梦澄的个人博客，记录技术笔记、阅读与思考。';

export const SITE_AUTHOR = 'Yumesumi';
export const SITE_EMAIL = 'YumesumiArikki@outlook.com';
export const SITE_GITHUB = 'https://github.com/Yumesumi/Yumesumi-Blog';

/** 默认分享图（1200×630）。 */
export const DEFAULT_OG_IMAGE = '/og-default.png';

/**
 * 把站内绝对路径转成完整 URL。
 *
 * Open Graph、canonical、JSON-LD 都要求绝对地址，
 * 相对路径在社交平台和搜索引擎抓取时不会被正确解析。
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path, SITE_ORIGIN).href;
}
