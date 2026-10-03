import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const exists = existsSync;

/**
 * 让站点同时支持「github.io 子路径」和「自定义域名根路径」两种访问方式。
 *
 * 问题
 * ----
 * 仓库名是 `Yumesumi-Blog`（不是 `用户名.github.io` 形式），所以：
 *   - 域名 yumesumi.cyou 生效前，站点在 https://yumesumi.github.io/Yumesumi-Blog/
 *   - 域名生效后，站点在 https://yumesumi.cyou/
 *
 * 两种情况需要的资源前缀不同，而 Astro 的 base 只能配一个绝对值。
 * 配错了，另一个地址就会因为资源 404 而完全没有样式。
 *
 * 解法
 * ----
 * 1. 构建期把 base 设为子路径 `/Yumesumi-Blog`，让 Astro 正常生成带前缀的资源引用；
 * 2. 构建结束后（本插件的 astro:build:done 钩子）遍历所有 HTML，
 *    把其中的绝对路径 `/Yumesumi-Blog/xxx` 按当前文件的目录深度
 *    改写成文档相对路径 `../../xxx`。
 *
 * 浏览器解析相对路径时以当前文档地址为基准：
 *   - https://yumesumi.cyou/blog/hello-world/  +  ../../_astro/x.css
 *     → https://yumesumi.cyou/_astro/x.css                ✓
 *   - https://yumesumi.github.io/Yumesumi-Blog/blog/hello-world/ + ../../_astro/x.css
 *     → https://yumesumi.github.io/Yumesumi-Blog/_astro/x.css  ✓
 *
 * 于是两个地址都能正常显示，域名切换时不需要改任何配置。
 */

/** 构建期使用的 base 前缀。子路径形式，保证 Astro 能正确解析静态资源。 */
export const BUILD_BASE = '/Yumesumi-Blog';

/** 需要改写的 HTML 属性 */
const URL_ATTRS = ['href', 'src', 'poster', 'data-src'];

/** 明确不该改写的绝对 URL（协议、锚点、邮件等本就不受影响，这里只是语义上排除） */
const SKIP_PREFIXES = ['http://', 'https://', '//', 'mailto:', 'tel:', 'data:', '#'];

/**
 * 把「当前文件所在目录」到「站点内绝对路径」转换成文档相对路径。
 *
 * 例：文件在 dist/blog/hello-world/index.html
 *   target '/Yumesumi-Blog/_astro/x.css' → '../../_astro/x.css'
 *   target '/favicon.svg'                → '../../favicon.svg'
 *   target '/'                           → '../../'
 */
function toRelativeUrl(fromDir, targetPath) {
  // 若带 base 前缀，先剥掉，得到站点内的绝对路径
  let siteAbsolute = targetPath;
  if (siteAbsolute === BUILD_BASE) {
    siteAbsolute = '/';
  } else if (siteAbsolute.startsWith(BUILD_BASE + '/')) {
    siteAbsolute = siteAbsolute.slice(BUILD_BASE.length);
  }

  // 计算从当前文件所在目录回到站点根需要的层级
  const depth = fromDir === '' ? 0 : fromDir.split('/').filter(Boolean).length;
  const up = depth === 0 ? [] : Array.from({ length: depth }, () => '..');

  const normalized = siteAbsolute.replace(/^\/+/, '');
  const joined = [...up, normalized].join('/');

  // 归一化：消化 ./ 和可抵消的 ../
  const parts = [];
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else parts.push('..');
    } else {
      parts.push(seg);
    }
  }

  if (parts.length === 0) {
    // 指向站点根
    return up.length === 0 ? './' : `${up.join('/')}/`;
  }

  const rel = parts.join('/');
  // 已在上级目录的直接用 ../ 开头，否则补 ./ 前缀使其成为显式相对路径
  return rel.startsWith('..') ? rel : `./${rel}`;
}

/** 递归收集所有 html 文件 */
async function collectHtml(dir, acc = []) {
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

export function relativeBase() {
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
          let updated = original;

          // 1) 修正 canonical / og:url：这些必须是站点主域名下的绝对 URL，
          //    不能带仓库名前缀（域名生效后站点在根路径，带前缀就是错地址），
          //    也不能是相对路径。
          updated = updated.replace(
            new RegExp(`((?:rel="canonical" href|property="og:url" content)=)(["'])https://[^"']*?/Yumesumi-Blog(/[^"']*)?\\2`, 'g'),
            (_m, prefix, quote, rest) =>
              `${prefix}${quote}https://yumesumi.cyou${rest || '/'}${quote}`,
          );

          for (const attr of URL_ATTRS) {
            // 匹配所有站内绝对路径：href="/..."、src="/..."
            const re = new RegExp(`(${attr}=)(["'])(/[^"']*)\\2`, 'g');
            updated = updated.replace(re, (_match, prefix, quote, target) => {
              const rel = toRelativeUrl(fromDir, target);
              return `${prefix}${quote}${rel}${quote}`;
            });
          }

          // 2) 目录型链接补回尾部斜杠。
          //    GitHub Pages 会把 /tags 301 到 /tags/，但相对路径下的目录
          //    如果没有尾斜杠，解析结果会少一层，直接 404。
          updated = updated.replace(
            /(\.\/(?:\.\.\/)*[A-Za-z0-9_\u4e00-\u9fa5-]+)(["'])/g,
            (m, p1, quote) => (p1.endsWith('/') ? m : `${p1}/${quote}`),
          );

          if (updated !== original) {
            await writeFile(file, updated, 'utf8');
            rewritten += 1;
          }
        }

        // 3) sitemap 里的 URL 同样要去掉仓库名前缀。
          //    域名生效后站点在根路径，带 /Yumesumi-Blog/ 前缀的地址都不存在。
        for (const name of ['sitemap-index.xml', 'sitemap-0.xml']) {
          const smPath = join(outDir, name);
          if (!(await exists(smPath))) continue;
          const xml = await readFile(smPath, 'utf8');
          const fixed = xml.replace(
            /https:\/\/yumesumi\.cyou\/Yumesumi-Blog/g,
            'https://yumesumi.cyou',
          );
          if (fixed !== xml) await writeFile(smPath, fixed, 'utf8');
        }

        logger.info(`relative-base: 已改写 ${rewritten}/${htmlFiles.length} 个 HTML 文件的路径为相对路径`);
      },
    },
  };
}
