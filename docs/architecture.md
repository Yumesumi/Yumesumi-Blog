# 架构说明

本文说明梦澄博客的模块划分、关键设计决策及其取舍理由。
面向要读代码或改代码的人，不讲日常发布操作（见 [README](../README.md)）。

---

## 1. 技术选型

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 框架 | Astro 7.4.2 | 纯静态输出，零前端运行时；内容集合做构建期校验 |
| 内容 | Content Collections | Markdown + Zod schema，字段写错构建即报错 |
| 代码高亮 | Shiki（内置，单主题） | 构建时着色，颜色直接写进 HTML，无客户端 JS |
| 字体 | MiSans 可变字体子集 | 与梦澄中心统一；拉丁预加载，中文按 unicode-range 分片 |
| 搜索 | 构建期 JSON 索引 + 原生 JS | 纯静态站点没有服务端；内容规模还没到需要分片 |
| 部署 | GitHub Pages `gh-pages` 分支 | 本地构建后发布产物，不使用 Actions |

**刻意不装的东西**：

- `rehype-toc` / `remark-heading` —— TOC 手渲，见决策 5
- `@astrojs/rss` —— 当前没有订阅需求
- `@astrojs/mdx` —— 文章是纯 `.md`
- `tailwind` —— 站点规模小，手写 CSS 变量更直观
- 任何前端框架 —— 交互全部是原生小脚本

---

## 2. 目录结构

```text
src/
├── content.config.ts       内容集合定义（blog + pages）
├── data/
│   └── navigation.ts         顶栏、移动菜单、页脚共用的导航配置
├── lib/                    ★ 纯逻辑，无框架依赖
│   ├── posts.ts              查询文章、统计标签、标签路径、分享图
│   ├── format.ts             日期格式化、阅读时长估算
│   ├── site.ts               站点常量、绝对 URL；域名唯一来源
│   ├── search-types.ts       搜索条目类型（构建期与浏览器端共用）
│   ├── search-index.ts       搜索索引生成（构建期）
│   └── search-client.ts      搜索评分、高亮、索引加载（浏览器端）
├── styles/
│   ├── tokens.css            设计令牌（颜色、字体、间距、动效）
│   ├── global.css            reset、排版默认值、通用工具类
│   ├── prose.css             正文排版（实色面板）
│   └── shiki.css             代码块与复制按钮
├── layouts/
│   ├── BaseLayout.astro      唯一持有 <html>；SEO、字体、环境层、导航、页脚
│   └── PostLayout.astro      文章页：标题、正文、TOC、上下篇、相关阅读
├── components/
│   ├── ui/                   无业务状态的通用 UI
│   │   ├── SiteNav.astro       固定顶栏 + 移动端全屏菜单
│   │   ├── SiteFooter.astro    页脚
│   │   ├── Hero.astro          首页首屏（文字扫光、HUD、扫描线）
│   │   ├── HomeAmbience.astro  固定环境层（极光/网格/水印/星空/噪点）
│   │   ├── StarField.astro     四芒星粒子
│   │   ├── BrandLogo.astro     品牌标记（内联 SVG）
│   │   └── PageHeader.astro    内页标题区
│   └── blog/                 博客业务组件
│       ├── PostCard.astro         文章卡片
│       ├── TagPill.astro          标签胶囊
│       ├── TableOfContents.astro  目录 + 滚动高亮
│       ├── RelatedPosts.astro     相关阅读
│       ├── HeaderSearch.astro     顶栏搜索框
│       ├── CodeCopyButton.astro   代码复制（运行时注入）
│       └── BackToTop.astro        回到顶部
├── pages/                  路由
└── content/                ★ Markdown 内容
    ├── blog/<slug>/index.md
    └── pages/about.md
```

**分层原则**：`lib/` 不依赖 Astro 运行时，只依赖类型；
`components/` 和 `layouts/` 依赖 `lib/`；`pages/` 组装三者。
业务逻辑先看 `lib/` 有没有现成函数，不要往组件里堆。

---

## 3. 数据流

```text
src/content/blog/<slug>/index.md
        │
        │ ① Astro 读取 frontmatter，Zod schema 校验
        ▼
   ContentEntry { id, data, body? }
        │
        │ ② lib/posts.ts 过滤草稿 + 排序
        ▼
   Post[]  ──→  pages/index.astro        首页列表
           ──→  pages/tags/index.astro   标签索引
           ──→  pages/tags/[tag].astro   单标签列表
           ──→  pages/blog/[...slug].astro 详情页
                    │
                    │ ③ render(post) → { Content, headings }
                    ▼
              PostLayout + <Content />
                    │
                    └── headings → TableOfContents（只取 h2/h3）

   lib/search-index.ts ──→ pages/search-index.json.ts ──→ /search-index.json
                                                    │
                                                    └── search-client.ts（顶栏 + 搜索页）
```

---

## 4. 视觉系统

视觉目标：与梦澄中心（https://yumesumi.cyou/）保持同一套语言，而不是“相似的紫色博客”。

### 4.1 设计令牌

`src/styles/tokens.css` 是唯一颜色/字体/间距来源，沿用中心的 `--ys-*` 命名：

- 背景层次：`--ys-void` → `--ys-abyss` → `--ys-night` → `--ys-deep` → `--ys-surface`
- 品牌紫：`--ys-purple-deep` / `--ys-purple` / `--ys-purple-bright` / `--ys-lavender`
- 正文面板：`--ys-prose-bg`（实色）、`--ys-code-bg`、`--ys-inline-code-bg`
- 字体：MiSans + 系统中文回退；代码使用独立等宽栈 `--ys-font-code`
- 动效：统一的 duration / easing 令牌

**只有深色一套**。所有组件不允许出现 `data-theme`、浅色分支或硬编码色值。

### 4.2 字体

`public/fonts/` 来自梦澄中心的 MiSans 子集：

- `misans-latin.woff2`：拉丁、数字、符号（首屏字标需要，预加载）
- `misans-sc-1..4.woff2`：GB2312 一级汉字，按 unicode-range 分片
- 生僻字回落到系统字体，不影响阅读

### 4.3 环境层

`HomeAmbience` 在 `BaseLayout` 中固定渲染，覆盖整个视口：

```text
极光雾光（3 团） → 科技网格 → 品牌水印 → 星空粒子 → 暗角 → 噪点
```

`position: fixed; z-index: 0`，页面内容在 `main`（z-index 10）中。
所有动画只改变 `transform` / `opacity`，并适配 `prefers-reduced-motion`。

### 4.4 正文可读性（硬性约束）

`.prose` 是**实色面板**：`--ys-prose-bg` 不透明，无 `background-image`、
无 gradient、无 `backdrop-filter`。页面星云只存在于正文面板之外。

这是中文长文阅读体验的底线，任何视觉改版都不能打破。
验证方式：

```js
getComputedStyle(document.querySelector('.prose')).backgroundImage === 'none'
getComputedStyle(document.querySelector('.prose')).backdropFilter === 'none'
```

---

## 5. 关键决策与取舍

### 决策 1：只保留自定义域名根路径，删除双路径兼容层

旧方案为了让 `yumesumi.cyou` 和 `github.io/Yumesumi-Blog/` 同时可用，
把 `base` 设为 `/Yumesumi-Blog`，构建后再用 `relative-base` 插件把 HTML 里的
绝对路径改写成文档相对路径，同时修正 canonical / sitemap。

现在博客固定使用 `blog.yumesumi.cyou`（GitHub Pages 也会把仓库地址 301 到自定义域名），
这套兼容层变成了纯负担：

- 每个链接/资源都要经过一次构建后字符串改写
- JS 动态创建的链接需要额外的 `toSiteUrl()` 运行时换算
- canonical / sitemap 需要额外修正
- 任何遗漏都会在某一访问方式下 404

因此删除 `src/plugins/relative-base.ts`，`base` 改回 `/`，
所有站内链接直接使用站点绝对路径，`search-index.json` 也可直接 fetch。

**取舍**：不再支持 `github.io/Yumesumi-Blog/` 直接访问（会被 Pages 301 到自定义域名）。
这是可接受的：站点只有一个正式地址。

### 决策 2：部署改为 `gh-pages` 分支，不使用 Actions

`tools/deploy-pages.mjs`：

1. 本地 `npm run build`
2. 校验 `dist/index.html`、`dist/CNAME`
3. 复制到暂存目录，写入 `.nojekyll`
4. 用独立 git index 生成提交，推送到 `gh-pages`
5. Pages 检测到分支更新后自动发布

**取舍**：

- 优点：不占 CI 配额、不受 Actions 排队影响、发布时机完全可控
- 缺点：发布依赖本地环境；`gh-pages` 分支的历史是构建产物，不适合追溯源码

源码在 `main`，产物在 `gh-pages`，两边职责清晰。

### 决策 3：搜索索引走 endpoint，而不是构建插件

Astro 配置文件在 `astro:content` 就绪前加载，插件在 `build:done` 阶段
也无法稳定访问内容集合。`src/pages/search-index.json.ts` 由 Astro 正常编译，
可以直接调用 `buildSearchIndex()`，并且会自动进入构建产物。

索引每条正文截断 2000 字，约 100 篇文章时在 1MB 量级，浏览器一次加载无压力。

### 决策 4：搜索在前端打分，不引入搜索库

内容规模只有几十篇，Fuse.js / FlexSearch 都会增加依赖和索引体积。
当前使用确定性的子串匹配 + 字段权重（标题 10 / 标签 5 / 摘要 3 / 正文 1），
多关键词空格分隔，完整短语命中标题额外 +8。

优点：零依赖、行为可预测、容易写断言；
缺点：没有分词与模糊匹配。中文搜索以子串命中为主，当前规模足够。

### 决策 5：目录手渲 + 滚动位置高亮

Astro 7 的 Markdown 管线不消费 rehype 插件，且插件失效时不报错。
因此目录直接从 `render(post)` 返回的 `headings` 渲染，只取 h2/h3。

高亮采用滚动位置比较（最后一个越过阅读线的标题），而不是
IntersectionObserver 的窄观察带：锚点直达或快速跳转时更稳定。

桌面是 sticky 侧栏，移动端是 `<details>` 折叠目录。**两个实例共用组件，
脚本必须用 `querySelectorAll` 初始化全部实例**，否则桌面目录没有高亮。

### 决策 6：代码复制按钮运行时注入

代码块由 Markdown 渲染，不在 Astro 组件树里。`CodeCopyButton` 只包含脚本，
运行时扫描 `pre.astro-code` 并注入按钮；组件本身**不能渲染按钮标记**，
否则文章末尾会多出一个游离按钮。

复制逻辑保留 `document.execCommand` 降级：`navigator.clipboard` 只在安全上下文可用。

### 决策 7：分享图放 public，正文图走 Astro 优化

正文图片会被 Astro 优化成带内容哈希的 `_astro/` 资源，构建前无法预知 URL，
不适合作为 `og:image`。因此分享图单独放在 `public/blog/<slug>/cover.png`，
路径稳定可预测；没有则回退 `public/og-default.png`。

默认图使用 PNG 而不是 SVG：主流社交平台对 SVG 的 OG 支持不完整。

### 决策 8：纯深色，取消主题切换

视觉对齐梦澄中心，中心只有深色。取消浅色主题后：

- 删除 `ThemeToggle`、`data-theme` 分支与首帧防闪烁脚本
- 样式只维护一套，不会出现深浅不同步
- `color-scheme: dark` 与 `theme-color` 固定

---

## 6. 部署链路

```text
本地 npm run deploy
  → astro build（生成 dist/）
  → 校验 dist/CNAME = blog.yumesumi.cyou
  → 提交 dist 内容到 gh-pages（force push）
  → GitHub Pages 发布
  → Cloudflare（blog.yumesumi.cyou，橙云）
  → 浏览器
```

Pages 配置：Deploy from a branch，`gh-pages` / root，Custom domain
`blog.yumesumi.cyou`。仓库中没有任何 workflow。

---

## 7. 已知约束

- 仓库必须 public（免费版 Pages 限制）
- 自定义域名证书受 Cloudflare 橙云影响，SSL 模式必须 `Full`，见 [force-https.md](force-https.md)
- 字体子集只覆盖 GB2312 一级汉字，生僻字回落系统字体
- `public/CNAME` 必须单行且无尾随换行
- 草稿不生成页面，也不进搜索索引
- 站点无后端，搜索为纯前端子串匹配

---

## 8. 扩展点

- 新页面：在 `src/pages/` 添加，复用 `BaseLayout` / `PageHeader`
- 新文章字段：在 `src/content.config.ts` 的 schema 添加，然后同步 `PostCard` / `PostLayout`
- 新搜索权重：改 `src/lib/search-client.ts` 的 `W`，同时更新 `scripts/verify-search.mjs`
- 新环境效果：加在 `HomeAmbience` 内，注意 `prefers-reduced-motion` 与合成层开销
- 归档页：新增 `src/pages/archive.astro`，用 `getPublishedPosts()` 按年份分组
