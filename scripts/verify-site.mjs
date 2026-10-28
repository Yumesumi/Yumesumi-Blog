/**
 * 构建产物校验。
 *
 * 在 `npm run build` 之后运行，检查最容易在重构中悄悄坏掉的东西：
 *   · 域名 / CNAME / canonical / sitemap 是否指向 blog.yumesumi.cyou
 *   · 每篇已发布文章是否真的生成了页面
 *   · HTML 里的站内链接与静态资源是否都存在
 *   · 搜索索引字段是否完整
 *
 * 用法：npm run verify（会先 build）
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ORIGIN = 'https://blog.yumesumi.cyou';
const DOMAIN = 'blog.yumesumi.cyou';

const failures = [];
let checks = 0;

function check(name, ok, detail = '') {
  checks += 1;
  if (!ok) failures.push(`${name}${detail ? `：${detail}` : ''}`);
}

function mustExist(relative) {
  const full = join(DIST, relative);
  check(`产物存在 ${relative}`, existsSync(full));
  return full;
}

function walkHtml(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

// ---------- 域名与必备文件 ----------
const cnamePath = join(DIST, 'CNAME');
check('CNAME 内容', existsSync(cnamePath) && readFileSync(cnamePath, 'utf8') === DOMAIN);
check('CNAME 无尾随换行', existsSync(cnamePath) && !readFileSync(cnamePath, 'utf8').includes('\n'));

for (const file of [
  'index.html',
  '404.html',
  'about/index.html',
  'search/index.html',
  'tags/index.html',
  'robots.txt',
  'sitemap-index.xml',
  'sitemap-0.xml',
  'search-index.json',
  'favicon.svg',
  'og-default.png',
  'fonts/fonts.css',
  'brand/logo.svg',
]) {
  mustExist(file);
}

const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
check('robots.txt 指向博客域名', robots.includes(`Sitemap: ${ORIGIN}/sitemap-index.xml`));

const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
check('sitemap 使用博客域名', sitemap.includes(`<loc>${ORIGIN}/`));
check('sitemap 不含旧仓库前缀', !sitemap.includes('/Yumesumi-Blog'));

// ---------- 文章页面 ----------
for (const slug of readdirSync('src/content/blog')) {
  const source = join('src/content/blog', slug, 'index.md');
  if (!existsSync(source)) continue;

  const frontmatter = readFileSync(source, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const isDraft = /^draft:\s*true\s*$/m.test(frontmatter);
  if (!isDraft) mustExist(`blog/${slug}/index.html`);
}

// ---------- HTML 内部链接 ----------
const htmlFiles = walkHtml(DIST);
const htmlProblems = [];
const oldPrefix = [];
const assetProblems = [];

function resolveTarget(raw, fromFile) {
  if (
    raw.startsWith('#') ||
    raw.startsWith('mailto:') ||
    raw.startsWith('tel:') ||
    raw.startsWith('data:') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://')
  ) {
    if (raw.startsWith(ORIGIN)) {
      return new URL(raw).pathname;
    }
    return null;
  }

  if (raw.startsWith('/')) return raw;
  // 构建输出应使用站点绝对路径；相对路径也解析一次，方便定位问题
  return new URL(raw, `https://example.com/${fromFile.replace(/\\/g, '/').replace(/^dist\//, '')}`)
    .pathname;
}

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');

  if (/(?:href|src)="\/Yumesumi-Blog/.test(html) || html.includes(`${ORIGIN}/Yumesumi-Blog`)) {
    oldPrefix.push(file);
  }

  const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  if (!canonical || !canonical.startsWith(`${ORIGIN}/`)) {
    htmlProblems.push(`${file} canonical=${canonical ?? '(缺失)'}`);
  }

  // 只校验真正会发起请求的地址：<a href> 与资源 src。
  // canonical / og:url 是元数据，不要求对应物理文件（404 页就是例外）。
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]);
  const srcs = [...html.matchAll(/\bsrc="([^"]+)"/g)].map((match) => match[1]);

  for (const raw of [...hrefs, ...srcs]) {
    const pathname = resolveTarget(raw, file);
    if (!pathname) continue;

    const decoded = decodeURIComponent(pathname.split('?')[0].split('#')[0]);
    const target = join(DIST, decoded.endsWith('/') ? `${decoded}index.html` : decoded);

    if (!existsSync(target)) {
      assetProblems.push(`${file} -> ${raw}`);
    }
  }
}

check('HTML 无旧 base 前缀', oldPrefix.length === 0, oldPrefix.slice(0, 3).join(', '));
check('所有页面 canonical 正确', htmlProblems.length === 0, htmlProblems.slice(0, 3).join('; '));
check('站内链接与资源均存在', assetProblems.length === 0, assetProblems.slice(0, 5).join('; '));

// ---------- 搜索索引 ----------
const entries = JSON.parse(readFileSync(join(DIST, 'search-index.json'), 'utf8'));
check('搜索索引非空', Array.isArray(entries) && entries.length > 0);
check(
  '搜索索引字段完整',
  entries.every(
    (entry) =>
      typeof entry.url === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.description === 'string' &&
      Array.isArray(entry.tags) &&
      Array.isArray(entry.tagUrls) &&
      typeof entry.date === 'string' &&
      typeof entry.body === 'string',
  ),
);
check(
  '搜索索引 URL 以斜杠结尾',
  entries.every((entry) => entry.url.startsWith('/blog/') && entry.url.endsWith('/')),
);

// ---------- 输出 ----------
console.log(`verify-site: ${checks - failures.length}/${checks} 项通过`);
if (failures.length > 0) {
  console.error('');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('verify-site: 全部通过 ✓');
}
