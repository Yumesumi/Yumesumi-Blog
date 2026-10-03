import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { AstroIntegration } from 'astro';

/**
 * 让站点同时支持「github.io 子路径」和「自定义域名根路径」两种访问方式。
 *
 * ## 为什么需要这个插件
 *
 * 仓库名是 `Yumesumi-Blog`（不是 `用户名.github.io` 形式），所以：
 *   - 域名 yumesumi.cyou 生效前，站点在 `https://yumesumi.github.io/Yumesumi-Blog/`
 *   - 域名生效后，站点在 `https://yumesumi.cyou/`
 *
 * 两种情况需要的资源前缀不同，而 Astro 的 base 只能配一个绝对值：
 *   base: '/'              → github.io 上资源 404（子路径下找不到 /_astro/）
 *   base: '/Yumesumi-Blog' → 域名生效后资源又 404（根路径下多出前缀）
 *
 * Astro 也没有「文档相对 base」模式（`base: './'` 会被规范化成根绝对路径），
 * 所以只能构建后自行改写。
 *
 * ## 解法
 *
 * 1. 构建期把 base 设为 {@link BUILD_BASE}，让 Astro 正常生成带前缀的资源引用；
 * 2. 构建结束后遍历所有 HTML，把绝对路径按文件深度改写成文档相对路径。
 *
 * 浏览器按当前文档地址逐级解析相对路径，于是两个地址都能正常显示：
 *
 * ```text
 * 根路径  https://yumesumi.cyou/blog/hello-world/  +  ../../_astro/x.css
 *        → https://yumesumi.cyou/_astro/x.css                    ✓
 * 子路径  .../Yumesumi-Blog/blog/hello-world/      +  ../../_astro/x.css
 *        → .../Yumesumi-Blog/_astro/x.css                        ✓
 * ```
 */

/** 站点主域名。同时用于修正 canonical、og:url、sitemap。 */
const SITE_ORIGIN = 'https://yumesumi.cyou';

/** 构建期使用的 base 前缀。子路径形式，保证 Astro 能正确解析静态资源。 */
export const BUILD_BASE = '/Yumesumi-Blog';

/** 需要改写成相对路径的 HTML 属性。 */
const URL_ATTRS = ['href', 'src', 'poster', 'data-src'] as const;

/** 指向站点根的标记。 */
const SITE_ROOT = '/';

/**
 * 把「当前文件所在目录」到「站点内绝对路径」转换成文档相对路径。
 *
 * @param fromDir HTML 文件所在目录，相对于构建输出根，用 `/` 分隔。根目录传 `''`。
 * @param targetPath 站点内的绝对路径，如 `/Yumesumi-Blog/_astro/x.css` 或 `/favicon.svg`。
 * @returns 文档相对路径，如 `../../_astro/x.css`。指向站点根时返回 `../..`。
 *
 * @example
 * toRelativeUrl('blog/hello-world', '/Yumesumi-Blog/_astro/x.css') // '../../_astro/x.css'
 * toRelativeUrl('', '/favicon.svg')                                // './favicon.svg'
 * toRelativeUrl('blog', '/')                                       // '../'
 */
function toRelativeUrl(fromDir: string, targetPath: string): string {
  // 若带 base 前缀，先剥掉，得到站点内的绝对路径
  let siteAbsolute = targetPath;
  if (siteAbsolute === BUILD_BASE) {
    siteAbsolute = SITE_ROOT;
  } else if (siteAbsolute.startsWith(`${BUILD_BASE}/`)) {
    siteAbsolute = siteAbsolute.slice(BUILD_BASE.length);
  }

  // 从当前目录回到站点根需要的层级数
  const depth = fromDir === '' ? 0 : fromDir.split('/').filter(Boolean).length;
  const up = Array.from({ length: depth }, () => '..');

  // 归一化：消化空段、`.`，以及可抵消的 `../`
  const parts: string[] = [];
  for (const seg of [...up, siteAbsolute.replace(/^\/+/, '')].join('/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else parts.push('..');
    } else {
      parts.push(seg);
    }
  }

  if (parts.length === 0) {
    return up.length === 0 ? './' : `${up.join('/')}/`;
  }

  const rel = parts.join('/');
  // 已在上级目录的直接以 `..` 开头，否则补 `./` 使其成为显式相对路径
  return rel.startsWith('..') ? rel : `./${rel}`;
}

/** 递归收集目录下所有 `.html` 文件的绝对路径。 */
async function collectHtml(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectHtml(full, acc);
    } else if (entry.name.endsWith('.html')) {
      acc.push(full);
    }
  }

  return acc;
}

/** 把一个 HTML 文件里的站内绝对路径改写为相对路径，并修正 SEO 绝对地址。 */
function rewriteHtml(html: string, fromDir: string): string {
  // canonical / og:url 必须是主域名下的绝对 URL。带仓库名前缀的地址在域名
  // 生效后并不存在（站点在根路径），必须去掉前缀。
  let out = html.replace(
    new RegExp(
      `((?:rel="canonical" href|property="og:url" content)=)(["'])${SITE_ORIGIN}${BUILD_BASE}(/[^"']*)?\\2`,
      'g',
    ),
    (_m, prefix: string, quote: string, rest: string | undefined) =>
      `${prefix}${quote}${SITE_ORIGIN}${rest ?? '/'}${quote}`,
  );

  // 所有站内绝对路径 → 文档相对路径
  for (const attr of URL_ATTRS) {
    out = out.replace(
      new RegExp(`(${attr}=)(["'])(/[^"']*)\\2`, 'g'),
      (_m, prefix: string, quote: string, target: string) =>
        `${prefix}${quote}${toRelativeUrl(fromDir, target)}${quote}`,
    );
  }

  // 目录型链接补尾部斜杠。
  //
  // 为什么要补：GitHub Pages 收到 /tags 会 301 到 /tags/，但相对路径下的
  // 目录若没有尾斜杠，浏览器解析结果会少一层，直接 404。
  //
  // 判断方式：末段含扩展名（.css/.svg/.xml/...）视为文件，否则视为目录。
  // 不用「路径段是否含中文」这类白名单判断 —— 标签名经 encodeURIComponent
  // 后是 %E9%9A%8F 这种纯 ASCII 形式，会被白名单漏掉。
  const hasFileExtension = /\.[a-z0-9]{1,8}$/i;

  return out.replace(
    /(\.\/(?:\.\.\/)*[^"']+?)(["'])/g,
    (m, p1: string, quote: string) => {
      const path = p1.endsWith('/') ? p1.slice(0, -1) : p1;
      return hasFileExtension.test(path) ? m : `${path}/${quote}`;
    },
  );
}

export function relativeBase(): AstroIntegration {
  return {
    name: 'relative-base',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = new URL('./', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1');
        const htmlFiles = await collectHtml(outDir);

        let rewritten = 0;

        for (const file of htmlFiles) {
          const fromDir = relative(outDir, file).split(sep).join('/').replace(/\/?index\.html$/, '');
          const original = await readFile(file, 'utf8');
          const updated = rewriteHtml(original, fromDir);

          if (updated !== original) {
            await writeFile(file, updated, 'utf8');
            rewritten += 1;
          }
        }

        // sitemap 里的 URL 同样要去掉仓库名前缀
        for (const name of ['sitemap-index.xml', 'sitemap-0.xml']) {
          const smPath = join(outDir, name);
          if (!existsSync(smPath)) continue;

          const xml = await readFile(smPath, 'utf8');
          const fixed = xml.split(`${SITE_ORIGIN}${BUILD_BASE}`).join(SITE_ORIGIN);
          if (fixed !== xml) await writeFile(smPath, fixed, 'utf8');
        }

        logger.info(`relative-base: 已改写 ${rewritten}/${htmlFiles.length} 个 HTML 文件的路径为相对路径`);
      },
    },
  };
}
