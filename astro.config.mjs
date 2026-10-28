// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE_ORIGIN } from './src/lib/site.ts';

/**
 * 梦澄博客 · Astro 配置
 *
 * 部署目标：GitHub Pages + 自定义域名 https://blog.yumesumi.cyou
 *   - 域名挂在仓库根路径，base 必须是 '/'；不要再使用 /Yumesumi-Blog 前缀
 *   - 发布方式：npm run deploy 把 dist/ 推到 gh-pages 分支（不使用 Actions）
 *   - 发布分支根目录必须包含 CNAME（public/CNAME，部署脚本会检查）
 */
export default defineConfig({
  site: SITE_ORIGIN,
  base: '/',

  output: 'static',
  trailingSlash: 'always',

  build: {
    inlineStylesheets: 'auto',
  },

  devToolbar: {
    enabled: false,
  },

  integrations: [sitemap()],

  markdown: {
    // 纯深色站点，只用一套 Shiki 主题，避免双主题变量与切换逻辑。
    shikiConfig: {
      theme: 'github-dark-dimmed',
    },
  },
});
