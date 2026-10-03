# 架构说明

本文说明梦澄博客的模块划分、关键设计决策及其取舍理由。
面向要读代码或改代码的人，不讲部署操作（见 [README](../README.md)）。

---

## 1. 技术选型

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 框架 | Astro 7.3.5 | 纯静态输出，零前端运行时；内容集合做构建期校验 |
| 内容 | Content Collections | Markdown + Zod schema，字段写错构建即报错 |
| 代码高亮 | Shiki（内置） | 构建时着色，颜色直接写进 HTML，无客户端 JS |
| 目录 | 手写 `public/CNAME` | 保留在构建产物里，Pages 部署不会丢 |
| 部署 | GitHub Actions | 官方 action 走 artifact，不需要 gh-pages 分支 |

**刻意不装的东西**（实测无必要或引入坑）：

- `rehype-toc` / `remark-heading` —— TOC 手渲，见决策 4
- `@astrojs/rss` —— 需求明确不要
- `@astrojs/mdx` —— 文章是纯 `.md`，引入 MDX 只增加构建负担
- `tailwind` —— 站点规模小，手写 CSS 变量更直观
- `@astrojs/markdown-remark` —— Astro 7 默认管线够用，见决策 3

整站只有 3 处运行时 JS（主题切换、代码复制、回到顶部），全是原生代码，
合计不到 100 行，没有 hydration。

---

## 2. 目录结构

```text
src/
├── content.config.ts     内容集合定义（blog + pages）
├── lib/                  ★ 纯逻辑，无框架依赖，可单测
│   ├── posts.ts            查询文章、统计标签、标签路径、分享图
│   ├── format.ts           日期格式化、阅读时长估算
│   ├── site.ts             站点常量、绝对 URL 工具
│   └── search-index.ts     搜索索引生成
├── plugins/
│   └── relative-base.ts    构建后改写路径（见决策 1）
├── styles/               全局 CSS，分 4 个文件
│   ├── global.css           设计令牌、重置
│   ├── theme.css            深浅双主题变量 + 星云背景
│   ├── prose.css            正文排版
│   └── shiki.css            代码高亮双主题覆写
├── layouts/
│   ├── BaseLayout.astro    唯一持有 <html>；SEO、主题脚本、背景光晕
│   └── PostLayout.astro    文章专用：头部信息 + TOC 侧栏 + 文末导航
├── components/           10 个组件，全部无状态
├── pages/                路由
└── content/              ★ Markdown 内容（写文章改这里）
    ├── blog/<slug>/index.md
    └── pages/about.md
```

**分层原则**：`lib/` 不依赖 Astro 运行时，只依赖类型；
`components/` 和 `layouts/` 依赖 `lib/`；`pages/` 组装三者。
所以想改业务逻辑时，先看 `lib/` 有没有现成函数，避免往组件里堆逻辑。

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
   Post[]  ──→  pages/index.astro      首页列表
           ──→  pages/tags/index.astro  标签云
           ──→  pages/blog/[...slug].astro  详情页
                    │
                    │ ③ render(post) → { Content, headings }
                    ▼
              PostLayout → BaseLayout → HTML
```

**关键点**：`id` 由 `generateId` 剥掉 `/index` 后缀得到，所以 URL 是
`/blog/hello-world/` 而不是 `/blog/hello-world/index/`。
漏配这个选项不会报错，只是 URL 变难看 —— 已踩过。

---

## 4. 关键设计决策

### 决策 1：relative-base 插件（最重要）

**问题**：仓库名 `Yumesumi-Blog` 不是 `用户名.github.io` 形式，域名生效前
GitHub Pages 把站点挂在 `/Yumesumi-Blog/` 子路径下，生效后移到根路径 `/`。
两种情况需要的资源前缀不同，而 Astro 的 `base` 只能配一个绝对值：
配 `base: '/'` 则子路径下 CSS 全 404，配 `base: '/Yumesumi-Blog'` 则域名生效后全 404。

Astro 也**不提供**「文档相对 base」——`base: './'` 会被规范化成根绝对路径。

**解法**：构建期用子路径前缀，构建完成后把 HTML 里的绝对路径改写成
**文档相对路径**（`../../_astro/x.css`）。浏览器按当前文档地址逐级解析，
于是两个地址同时可用，域名切换不需要改配置。

**代价**：所有站内链接必须由插件改写，不能写绝对 URL。
详见 `src/plugins/relative-base.ts` 的文件头注释。

### 决策 2：TOC 手渲，不用 rehype 插件

`render(post)` 返回的 `headings` 数组含 `slug`，由 Astro 内置的
github-slugger 生成，与正文标题 `id` 完全一致，在组件里手渲即可。

不装 `rehype-toc` 的决定性原因：**Astro 7 默认的 Sätteri（Rust）管线
不消费 rehype 插件，且静默失效** —— 不报错、不警告、效果消失。
用手渲还顺带避免了「TOC 注入正文内部打乱中文长文阅读节奏」的问题，
目录作为 `<aside>` 与正文是兄弟节点。

### 决策 3：不装 Markdown 插件

Astro 7 内置的 Sätteri 管线已包含 GFM、标题 ID、智能标点。
全站零 Markdown 插件。若将来确需 rehype 插件，**必须**同时装
`@astrojs/markdown-remark` 并显式配 `processor: unified({...})`，
否则插件会静默失效。

### 决策 4：正文区必须实色

**这是硬性设计要求**：页面底层是星云光晕，但正文卡片
（`.prose`）必须是**不透明实色**，不能有 `background-image`、
`gradient` 或 `backdrop-filter`。

原因：中文长文对背景干扰比英文敏感得多，光晕透到文字背后会明显降低可读性。

改动 `prose.css` 时务必保持这条约束。验证方式：

```js
getComputedStyle(document.querySelector('.prose')).backgroundImage  // 必须是 "none"
```

### 决策 5：浅色主题单独调色

浅色**不是**深色的反转值（`filter: invert()` 之类）。
两套色在 `theme.css` 里分开定义，各自单独调过：

- 深色是夜空星云：`#1A1035` 底 + 粉紫光晕
- 浅色是晨雾淡紫：`#FDFBFF` 底（带一点紫，非死白）+ 更淡的光晕

浅色下光晕透明度要**更低**（0.14 vs 0.22）——浅底上同等透明度会显脏。

**改配色时两套都要改**，否则会出现某个颜色只在单主题下不协调。

对比度已实测：正文深浅均为 AAA（14.5:1 / 15.7:1），最低项 5.54:1（AA）。

### 决策 6：深浅切换的三层结构

| 层 | 手段 | 职责 |
| --- | --- | --- |
| 无 JS 兜底 | `@media (prefers-color-scheme: dark)` | 首帧正确，不白屏 |
| 用户偏好 | `html[data-theme]` | 唯一权威开关 |
| 配色 | `:root` + `html[data-theme='dark']` | 实际色值 |

防 FOUC 脚本内联在 `<head>` 最前且必须 `is:inline`（否则被打包成
`type=module"` 变异步，页面会先闪一下浅色），并用 `try/catch` 兜住
Safari 无痕模式下 `localStorage` 抛异常的情况。

用户显式选择后不再跟随系统变化（`@media` 规则的特异性低于
`html[data-theme]`，天然实现这个优先级）。

---

## 5. 主题更新的常见错误

代码高亮配了双主题（`themes: { light, dark }`），Shiki 会输出两套 CSS 变量，
**必须手写 CSS 在深色下切到 `--shiki-dark*`**。官方文档要求用
`.astro-code` 类名（不是 `.shiki`），且选择器前缀用 `html[data-theme='dark']`
而非 media query —— 用户手动切换后系统偏好不再权威。

---

## 6. 站点地址相关的约束

| 项 | 值 | 说明 |
| --- | --- | --- |
| 站点 | `https://yumesumi.cyou/` | 自定义域名，根路径 |
| 回退 | `https://yumesumi.github.io/Yumesumi-Blog/` | 同样能正常显示 |
| CNAME | `public/CNAME` 单行 `yumesumi.cyou` | **不可有多余换行**，否则 Pages 设置失败 |
| SSL 模式 | Cloudflare 设 `Full` | 不能用 `strict`（续期失败会 526）或 `flexible`（无限重定向） |
| Enforce HTTPS | **关** | 只开 Cloudflare 一层，避免 `ERR_TOO_MANY_REDIRECTS` |

部署与运维细节见 [docs/force-https.md](force-https.md) 和
[docs/cloudflare-dns-setup.md](cloudflare-dns-setup.md)。

---

## 7. 加内容 / 加功能

**加文章**：见 README 的「发布一篇新内容」。只需建文件夹写 `.md`。

**加页面**：在 `src/pages/` 建 `.astro`，需要 SEO 元信息就包一层 `BaseLayout`。

**加组件**：放 `src/components/`，写成无状态组件（props 进、slot 出），
样式用 `<style>` 块（Astro 自动 scope）。不要在组件里写业务逻辑，
逻辑放 `lib/`。

**改配色**：只改 `src/styles/theme.css`，深浅两套一起改。

**改插件**：`src/plugins/relative-base.ts`。注意改完要验证：
资源引用是相对路径、canonical 无仓库前缀、目录链接有尾斜杠。
