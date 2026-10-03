// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // 站点地址。使用自定义域名（yumesumi.cyou），站点挂在域名根路径。
  site: 'https://yumesumi.cyou',

  // 注意：这里刻意不设置 `base`。
  // 自定义域名部署时 GitHub Pages 会把站点挂在根路径，一旦误设
  // base: '/Yumesumi-Blog'，所有站内链接都会变成 /Yumesumi-Blog/... 导致全站 404。

  // 纯静态输出
  output: 'static',

  integrations: [sitemap()],

  markdown: {
    // Shiki 双主题：分别输出 light / dark 两套 CSS 变量，
    // 由 src/styles/shiki.css 按当前主题切换。
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark-dimmed',
      },
    },
  },
});
