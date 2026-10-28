# 梦澄博客 · Yumesumi Blog

用 [Astro](https://astro.build/) 搭建的纯静态博客，托管在 GitHub Pages 上。
视觉与 [梦澄中心](https://yumesumi.cyou/) 保持一致：深紫星云、MiSans 字体、固定星空环境层。

**线上地址：[blog.yumesumi.cyou](https://blog.yumesumi.cyou/)**
**上级门户：[yumesumi.cyou](https://yumesumi.cyou/)**

---

## 文档索引

| 文档                                                         | 内容                                   |
| ------------------------------------------------------------ | -------------------------------------- |
| 本文                                                         | 快速开始、写文章、发布部署、域名与验证 |
| [docs/architecture.md](docs/architecture.md)                 | 模块划分、设计决策与取舍               |
| [AGENTS.md](AGENTS.md)                                       | 接手指南：约定、命令、踩过的坑         |
| [docs/force-https.md](docs/force-https.md)                   | HTTPS / Cloudflare SSL 配置            |
| [docs/cloudflare-dns-setup.md](docs/cloudflare-dns-setup.md) | 博客子域名的 DNS 配置                  |

---

## 快速开始

```bash
npm install       # 安装依赖
npm run dev       # 本地开发 → http://localhost:4321
npm run check     # TypeScript / Astro 类型检查
npm run build     # 构建到 dist/
npm run preview   # 预览构建产物
npm run verify    # check + build + 产物校验（提交前必跑）
npm run format    # Prettier 格式化代码
npm run deploy    # 构建并发布到 gh-pages 分支
```

需要 **Node.js 24**（Astro 7.4.2 要求 ≥ 22.23.4，见 `.nvmrc`）。

Windows 上用 **Git Bash**。若要把 `/Yumesumi-Blog` 这类参数传给 node 脚本，
需先 `export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`（Git Bash 会误做路径转换）。

---

## 写一篇文章

### 一键脚手架

```bash
bash scripts/new-post.sh "我的文章标题" 标签1 标签2
```

会生成 `src/content/blog/post-日期-编号/index.md`，头部字段和示例正文都填好了。
改完标题、摘要和正文即可。

### 手动创建

```text
src/content/blog/
└── my-new-post/
    ├── index.md
    └── cover.svg        ← 可选，与 index.md 同级，正文用 ./cover.svg 引用
```

### 文章头部信息

```yaml
---
title: 我的新文章 # 必填
date: 2026-10-03 # 必填
description: 一句话摘要 # 强烈建议，列表卡片和 SEO 都靠它
tags: ['技术', '前端'] # 选填，标签页自动聚合
draft: false # 选填，true 时不生成页面、不进列表
pinned: false # 选填，true 时在首页置顶
---
```

| 字段          | 必填 | 说明                                |
| ------------- | :--: | ----------------------------------- |
| `title`       |  ✅  | 文章标题                            |
| `date`        |  ✅  | 发布日期，格式 `2026-10-03`         |
| `description` |  —   | 列表卡片摘要 + SEO 描述，**建议写** |
| `tags`        |  —   | 标签数组，标签页自动聚合            |
| `draft`       |  —   | `true` 时完全不出现在构建产物里     |
| `pinned`      |  —   | `true` 时在首页列表置顶             |

字段写错时 `npm run build` 会直接报错并指出文件和字段，不会悄悄生成坏页面。

### 插入图片

图片和 `index.md` 放同一层，用相对路径引用：

```markdown
![图片说明](./cover.png)
```

图片必须真实存在，否则构建会报 `ImageNotFound`。移动或删除文章文件夹时图片跟着走，
不会留下孤儿文件。

### 关于页

关于页内容在 `src/content/pages/about.md`，标准 Markdown，改文字不用碰代码。

---

## 发布流程

站点**不使用 GitHub Actions**。源码在 `main`，构建产物由本地脚本发布到 `gh-pages`。

```bash
# 1. 本地预览
npm run dev

# 2. 校验
npm run verify

# 3. 提交源码
git add -A
git commit -m "feat: 添加《标题》"
git -c http.proxy=socks5://127.0.0.1:10808 push

# 4. 构建并发布（需要代理时带上 GIT_PROXY）
GIT_PROXY=socks5://127.0.0.1:10808 npm run deploy
```

`npm run deploy` 会：

1. 运行 `npm run build`
2. 检查 `dist/CNAME` 是否为 `blog.yumesumi.cyou`
3. 把 `dist/` 内容提交到 `gh-pages` 分支（带 `.nojekyll`）
4. 强制推送该分支，GitHub Pages 随后自动发布

> `gh-pages` 分支只存放构建产物，被覆盖是预期行为；不要手动编辑它。
> 推送通常 1–2 分钟生效。Cloudflare 代理下若仍是旧页面，purge 缓存。

### 一次性 Pages 配置

GitHub 仓库 **Settings → Pages**：

| 项            | 值                                                        |
| ------------- | --------------------------------------------------------- |
| Source        | **Deploy from a branch**                                  |
| Branch        | `gh-pages` / `/ (root)`                                   |
| Custom domain | `blog.yumesumi.cyou`                                      |
| Enforce HTTPS | 保持关闭（见 [docs/force-https.md](docs/force-https.md)） |

也可以用 API 设置：

```bash
gh api -X PUT repos/Yumesumi/Yumesumi-Blog/pages \
  -f 'build_type=legacy' \
  -f 'source[branch]=gh-pages' \
  -f 'source[path]=/'
```

---

## 路由

| 路径                 | 页面                                          |
| -------------------- | --------------------------------------------- |
| `/`                  | 首页（Hero + 最新文章 + 主题 + 梦澄中心入口） |
| `/blog/<slug>/`      | 文章详情                                      |
| `/tags/`             | 标签索引                                      |
| `/tags/<标签>/`      | 单标签下的文章                                |
| `/search/`           | 搜索页（支持 `?q=`）                          |
| `/about/`            | 关于页                                        |
| `/404.html`          | 未找到                                        |
| `/robots.txt`        | 抓取配置                                      |
| `/sitemap-index.xml` | 站点地图                                      |
| `/search-index.json` | 构建期生成的搜索索引                          |

---

## 项目结构

```text
.
├── astro.config.mjs              # site / base / sitemap / Shiki
├── AGENTS.md                     # 接手指南
├── docs/                         # 架构与运维文档
│   ├── assets/og-default.svg       # 默认分享图源文件
│   └── 参考资料/                    # 深度素材（不随博客发布）
├── tools/deploy-pages.mjs        # gh-pages 发布脚本
├── scripts/
│   ├── new-post.sh               # 新文章脚手架
│   ├── verify-site.mjs           # 构建产物校验
│   ├── gen-test-posts.mjs        # 搜索测试数据生成/清理
│   └── verify-search.mjs         # 搜索断言
├── public/
│   ├── CNAME                     # blog.yumesumi.cyou（单行，勿加换行）
│   ├── favicon.svg               # 站点图标
│   ├── brand/logo.svg            # 品牌标记（顶栏、页脚、水印共用）
│   ├── fonts/                    # MiSans 子集 + fonts.css
│   ├── og-default.png            # 默认分享图（1200×630）
│   └── blog/<slug>/cover.png     # 每篇文章的分享图
└── src/
    ├── content.config.ts         # 内容集合定义（schema 校验）
    ├── data/navigation.ts        # 导航配置
    ├── lib/                      # 纯逻辑：文章、格式、站点常量、搜索
    ├── content/                  # ★ Markdown 内容（写文章改这里）
    ├── styles/                   # tokens / global / prose / shiki
    ├── layouts/                  # BaseLayout、PostLayout
    ├── components/
    │   ├── ui/                   # 导航、页脚、Hero、环境层、品牌标记
    │   └── blog/                 # 文章卡片、TOC、标签、搜索框、回顶、复制
    └── pages/                    # 路由
```

分层原则：`pages` → `layouts` → `components` → `lib`。
**业务逻辑放 `lib/`，不要堆在组件里。**

---

## 视觉与前端

- **纯深色**：没有浅色主题，也没有主题切换按钮
- **设计令牌**：颜色、字体、间距、动效全部在 `src/styles/tokens.css`，组件不硬编码色值
- **字体**：MiSans 可变字体子集；拉丁分片预加载，中文分片按 unicode-range 按需加载
- **环境层**：`HomeAmbience` 固定渲染极光、科技网格、品牌水印、星空粒子、暗角与噪点
- **正文可读性**：`.prose` 始终是实色背景，不使用渐变、背景图或 `backdrop-filter`
- **交互**：导航滚动状态、移动端全屏菜单、Hero 文字扫光、目录滚动高亮、
  代码复制、回到顶部、搜索，全部是原生 JS，无前端框架运行时

### 改配色

只改 `src/styles/tokens.css`。因为站点只有深色一套，不需要同步另一套主题。
改完用 `npm run verify` + 浏览器检查对比度。

---

## 搜索

- 构建期由 `src/pages/search-index.json.ts` 生成 `/search-index.json`
- 顶栏搜索框与 `/search/` 页共用 `src/lib/search-client.ts`
- 权重：标题 10、标签 5、摘要 3、正文 1；多关键词用空格分隔
- 任意页面按 `/` 聚焦顶栏搜索框
- 顶栏提交统一跳到 `/search/?q=...`，避免直接进入某篇文章而掩盖其他结果

搜索测试数据是临时的：

```bash
node scripts/gen-test-posts.mjs    # 生成 30 篇 test-post-*
npm run build
node scripts/verify-search.mjs     # 跑搜索断言

node scripts/gen-test-posts.mjs --clean   # 测完清理
npm run build
```

**切勿在测试数据未清理时执行 `npm run deploy`。**

---

## SEO 与分享图

- canonical、OG、Twitter Card、JSON-LD（`BlogPosting` / `Blog`）由 `BaseLayout` 统一输出
- 默认分享图 `public/og-default.png`（1200×630，PNG 兼容性最好）
- 每篇文章的分享图放 `public/blog/<slug>/cover.png`；没有则回退默认图
- 正文里与 `index.md` 同级的配图会被 Astro 优化成带哈希的 `_astro/` 资源，
  不能用作 og:image；两处图片是独立的

---

## 域名与 HTTPS

- 博客在子域名 `blog.yumesumi.cyou`；根域 `yumesumi.cyou` 属于梦澄中心
- Cloudflare DNS 添加 `CNAME blog → yumesumi.github.io`，代理状态橙云
- SSL/TLS 加密模式必须是 **完全（Full）**，并开启「始终使用 HTTPS」
- **不要**选「完全（严格）」：Cloudflare 橙云会阻断 GitHub 证书续期，约 90 天后 526

详细步骤与验证命令见：

- [docs/cloudflare-dns-setup.md](docs/cloudflare-dns-setup.md)
- [docs/force-https.md](docs/force-https.md)

---

## 技术说明

- **纯静态**：构建产物是一堆 HTML，没有服务端
- **零前端框架运行时**：没有 hydration、没有客户端渲染
- **代码高亮**：Shiki 单主题（`github-dark-dimmed`），构建时着色
- **站点根路径**：`base: '/'`，所有站内链接使用站点绝对路径；
  不再维护 github.io 子路径回退（自定义域名是唯一访问地址）
- **部署**：本地构建 → `gh-pages` 分支；仓库中没有任何 workflow
