# 梦澄博客

用 [Astro](https://astro.build/) 搭建的纯静态博客，托管在 GitHub Pages 上。
**线上地址：[yumesumi.cyou](https://yumesumi.cyou/)**

## 文档索引

| 文档 | 内容 |
| --- | --- |
| 本文 | 快速开始、写文章、部署与域名配置 |
| [docs/architecture.md](docs/architecture.md) | 模块职责、关键设计决策及取舍理由 |
| [AGENTS.md](AGENTS.md) | 接手指南：开发约定、常用命令、踩过的坑 |
| [docs/force-https.md](docs/force-https.md) | HTTPS 配置与 SSL 模式陷阱 |
| [docs/cloudflare-dns-setup.md](docs/cloudflare-dns-setup.md) | Cloudflare DNS 配置步骤 |

---

## 快速开始

```bash
npm install     # 安装依赖
npm run dev     # 本地预览 → http://localhost:4321
npm run check   # 类型检查
npm run build   # 构建，产物在 dist/
npm run preview # 预览构建结果
```

提交前建议跑 `npm run verify`（= check + build）。

需要 Node.js 22.12 或更高版本（推荐 22.22.2，见 `.nvmrc`）。

Windows 上用 **Git Bash**。若要把 `/Yumesumi-Blog` 这类参数传给 node 脚本，
需先 `export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`（Git Bash 会误做路径转换）。

---

## 发布一篇新文章

### 最快的方式：一键脚手架

```bash
bash scripts/new-post.sh "我的文章标题" 标签1 标签2
```

会生成 `src/content/blog/post-日期-编号/index.md`，头部字段和示例正文都填好了，
你只需要改标题、摘要和正文。改完 push 就上线。

```text
已创建: src/content/blog/post-20261003-14730/index.md

接下来:
  1. 编辑 index.md，把 TODO 换成真实摘要
  2. 把配图放到该目录（可选），正文用 ./文件名 引用
  3. 预览: npm run dev
  4. 发布: git add . && git commit -m "..." && git push
```

目录名可以随便改成你想要的样子（英文小写加连字符），改完网站 URL 跟着变。

### 手动创建

**只需新建一个文件夹，写一个 Markdown 文件，推送。**

```text
src/content/blog/
└── my-new-post/
    ├── index.md
    └── cover.svg      ← 可选，与 index.md 同级
```

### 文章头部信息

```yaml
---
title: 我的新文章              # 必填
date: 2026-10-03              # 必填
description: 一句话摘要        # 强烈建议，列表卡片和 SEO 都靠它
tags: ['技术', '前端']         # 选填，标签页会自动聚合
draft: false                  # 选填，true 时草稿不出现在列表
pinned: false                 # 选填，true 时在列表置顶
---
```

| 字段 | 必填 | 说明 |
| --- | :---: | --- |
| `title` | ✅ | 文章标题 |
| `date` | ✅ | 发布日期，格式 `2026-10-03` |
| `description` | — | 列表卡片摘要 + SEO 描述，**建议写** |
| `tags` | — | 标签数组，标签页自动聚合 |
| `draft` | — | `true` 时不进列表，默认可通过 URL 访问 |
| `pinned` | — | `true` 时在列表置顶 |

字段写错时，`npm run build` 会直接报错并指出是哪个文件的哪个字段有问题，
不会悄悄生成坏页面。改完记得跑一次 `npm run build` 验证（dev 模式只在访问该页时才校验）。

### 完整发布流程

```bash
# 1. 新建文章文件夹
bash scripts/new-post.sh "标题" 标签

# 2. 本地预览（可选，浏览器打开 http://localhost:4321）
npm run dev

# 3. 校验（类型检查 + 构建，会验证 frontmatter）
npm run verify

# 4. 提交并推送 → 网站自动更新，约 1 分钟上线
git add -A
git commit -m "feat: 添加《标题》"
git -c http.proxy=socks5://127.0.0.1:10808 push
```

> 推送需要走你的本地代理，所以要带 `-c http.proxy=socks5://127.0.0.1:10808`。
> 不想每次都带，可以在项目里配 `git config --local http.proxy socks5://127.0.0.1:10808`
> （只影响这个仓库，代理关闭时再删掉）。

### 插入图片

图片和 `index.md` 放同一层，用相对路径引用：

```markdown
![图片说明](./cover.png)
```

这样移动或删除文章文件夹时，图片会跟着一起走，不会留下孤儿文件。

> Markdown 里的图片建议用 `.svg` 或 WebP 格式。`.svg` 是纯文本，Windows 下无编码风险；
> `.jpg` / `.png` 也能正常工作，但体积大一些。

### 草稿

写一半不想发布？在头部加 `draft: true`，这篇文章就不会出现在首页列表，
但仍可以通过 `/blog/你的文章名/` 直接访问，方便预览。写完记得改回 `false`。

> ⚠️ 注意：`draft: true` 只影响**列表显示**，文章页面仍会生成、
> 源码仍在公开仓库里。真正不想公开的内容不要放到这个博客仓库。

### 关于页

关于页内容在 `src/content/pages/about.md`，用标准 Markdown 编写，改文字不用碰代码。

---

## 站点结构

| 路径 | 页面 |
| --- | --- |
| `/` | 文章列表 |
| `/blog/<slug>/` | 文章详情 |
| `/tags/` | 标签云 |
| `/tags/<标签>/` | 单标签下的文章 |
| `/about/` | 关于页 |
| `/404` | 未找到 |
| `/robots.txt` | 搜索引擎抓取配置 |
| `/sitemap-index.xml` | 站点地图 |

---

## 部署

推送到 `main` 分支后，GitHub Actions 自动构建并发布，无需手动操作。

```
本地改文章 → git push → Actions 自动构建 → 网站更新
```

**首次使用需要手动配置一次**（见下方「域名配置」）。

---

## 域名配置

站点域名是 **[yumesumi.cyou](https://yumesumi.cyou/)**，托管在 Cloudflare。

| 地址 | 状态 |
| --- | --- |
| `https://yumesumi.cyou/` | ✅ 主地址 |
| `https://yumesumi.github.io/Yumesumi-Blog/` | ✅ 回退地址（同样正常显示） |
| `https://yumesumi.github.io/` | ❌ 这是 GitHub 用户主页，不是站点 |

### GitHub 侧（已完成）

- `public/CNAME` 文件里写着 `yumesumi.cyou`，每次部署会自动带上
- 仓库 Settings → Pages 的 Custom domain 已填 `yumesumi.cyou`（证书已签发）
- Build and deployment → Source 选 `GitHub Actions`

### 首次部署时启用 Pages

1. 仓库 **Settings → Pages**
2. **Build and deployment → Source** 选 **`GitHub Actions`**

> ⚠️ 必须选 `GitHub Actions`，不能选 `gh-pages` 分支。
> 官方部署工作流通过 Actions 上传产物，不会创建 `gh-pages` 分支，
> 两者是互斥的，设错会导致部署失败。

### Cloudflare 侧（已完成）

1. 删掉了原有的 A 记录（Spaceship 自动加的停放页），
   Cloudflare 不允许 A/AAAA 与 CNAME 共存，不删会报
   `An A, AAAA, or CNAME record with that host already exists`
2. **DNS → Records** 添加：

| 类型 | 名称 | 目标 | TTL | 代理状态 |
| --- | --- | --- | --- | --- |
| CNAME | `@` | `yumesumi.github.io` | Auto | 已代理（橙云） |

3. **SSL/TLS → 概述 → 加密模式** 设为 **`完全（Full）`**
4. **SSL/TLS → 边缘证书 → 始终使用 HTTPS** 开启

> **注意**：Cloudflare 会在 DNS 层把根域 CNAME「平铺」成 A 记录，
> 所以用 `nslookup -type=A` 查不到 `yumesumi.github.io` 是正常的，
> 不代表配置有误。判断是否配对要看 HTTP 响应头有没有 `x-github-request-id`。

**SSL/TLS → 边缘证书：**

| 设置项 | 值 |
| --- | --- |
| 始终使用 HTTPS | **开启** ← http 会 301 跳到 https |

**GitHub Settings → Pages → Enforce HTTPS：保持关闭**

> 不需要开。Cloudflare 的提示里说了，Origin 侧再强制 HTTPS 重定向
> 可能导致 `ERR_TOO_MANY_REDIRECTS`。实测只开 Cloudflare 一层时，
> 从 `http://yumesumi.github.io/Yumesumi-Blog/` 进入的跳转链路是：
>
> ```text
> http://github.io/Yumesumi-Blog/  (GitHub 301)
>   → http://yumesumi.cyou/        (Cloudflare 301)
>     → https://yumesumi.cyou/     (200 ✓)
> ```
>
> 每跳只进一步，收敛正常。详细说明见 [docs/force-https.md](docs/force-https.md)。

**SSL/TLS → 概述 → 加密模式：**

| 模式 | 说明 |
| --- | --- |
| **完全（Full）** | ✅ **用这个** |

---

## 📌 为什么两个地址都能正常显示

站点现在**同时支持**两种访问方式，域名切换前后都不用改任何配置：

| 状态 | 访问地址 |
| --- | --- |
| 域名未生效（当前） | `https://yumesumi.github.io/Yumesumi-Blog/` |
| 域名生效后 | `https://yumesumi.cyou/` |

**这是怎么做到的**

仓库名 `Yumesumi-Blog` 不是 `用户名.github.io` 形式，所以域名生效前
GitHub Pages 会把站点挂在**子路径** `/Yumesumi-Blog/` 下，而域名生效后
站点在**根路径** `/`。两种情况需要的资源前缀不同：

- 子路径需要 `/Yumesumi-Blog/_astro/xxx.css`
- 根路径需要 `/_astro/xxx.css`

Astro 的 `base` 只能配一个绝对值，写死任何一个都会让另一个地址**样式全失**
（CSS 404，页面变成没有排版的裸 HTML）。

解法分两步：

1. `astro.config.mjs` 里把 `base` 设为 `'/Yumesumi-Blog'`，让 Astro 正常生成带前缀的资源引用
2. 构建结束后，`src/utils/relative-base.js` 这个 Astro 插件会把产物 HTML 里的绝对路径
   全部改写成**文档相对路径**（`../../_astro/xxx.css`）

浏览器解析相对路径时以当前文档地址为基准，所以同一份产物在两个地址下都正确：

```text
域名根路径：   https://yumesumi.cyou/blog/hello-world/  +  ../../_astro/x.css
            → https://yumesumi.cyou/_astro/x.css                     ✓
子路径：       https://yumesumi.github.io/Yumesumi-Blog/blog/hello-world/
            +  ../../_astro/x.css
            → https://yumesumi.github.io/Yumesumi-Blog/_astro/x.css  ✓
```

该插件同时会修正 `canonical`、`og:url` 和 `sitemap.xml` 里的地址，
去掉仓库名前缀，保证它们始终指向主域名。

> ⚠️ 以后如果改了文章里的站内链接，注意**不要手写绝对路径**。
> 直接写 `/tags/` 即可，插件会自动转成相对于当前页面的路径。
> 手写成 `https://yumesumi.cyou/...` 绝对地址也可以（本来就不需要改写）。

---

## ⚠️ 重要：SSL 模式为什么不能选「完全（严格）」

这是一个已知的长期问题，跟 Cloudflare 代理 GitHub Pages 的组合有关：

GitHub Pages 用 Let's Encrypt 签发自定义域名证书，**有效期只有 90 天**。
Cloudflare 开启橙云代理后，DNS 解析到的是 Cloudflare 的 IP，
**GitHub 因此无法完成证书的自动续期**。

如果 SSL 模式设成 `完全（strict）`：

- 站点前几个月一切正常
- 大约 **3 个月后** GitHub 续期失败

- Cloudflare 校验源站证书失败 → **站点直接返回 526 错误，完全打不开**

设成 `完全（Full）` 可以规避：到 GitHub 走 HTTPS 但不校验证书有效性，
续期失败也不会导致站点不可访问。

**别选「灵活（Flexible）」** —— GitHub Pages 会把 HTTP 请求 301 重定向到 HTTPS，
Cloudflare 收到重定向又转发回来，会形成**无限重定向循环**，页面直接打不开。

### 上线后记得回访

**大约 3 个月后**（`git log` 里第一次提交的时间往后推 90 天）回访一次站点，
确认没有证书相关的故障。如果用 `Full` 模式正常，就不用管了。

### 如果首次部署就卡在证书签发

如果推送后 GitHub 一直显示 `certificate not yet provisioned`，
按这个顺序处理：

1. Cloudflare 里把那条 CNAME 的橙云**暂时关掉**（改成「仅 DNS」）
2. 等 10~30 分钟，让 GitHub 签发证书成功
3. 再把橙云**打开**

---

## 项目结构

```text
.
├── .github/workflows/deploy.yml    # 部署工作流
├── astro.config.mjs                # 站点配置（域名、base、sitemap、高亮主题）
├── AGENTS.md                       # 接手指南：约定、命令、坑
├── docs/                           # 架构与运维文档
├── scripts/new-post.sh             # 新文章脚手架
├── public/
│   ├── CNAME                       # 自定义域名（单行，勿加换行）
│   └── favicon.svg
└── src/
    ├── content.config.ts           # 内容集合定义（schema 校验）
    ├── lib/                        # 纯逻辑，不依赖 Astro 运行时
    │   ├── posts.ts                  文章查询、标签统计、标签路径
    │   ├── format.ts                 日期格式化、阅读时长估算
    │   ├── site.ts                   站点常量、绝对 URL、默认分享图
    │   └── search-index.ts           搜索索引生成
    ├── plugins/
    │   └── relative-base.ts          构建后把路径改写为文档相对路径
    ├── content/                    # ★ Markdown 内容（写文章改这里）
    │   ├── blog/<slug>/index.md      每篇文章一个文件夹
    │   └── pages/about.md            关于页
    ├── styles/                     # global / theme / prose / shiki
    ├── layouts/                    # BaseLayout、PostLayout
    ├── components/                 # 10 个无状态组件
    └── pages/                      # 路由（含 search.astro、search-index.json.ts）
```

分层原则：`pages` → `layouts` → `components` → `lib`。
**业务逻辑放 `lib/`，不要堆在组件里。**

详细说明见 [docs/architecture.md](docs/architecture.md)。

---

## 技术说明

- **纯静态**：构建产物是一堆 HTML 文件，没有服务端
- **零前端框架运行时**：整站只有主题切换、代码复制、回到顶部、搜索四处用到 JS，
  全部原生代码，总共不到 200 行
- **代码高亮**：Shiki，构建时完成，颜色直接写进 HTML
- **主题切换**：CSS 变量 + `data-theme` 属性，选择存在 localStorage，
  首次访问跟随系统。防闪烁脚本内联在 `<head>` 最前面同步执行
- **正文可读性**：页面底层是星云光晕，正文区域是**实色背景**，
  不承载任何渐变，保证长文阅读不受背景干扰
- **双地址兼容**：插件在构建后把绝对路径改写为文档相对路径，
  所以 `yumesumi.cyou` 和 `github.io/Yumesumi-Blog/` 都能正常显示，
  域名切换不需要改配置
- **站内搜索**：构建期生成 `/search-index.json`，浏览器端过滤。
  标题权重 10 分、标签 5 分、摘要 3 分、正文 1 分，支持多关键词（空格分隔）
- **SEO**：Open Graph + Twitter Card + JSON-LD 结构化数据
  （文章为 `BlogPosting`，页面为 `Blog`）

### 分享图（og:image）

每篇文章可指定分享图，**放在 `public/blog/<slug>/cover.svg`**（1200×630）。
该目录原样拷贝到产物，路径可预测，适合 og:image 这类需要长期有效的地址。

没有配置时回退到站点默认图 `public/og-default.svg`，不会出现死链。

> 正文里引用的配图（`index.md` 同级的 `cover.svg`）会被 Astro 优化成
> `_astro/cover.<hash>.svg`，**hash 构建前无法预知**，因此不适合做 og:image。
> 这是两个独立的位置，别混淆。

### 改配色

所有颜色都是 CSS 变量，在 `src/styles/theme.css` 里定义。
深浅两套色分开写（浅色不是深色的反转值），
改的时候两处都要改，避免出现某个颜色只在浅色下不协调的情况。

新增 CSS 变量前先 grep 确认没有同名未使用的，避免又攒下死代码。

