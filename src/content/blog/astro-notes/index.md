---
title: 这个博客是怎么搭起来的
description: 梦澄博客的技术选型和实现要点：为什么选 Astro、内容怎么存、怎么部署到 GitHub Pages。
tags: ['技术', '前端', 'Astro']
date: 2026-10-01
---

这个博客是纯静态站点，构建产物是一堆 HTML 文件，直接托管在 GitHub Pages 上，不需要服务器。

## 为什么选 Astro

写博客最核心的需求是：**以后想写文章，只需要新建一个 Markdown 文件，其他什么都不用管**。Astro 把这件事做得最彻底。

| 方案 | 写文章要做什么 | 长期维护成本 |
| --- | --- | --- |
| **Astro** | 建文件夹 + 写 `.md` | 极低，标签页/分页/高亮全自动化 |
| Vite + React | 写 `.md` 之外还要自己搭渲染管线 | 高，插件链要自己维护 |
| 传统博客生成器 | 写 `.md` + 配 YAML | 中，文章格式受模板约束 |

Astro 的内容集合（Content Collections）会在构建时校验每篇文章的头部信息：

```ts
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/index.md' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});
```

这段配置带来两个好处：一是编辑器里写错字段会立刻提示，二是在命令行构建时会直接报错并指出是哪个文件的问题，不会悄悄生成坏页面。

## 文章怎么存

每篇文章是一个独立的文件夹，正文固定叫 `index.md`，配图放在同一层：

```text
src/content/blog/
└── my-post/
    ├── index.md
    └── cover.svg
```

这样图片用 `./cover.svg` 相对路径引用，移动或删除文章时图片跟着一起走，不会留下孤儿文件。

## 部署

推送到 GitHub 之后，GitHub Actions 自动构建并发布到 Pages。整个流程是：

```text
本地改文章 → git push → Actions 自动构建 → 网站更新
```

日常只需要 `git push`，不用手动构建。

域名方面，站点挂在根域名 `yumesumi.cyou` 下，由 Cloudflare 代理。**这里有个需要长期注意的坑**：Cloudflare 开启代理后，GitHub 无法完成自己证书的自动续期，SSL 模式如果设成 `Full (strict)`，大约三个月后证书续期失败会导致站点直接打不开。所以 SSL 模式要设成 `Full`。

## 性能

整站只有三处用到 JavaScript：主题切换、代码复制按钮、回到顶部，加起来不到 100 行原生代码。没有前端框架运行时，没有客户端渲染，页面加载就是纯 HTML。

内容之外唯一的服务端功能是代码高亮，但那是**构建时**完成的，不是访问时——每个代码块的颜色在构建时就固定在 HTML 里了。
