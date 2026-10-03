// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { relativeBase } from './src/plugins/relative-base.ts';

/**
 * 站点地址与 base 前缀
 *
 * 背景：这个仓库叫 `Yumesumi-Blog`，不是 `Yumesumi.github.io` 形式。
 * 在自定义域名 yumesumi.cyou 生效**之前**，GitHub Pages 会把站点挂在
 * `https://yumesumi.github.io/Yumesumi-Blog/` 这个子路径下；域名生效后，
 * 站点会移到根路径 `https://yumesumi.cyou/`。
 *
 * 两种情况需要的前缀不同：
 *   - 子路径：资源必须是 /Yumesumi-Blog/_astro/xxx.css
 *   - 根路径：资源必须是 /_astro/xxx.css
 *
 * Astro 的 base 只能二选一，写死任何一个都会让另一个地址样式全失。
 * 解法：构建时用子路径前缀（让 Astro 正确生成资源引用），
 * 构建结束后再由 relativeBase 插件把绝对路径改写为文档相对路径。
 * 浏览器按当前页面地址逐级解析，于是两个地址同时可用。
 */
export default defineConfig({
  site: 'https://yumesumi.cyou',

  // ★ 必须是字面量字符串：Astro 读取配置时做静态分析，
  //   写成变量表达式会拿到 undefined，导致资源路径不带前缀。
  base: '/Yumesumi-Blog',

  output: 'static',

  // 搜索索引用 src/pages/search-index.json.ts 这个 endpoint 生成，
  // 不用插件 —— 插件在 build:done 阶段拿不到 astro:content 虚拟模块。
  integrations: [sitemap(), relativeBase()],

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
