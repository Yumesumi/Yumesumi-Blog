# AGENTS.md

给后续在这个项目上工作的 AI Agent（或人）的接手指南。
读完这一份就能安全动手，不用先翻其他文件猜上下文。

---

## 项目是什么

个人博客，**https://yumesumi.cyou/**，Astro 7 纯静态站点，托管在 GitHub Pages。
源码 https://github.com/Yumesumi/Yumesumi-Blog（**必须保持 public**）。

技术栈与设计决策详见 [docs/architecture.md](docs/architecture.md)，本文只讲怎么干活。

---

## 环境准备

```bash
# Node 22.12+（项目锁 22.22.2，见 .nvmrc）
export PATH="/c/Users/Yumesumi/.workbuddy/binaries/node/versions/22.22.2-3:$PATH"
node -v   # 应输出 v22.22.2
```

Windows 上用 **Git Bash**。注意 Git Bash 会把 `/Yumesumi-Blog` 这类参数
当路径转换，传给 node 脚本时要加：

```bash
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
```

npm 默认源已配 `npmmirror`（`~/.npmrc`）。

---

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 本地开发服务器 → http://localhost:4321 |
| `npm run check` | TypeScript 类型检查（不产出文件） |
| `npm run build` | 构建到 `dist/` |
| `npm run verify` | **check + build**，提交前跑这个 |
| `npm run preview` | 预览 `dist/` 的真实效果 |
| `bash scripts/new-post.sh "标题" 标签` | 生成新文章骨架 |
| `node scripts/gen-test-posts.mjs` | 生成 30 篇搜索测试数据（临时） |
| `node scripts/verify-search.mjs` | 跑搜索断言（需先 build） |

推送（本机有 SOCKS5 代理，GitHub 必须走代理）：

```bash
git add -A
git commit -m "..."
git -c http.proxy=socks5://127.0.0.1:10808 push
```

> 代理参数**不要**写进 git 全局配置 —— 用户代理不是常开，写死会在
> 代理关闭时弄坏 git。用一次性 `-c` 参数。

---

## 提交前必须做的

```bash
npm run verify        # 0 errors 才能提交
```

改了 `src/plugins/relative-base.ts` 或任何影响 URL 生成的地方，额外验证：

```bash
npm run build
grep -o 'href="[^"]*\.css"' dist/index.html              # 应为 ./_astro/...
grep -o 'href="[^"]*\.css"' dist/blog/*/index.html        # 应为 ../../_astro/...
grep -o 'rel="canonical" href="[^"]*"' dist/index.html     # 应无 /Yumesumi-Blog 前缀
grep -o 'https://[^<]*' dist/sitemap-0.xml | head -3      # 应全为 https://yumesumi.cyou/
ls dist/tags/                                             # 中文目录名，未被编码
```

---

## 九个必须知道的坑

这些都真实踩过，动手前先看一遍。

### 1. Astro 7 的 API 和网上教程不一致

网上教程（含 AI 生成的方案）几乎全是 Astro 4/5 写法，照抄会报错。

| 旧写法（≤5） | Astro 7 正确写法 |
| --- | --- |
| `src/content/config.ts` | `src/content.config.ts`（在 `src/` 下，不在 `src/content/` 里） |
| `type: 'content'` | 删除，改用 `loader: glob({...})` |
| `post.render()` | `render(post)`，从 `astro:content` 导入 |
| `post.slug` | `post.id`；schema 里**禁用** `slug` 字段 |
| `import { z } from 'astro:content'` | `from 'astro/zod'` |
| `shikiConfig: { theme }` | `shikiConfig: { themes: { light, dark } }` |

### 2. glob loader 必须配 `generateId`

不配的话 `index.md` 不会被折叠成父目录名，URL 变成 `/blog/xxx/index/`。
**不会报错**，只是 URL 变难看，很容易漏。

`src/content.config.ts` 里第一行 `.replace(/\\/g, '/')` 是 **Windows 必需**。

### 3. Astro 7 的 Sätteri 管线不消费 rehype 插件，且**静默失效**

不报错、不警告、效果直接消失。

需要 rehype 插件时必须装 `@astrojs/markdown-remark` 并显式配
`processor: unified({...})`。当前方案是零插件，TOC 手渲，不受影响。

### 4. `base` 必须是字面量

```js
base: BUILD_BASE          // ✗ Astro 静态分析拿不到，会得到 undefined
base: '/Yumesumi-Blog'    // ✓ 字面量
```

### 5. `getStaticPaths` 的 `params` 不能手动编码

```js
params: { tag: encodeURIComponent(tag) }   // ✗ 双重编码，NoMatchingStaticPathFound
params: { tag }                            // ✓ Astro 自己会编码
```

`encodeURIComponent` 只用在**生成链接**的地方（`lib/posts.ts` 的 `tagPath`）。

### 6. `post.body` 是可选字段

Astro 7 的 `DataEntry` 里 `body?: string`，glob loader **不保证填充**。
直接 `estimateReadingMinutes(post.body)` 会在构建时崩
（`Cannot read properties of undefined`）。

正文原文要从页面层显式传给布局，并做空值兜底。

### 7. 配置文件里不能静态 import 依赖 `astro:content` 的模块

`astro.config.mjs` 在 Astro 初始化**之前**被加载，此时 `astro:content`
虚拟模块还不存在。若配置文件（哪怕是间接）静态 import 了依赖它的模块，
会直接失败：

```text
Unable to load your Astro config
Cannot find module 'astro:content' imported from src/lib/posts.ts
```

因此：**新的构建插件不要静态 import 业务模块。**

搜索索引最初就是写成插件的，踩了这个坑 —— 改用
`src/pages/search-index.json.ts` 这个 endpoint 后正常：
endpoint 由 Astro 正常编译，能访问 `astro:content`，
且资源路径自动适配「根路径 / 子路径」两种访问方式。

### 8. JS 里不能用绝对路径 fetch 站内资源

`relative-base` 插件只改写 HTML 里的 `href`/`src` 属性，
**JS 里的 `fetch('/xxx')` 不会被改写**。子路径访问时会 404。

```js
fetch('/search-index.json')                    // ✗ 子路径下 404
new URL('../search-index.json', location.href)  // ✓ 从当前页面上溯
```

同理，`robots.txt` 里的 `Sitemap:` 用绝对 URL 反而是对的（那是给爬虫看的）。

### 9. JS 动态创建的节点也要用 `toSiteUrl()` 换算路径

比坑 8 更隐蔽的一层：不只是 `fetch`，**JS 运行期创建的 `<a href>` 和
`location.href` 赋值**同样不受 `relative-base` 插件照顾。

搜索索引里的 `url` 字段是 `/blog/xxx/`（站点根绝对路径）。直接赋给
`location.href`，在 `github.io/Yumesumi-Blog/` 下会丢掉子路径前缀 → 404。

**统一用 `src/lib/search-client.ts` 的 `toSiteUrl()`**：

```js
import { toSiteUrl } from '../lib/search-client';

a.href = toSiteUrl(entry.url);          // ✓
location.href = toSiteUrl(matched[0].url); // ✓
```

它靠 Header 里的 `<a data-site-root>` 标记确定站点根 —— 该链接的 `href`
已被插件改写成 `./` 或 `../../`，所以 `marker.href` 在两种地址下都正确。

> 加新的动态链接功能时，先问一句：这个路径是绝对的还是相对的？
> 站点根绝对路径在子路径下必然出错。

---

## 改代码时的约定

### 分层

```text
pages/       路由与组装
  ↓
layouts/     页面骨架
  ↓
components/  无状态 UI（props 进，slot 出）
  ↓
lib/         纯逻辑，不依赖 Astro 运行时
```

**业务逻辑放 `lib/`，不要堆在组件里。** 判断标准：这段逻辑换个页面还用得上吗？
用得上就放 `lib/`。已经有两个共享模块：

- `lib/posts.ts` —— 文章查询、标签统计、标签路径
- `lib/format.ts` —— 日期格式化、阅读时长

重构前草稿过滤在 5 个页面各写一遍、日期格式化写了 2 份（参数还不一致），
就是因为没遵守这条。**新逻辑先找 `lib/` 有没有现成函数。**

### 组件写法

```astro
---
interface Props {
  post: Post;
  showSomething?: boolean;
}
const { post, showSomething = false } = Astro.props satisfies Props;
---
<slot />
<style>/* Astro 自动 scope */</style>
```

- props 必须用 `satisfies Props` 校验
- 样式写在组件内 `<style>` 块，共享样式才放 `src/styles/`
- 组件不要有内部状态

### CSS 约定

- 颜色一律用 `src/styles/theme.css` 的变量，**不要写死色值**
- 改配色**深浅两套都要改**（浅色不是深色的反转）
- **`.prose` 正文区必须实色**，不能有 `background-image` / `gradient` /
  `backdrop-filter`。这是硬性要求，为了中文长文可读性
- 新增令牌前先 grep 确认没有同名未使用的

### 写内容

- 位置 `src/content/blog/<slug>/index.md`，slug 用英文小写连字符
- 配图与 `index.md` 同级，正文用 `./cover.png` 引用
- **图片必须真实存在**，否则构建报 `ImageNotFound` 整个失败
- 必填字段 `title`、`date`
- 改关于页编辑 `src/content/pages/about.md`

---

## 验证清单

改完代码后按需检查：

```bash
npm run verify                                    # 必做

# 视觉/交互改动，用真实浏览器验证
npm run build && npm run preview                  # 另开终端
```

浏览器验证要点（可用 Playwright）：

- 正文区 `getComputedStyle(.prose).backgroundImage === 'none'`
- 深浅两套主题下对比度 ≥ 4.5:1
- 刷新无 FOUC（首帧就是正确主题）
- TOC 每条链接都能跳转，且 TOC 不在 `.prose` 内部
- 站内链接点击后 200，无 404

---

## 部署相关

- **仓库必须 public**：免费版 GitHub Pages 不支持私有仓库，
  设 private 会让站点立刻不可用
- **Pages Source 必须是 `GitHub Actions`**：不是 gh-pages 分支，
  官方 action 不产生该分支，设错部署失败
- 部署工作流：push 到 `main` → Actions 自动构建发布 → 约 1 分钟上线
- 失败时看 https://github.com/Yumesumi/Yumesumi-Blog/actions

---

## 不要做的事

| 别做 | 原因 |
| --- | --- |
| 删掉 `relative-base` 插件 | 会导致 github.io 回退地址样式全失 |
| 给 `base` 加条件判断 | Astro 静态分析拿不到变量值 |
| 在 `.prose` 上加渐变 | 违反中文可读性硬性要求 |
| 改 `theme.css` 只改一套 | 另一套会不协调 |
| 删 `CodeCopyButton` 里的 `execCommand` 降级 | 非 HTTPS 环境唯一可用的复制方式 |
| 把代理写进 git 全局配置 | 用户代理非常开，会弄坏 git |
| 手动改 `public/CNAME` 加换行 | Pages 域名设置会失败 |

---

## ⚠️ 搜索测试数据（临时，测完请清理）

`src/content/blog/test-post-01` … `test-post-30` 是搜索功能测试数据，
**不是正式内容**。它们会被搜索引擎收录，正式发布前应清理掉。

```bash
# 清理：删掉全部 30 篇测试文章
node scripts/gen-test-posts.mjs --clean

# 清理后必须重新构建，否则 dist 和线上仍有这些页面
npm run build

git add -A && git commit -m "chore: 移除搜索测试数据" && \
  git -c http.proxy=socks5://127.0.0.1:10808 push
```

**判断是否为测试数据**：目录名以 `test-post-` 开头。正式文章不会有这个前缀。

### 这些数据的价值

想验证搜索改动是否破坏了功能时，可以重新生成：

```bash
node scripts/gen-test-posts.mjs    # 生成 30 篇
npm run build
node scripts/verify-search.mjs    # 跑 42 项断言
```

`scripts/verify-search.mjs` 校验 7 类场景：唯一标记词精确命中、
英文大小写不敏感、标签召回、多关键词组合、无结果、
边界情况数据完整性、页面已生成。

**测试数据的设计要点**（改脚本时注意）：每篇带一个唯一标记词
（如「紫石英」），搜它必须命中对应文章 —— 这样能验证**精度**，
而不只是"能搜到东西"。若正文里互相提到对方的标记词，
唯一性就失效了，精确度测试也就失去意义。

刻意保留一组共享标记词（「星云」两篇），用于验证同分时的排序稳定性。

---

## 长期待办

- **约 3 个月后回访** `https://yumesumi.cyou/` 确认证书状态
  （Cloudflare 橙云会影响 GitHub 证书续期，见 `docs/force-https.md`）
- 引入测试框架（目前只有构建期校验与 `verify-search.mjs`，无单元测试）
- 归档页（当时明确不做，需要时可加 `src/pages/archive.astro`）
- **清理搜索测试数据**（见上一节，测完就删）
