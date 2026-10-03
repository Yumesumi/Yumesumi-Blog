import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * 博客文章集合
 *
 * 目录结构：每篇文章一个文件夹，正文固定为 index.md，配图与正文同级。
 *   src/content/blog/hello-world/index.md
 *   src/content/blog/hello-world/cover.svg
 *
 * 正文里用相对路径引用配图：![](./cover.svg)
 */
const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    // 只匹配 index.md，这样同目录的 cover.svg 不会被当成独立文章条目
    pattern: '**/index.md',
    /**
     * glob loader 默认不会像文件路由那样把 index 折叠成父目录名，
     * 不覆盖的话 id 会变成 "hello-world/index"，URL 变成 /blog/hello-world/index/。
     * 这里显式剥掉 /index 后缀。
     * 第一行的反斜杠替换是 Windows 路径分隔符归一化，必写。
     */
    generateId: ({ entry }) => {
      const normalized = entry
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/index\.md$/, '');
      return normalized || 'index';
    },
  }),
  schema: z.object({
    title: z.string(),
    // 用 coerce 把 YAML 里的 2026-10-03 转成 Date 对象，否则排序会按字符串比较
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    // 草稿：首页列表不显示
    draft: z.boolean().default(false),
    // 置顶：列表中排在最前
    pinned: z.boolean().default(false),
  }),
});

/**
 * 独立页面集合（关于页等）。
 * 单独放一个集合，这样改关于页只需编辑 Markdown，不会混进文章列表。
 */
const pages = defineCollection({
  loader: glob({
    base: './src/content/pages',
    pattern: '**/*.md',
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { blog, pages };
