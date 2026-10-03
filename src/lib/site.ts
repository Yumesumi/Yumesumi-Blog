/**
 * 站点级常量与 URL 工具。
 *
 * 域名、站名、默认分享图这些值在多个页面和布局里都要用，
 * 集中在这里定义，避免各处硬编码后不一致（尤其 og:image ——
 * 之前 BaseLayout 指向的占位图文件并不存在，分享时预览图会裂）。
 */

/** 站点主域名，与 astro.config.mjs 的 site 一致。 */
export const SITE_ORIGIN = 'https://yumesumi.cyou';

export const SITE_NAME = '梦澄博客';

export const SITE_DESCRIPTION = '梦澄的个人博客，记录技术笔记、阅读与思考。';

/** 默认分享图（1200×630，Open Graph 推荐尺寸）。 */
export const DEFAULT_OG_IMAGE = '/og-default.svg';

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

/** 默认分享图完整 URL。 */
export const defaultOgImage = DEFAULT_OG_IMAGE;

/**
 * 文章的分享图 URL。
 *
 * 优先用文章自己的封面图（与 index.md 同级的 cover.*），
 * 没有则回退到站点默认图。构建后由 relative-base 插件
 * 把 HTML 里的站内绝对路径改写为相对路径，此处只负责拼原始值。
 */
export function postOgImage(coverPath?: string): string {
  return coverPath ?? DEFAULT_OG_IMAGE;
}
