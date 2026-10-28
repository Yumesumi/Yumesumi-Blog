# AGENTS.md

给后续在这个项目上工作的 AI Agent（或人）的接手指南。
读完这一份就能安全动手，不用先翻其他文件猜上下文。

---

## 项目是什么

个人博客 **梦澄博客 / Yumesumi Blog**，Astro 7.4.2 纯静态站点，托管 GitHub Pages。

- 线上地址：**https://blog.yumesumi.cyou/**
- 上级门户：https://yumesumi.cyou/（梦澄中心，另一个仓库）
- 源码：https://github.com/Yumesumi/Yumesumi-Blog（**必须保持 public**）
- 视觉：与梦澄中心一致，**纯深色**、深紫星云、MiSans、固定星空环境层

技术栈与设计决策详见 [docs/architecture.md](docs/architecture.md)，本文只讲怎么干活。

---

## 环境准备

```bash
node -v   # 需要 24.x（Astro 7.4.2 要求 >= 22.23.4，见 .nvmrc）
npm install
```

Windows 上用 **Git Bash**。若要把 `/Yumesumi-Blog` 这类参数传给 node 脚本，需要：

```bash
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
```

npm 默认源已配 `npmmirror`（`~/.npmrc`）。

GitHub 访问需要本机 SOCKS5 代理（不是常开，**不要写进全局 git 配置**）：

```bash
git -c http.proxy=socks5://127.0.0.1:10808 push
GIT_PROXY=socks5://127.0.0.1:10808 npm run deploy
```

---

## 常用命令

| 命令                                   | 用途                                       |
| -------------------------------------- | ------------------------------------------ |
| `npm run dev`                          | 本地开发服务器 → http://localhost:4321     |
| `npm run check`                        | TypeScript / Astro 类型检查                |
| `npm run build`                        | 构建到 `dist/`                             |
| `npm run verify`                       | **check + build + 产物校验**，提交前跑这个 |
| `npm run format`                       | Prettier 格式化代码                        |
| `npm run format:check`                 | 检查格式（CI 可用）                        |
| `npm run preview`                      | 预览 `dist/`                               |
| `npm run deploy`                       | 构建并发布到 `gh-pages` 分支               |
| `bash scripts/new-post.sh "标题" 标签` | 生成新文章骨架                             |
| `node scripts/gen-test-posts.mjs`      | 生成 30 篇搜索测试数据（临时）             |
| `node scripts/verify-search.mjs`       | 跑搜索断言（需先生成测试数据并 build）     |

---

## 提交前必须做的

```bash
npm run verify        # 必须 0 errors
npm run format:check  # 代码格式
```

`verify-site.mjs` 会检查域名、CNAME、canonical、sitemap、文章页面、
站内链接、搜索索引字段。新增页面或文章后它会自动纳入检查。

改了影响 URL 或 SEO 的地方，额外人工抽查：

```bash
grep -o 'rel="canonical" href="[^"]*"' dist/index.html
grep -o 'href="[^"]*\.css"' dist/index.html
grep -o 'https://[^<]*' dist/sitemap-0.xml | head -5
# 期望全部是 https://blog.yumesumi.cyou/，且 CSS 是 /_astro/...
```

---

## 必须知道的坑

### 1. Astro 7 的 API 和网上教程不一致

网上教程（含 AI 生成的方案）几乎全是 Astro 4/5 写法，照抄会报错。

| 旧写法（≤5）                        | Astro 7 正确写法                         |
| ----------------------------------- | ---------------------------------------- |
| `src/content/config.ts`             | `src/content.config.ts`（在 `src/` 下）  |
| `type: 'content'`                   | 删除，改用 `loader: glob({...})`         |
| `post.render()`                     | `render(post)`，从 `astro:content` 导入  |
| `post.slug`                         | `post.id`；schema 里**禁用** `slug` 字段 |
| `import { z } from 'astro:content'` | `from 'astro/zod'`                       |
| `shikiConfig: { theme }`            | 单主题可以直接用；本项目已改为单主题     |

### 2. glob loader 必须配 `generateId`

不配的话 `index.md` 不会被折叠成父目录名，URL 变成 `/blog/xxx/index/`。
**不会报错**，只是 URL 变难看，很容易漏。

`src/content.config.ts` 里 `.replace(/\\/g, '/')` 是 **Windows 必需**。

### 3. Astro 7 的 Sätteri 管线不消费 rehype 插件，且**静默失效**

不报错、不警告、效果直接消失。需要 rehype 插件时必须装
`@astrojs/markdown-remark` 并显式配 `processor: unified({...})`。
当前方案是零插件，TOC 手渲，不受影响。

### 4. `base` 必须是字面量，且现在是 `/`

```js
base: BUILD_BASE; // ✗ Astro 静态分析拿不到，会得到 undefined
base: '/'; // ✓ 字面量
```

站点只通过自定义域名根路径访问。**不要重新引入** `/Yumesumi-Blog` 前缀或
`relative-base` 插件——那是为 github.io 子路径做的兼容层，已经移除。
`base` 变更会影响所有站内绝对路径与 public 资源，改之前先想清楚。

### 5. `getStaticPaths` 的 `params` 不能手动编码

```js
params: {
  tag: encodeURIComponent(tag);
} // ✗ 双重编码，NoMatchingStaticPathFound
params: {
  tag;
} // ✓ Astro 自己会编码
```

`encodeURIComponent` 只用在**生成链接**的地方（`lib/posts.ts` 的 `tagPath`）。

### 6. `post.body` 是可选字段

Astro 7 的 `DataEntry` 里 `body?: string`，glob loader **不保证填充**。
直接 `estimateReadingMinutes(post.body)` 会在构建时崩。
正文原文要从页面层显式传给布局，并做空值兜底（见 `PostLayout`）。

### 7. 配置文件里不能静态 import 依赖 `astro:content` 的模块

`astro.config.mjs` 在 Astro 初始化**之前**被加载，此时 `astro:content`
虚拟模块还不存在。搜索索引最初就是写成插件的，踩了这个坑。
现在搜索索引由 `src/pages/search-index.json.ts` 这个 endpoint 生成——不要改回插件。

### 8. 搜索索引与站内路径

站点在自定义域名根路径，HTML 与 JS 都可以直接使用 `/blog/xxx/` 这种绝对路径。
但 **public 资源**在组件里仍建议用 `import.meta.env.BASE_URL` 拼接，
未来若真的改部署路径无需改业务代码。

搜索索引地址由 `search-client.ts` 的 `indexUrl()` 统一生成，
不要再写死 `/search-index.json`。

### 9. 目录有两个实例，脚本必须全部初始化

桌面侧栏与移动端折叠目录各渲染一份 `TableOfContents`。
脚本如果只 `querySelector` 第一个，桌面目录会失去滚动高亮。
用 `querySelectorAll('[data-toc]')`，参考现有实现。

### 10. `CodeCopyButton` 不能渲染按钮标记

它只在运行时扫描 `pre.astro-code` 并注入按钮。组件里若再写一个
`<button data-code-copy>`，会在文章末尾多出一个游离按钮，
同时让“按钮数 = 代码块数”的验证失败。

### 11. `.prose` 必须是实色背景

`.prose` 及其内部容器**禁止** `background-image` / gradient / `backdrop-filter`。
页面星云只在正文面板之外。这是中文长文可读性的硬性要求。
`verify-site` 不检查这一条的视觉效果，改样式后要用浏览器确认
`getComputedStyle(.prose).backgroundImage === 'none'`。

### 12. SVG 注释里不能出现连续的连字符

XML 规范禁止注释内出现 `--`。改 `public/favicon.svg` / `public/brand/logo.svg`
时尤其注意，否则 SVG 解析失败，页面显示破图但控制台无报错。

```bash
python -c "
import xml.etree.ElementTree as ET
ET.parse('public/favicon.svg'); print('OK')
"
```

### 13. `public/CNAME` 必须是单行、无尾随换行

内容固定为 `blog.yumesumi.cyou`。部署脚本会校验，不匹配直接中止。
不要手动改 `gh-pages` 分支里的 CNAME。

### 14. 字体是子集，不是完整 MiSans

`public/fonts/` 是 GB2312 一级汉字 + 拉丁 + 常用符号的子集。
生僻字会自动回落到系统中文字体，不要误以为是字体加载失败。
重新生成子集需要中心仓库的 MiSans 源文件和 `fonttools`，本仓库不包含源字体。

### 15. 草稿不会生成页面

`draft: true` 的文章会被 `getPublishedPosts()` 过滤，`getStaticPaths` 不会为它
生成页面，也不会进搜索索引。需要预览草稿时临时改成 `false`。

### 16. 分享图必须放在 `public/`

正文里的图片会被 Astro 优化成带哈希的 `_astro/` 资源，不能做 og:image。
分享图固定放 `public/blog/<slug>/cover.png`（PNG 优先，回退 SVG），
默认图是 `public/og-default.png`。

---

## 改代码时的约定

### 分层

```text
pages/       路由与组装
  ↓
layouts/     页面骨架
  ↓
components/  无状态 UI（ui/ 通用，blog/ 业务）
  ↓
lib/         纯逻辑，不依赖 Astro 运行时
```

**业务逻辑放 `lib/`，不要堆在组件里。** 判断标准：这段逻辑换个页面还用得上吗？

现有共享模块：

- `lib/posts.ts` —— 文章查询、标签统计、标签路径、分享图
- `lib/format.ts` —— 日期格式化、阅读时长
- `lib/site.ts` —— 站点常量、绝对 URL；**域名唯一来源**
- `lib/search-types.ts` —— 搜索条目类型（构建期与浏览器端共用）
- `lib/search-index.ts` —— 构建期索引生成
- `lib/search-client.ts` —— 浏览器端评分、高亮、索引加载

### 组件写法

```astro
---
interface Props {
  post: Post;
  index: number;
}
const { post, index } = Astro.props satisfies Props;
---

<article>...</article>
<style>
  /* Astro 自动 scope */
</style>
```

- props 必须用 `satisfies Props` 校验
- 样式写在组件内 `<style>` 块，共享样式才放 `src/styles/`
- 组件不要有内部状态
- 纯深色站点，**不要**再写 `data-theme` / 浅色分支

### CSS 约定

- 颜色、间距、字体、动效一律使用 `src/styles/tokens.css` 的 `--ys-*` 变量
- 新增令牌前先 grep 确认没有同名未使用的
- `.prose` 不能有渐变/背景图/backdrop-filter
- 环境层（`HomeAmbience`）是 `position: fixed; z-index: 0`，
  页面内容在 `main`（z-index 10）里；正文面板用实色
- 尊重 `prefers-reduced-motion`：新增动画时补降级

### 写内容

- 位置 `src/content/blog/<slug>/index.md`，slug 用英文小写连字符
- 配图与 `index.md` 同级，正文用 `./cover.png` 引用
- **图片必须真实存在**，否则构建报 `ImageNotFound` 整个失败
- 必填字段 `title`、`date`
- 改关于页编辑 `src/content/pages/about.md`
- 写到站内链接一律用 `/tags/` 这类根路径，不要写完整域名
- 文章正文里不要出现与当前架构不符的部署说明（改架构时同步改文章）

---

## 验证清单

```bash
npm run verify                                    # 必做
npm run format:check                              # 必做
```

视觉/交互改动，用真实浏览器验证：

```bash
npm run build && npm run preview
```

要点：

- 正文区 `getComputedStyle(.prose).backgroundImage === 'none'`
- 正文区 `backdropFilter === 'none'`
- 深浅只有一套，页面首帧不闪白
- TOC 每条链接都能跳转，滚动时高亮跟随；TOC 不在 `.prose` 内部
- 移动端菜单可打开/关闭（CLOSE、Escape），焦点不会跑出菜单
- 顶栏搜索回车进入 `/search/?q=...`，结果页高亮与标签可点
- 站内链接点击后 200，无 404
- 移动端无横向滚动

---

## 部署相关

- **仓库必须 public**：免费版 GitHub Pages 不支持私有仓库
- **Pages Source 必须是 `gh-pages` 分支**（Deploy from a branch），
  不是 GitHub Actions。仓库里没有任何 workflow，不要加回来
- 发布：`GIT_PROXY=socks5://127.0.0.1:10808 npm run deploy`
- `gh-pages` 分支只存构建产物，会被强制覆盖，不要在上面手工改东西
- 发布状态看仓库 Settings → Pages（Actions 页不再产生构建记录）
- 域名 `blog.yumesumi.cyou` 由 Cloudflare 代理，SSL 模式必须 `Full`

---

## 不要做的事

| 别做                                                  | 原因                               |
| ----------------------------------------------------- | ---------------------------------- |
| 重新加回 `relative-base` 插件或 `/Yumesumi-Blog` base | 双路径兼容层已废弃                 |
| 给 `base` 加条件判断                                  | Astro 静态分析拿不到变量值         |
| 在 `.prose` 上加渐变/背景图                           | 违反中文可读性硬性要求             |
| 恢复浅色主题或 ThemeToggle                            | 站点视觉已与梦澄中心统一为纯深色   |
| 删 `CodeCopyButton` 的 `execCommand` 降级             | 非 HTTPS 环境唯一可用复制方式      |
| 把代理写进 git 全局配置                               | 代理非常开，会弄坏 git             |
| 手动给 `public/CNAME` 加换行                          | Pages 域名设置会失败               |
| 直接改 `gh-pages` 分支                                | 下次 deploy 会覆盖，冲突且不可追踪 |
| 在 `src/content` 里写 `draft` 期待页面可见            | 草稿不生成页面                     |
| 把测试数据部署上线                                    | 会被搜索引擎收录                   |

---

## ⚠️ 搜索测试数据（临时）

`src/content/blog/test-post-01` … `test-post-30` 由脚本生成，**不是正式内容**。

```bash
node scripts/gen-test-posts.mjs    # 生成 30 篇
npm run build
node scripts/verify-search.mjs     # 42 项断言

node scripts/gen-test-posts.mjs --clean
npm run build                     # 清理后必须重建，否则 dist 里仍有页面
```

**判断是否为测试数据**：目录名以 `test-post-` 开头。

测试数据的设计要点：每篇带一个唯一标记词（如「紫石英」），搜它必须命中对应文章，
用于验证搜索**精度**而不只是“能搜到”；刻意保留一组共享标记词（「星云」两篇），
验证同分时的排序稳定性。

---

## 长期待办

- **约 3 个月后回访** `https://blog.yumesumi.cyou/` 确认证书状态
  （Cloudflare 橙云会影响 GitHub 证书续期，见 `docs/force-https.md`）
- 引入测试框架（目前是 `verify-site.mjs` + `verify-search.mjs` 的脚本级验证）
- 归档页（需要时可加 `src/pages/archive.astro`）
- 自动生成字体子集（目前依赖中心仓库的 MiSans 源文件）
