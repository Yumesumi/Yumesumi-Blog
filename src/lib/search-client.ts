/**
 * 搜索交互逻辑（顶栏搜索框与搜索页共用）。
 *
 * 抽成独立模块的原因：顶栏和搜索页都需要搜索框，
 * 若各写一份，评分权重、匹配规则、高亮逻辑会随时间不一致。
 */

export interface SearchEntry {
  url: string;
  title: string;
  description: string;
  tags: string[];
  tagUrls: string[];
  date: string;
  body: string;
}

/** 评分权重：标题 > 标签 > 摘要 > 正文 */
const W = { title: 10, tags: 5, desc: 3, body: 1 } as const;

/**
 * 定位搜索索引文件。
 *
 * 不能写绝对路径 '/search-index.json' —— 站点同时支持根路径（域名生效后）
 * 与子路径（github.io 回退地址），绝对路径在子路径下会 404。
 * `relative-base` 插件只改写 HTML 属性，改不到 JS 里的字符串，
 * 所以这里从当前文档地址逐级上溯到站点根。
 */
export function indexUrl(doc: Document = document): string {
  // 从页面上的 <base> 或已知标记推断站点根；退回用相对路径上溯。
  const marker = doc.querySelector<HTMLAnchorElement>('[data-site-root]');
  if (marker) return new URL('search-index.json', new URL(marker.href, location.href)).href;

  // 页面 URL 形如 <root>/search/ 或 <root>/blog/xxx/
  const path = location.pathname;
  const depth = path.split('/').filter(Boolean).length;
  const up = Array.from({ length: depth }, () => '..');
  return new URL([...up, 'search-index.json'].join('/'), location.href).href;
}

/** 取整条记录的可搜索文本（小写）。 */
function haystacks(entry: SearchEntry) {
  return {
    title: entry.title.toLowerCase(),
    tags: entry.tags.join(' ').toLowerCase(),
    desc: entry.description.toLowerCase(),
    body: entry.body.toLowerCase(),
  };
}

/** 打分：任一关键词命中即得分，完整短语额外加权。 */
export function scoreEntry(entry: SearchEntry, terms: string[], phrase: string): number {
  const hay = haystacks(entry);
  let total = 0;

  for (const t of terms) {
    if (hay.title.includes(t)) total += W.title;
    if (hay.tags.includes(t)) total += W.tags;
    if (hay.desc.includes(t)) total += W.desc;
    if (hay.body.includes(t)) total += W.body;
  }

  // 完整短语命中说明用户意图明确，额外加权
  if (terms.length > 1 && phrase && hay.title.includes(phrase)) total += 8;

  return total;
}

/** 执行搜索，返回按得分降序排列的结果。 */
export function runSearch(
  entries: SearchEntry[],
  query: string,
): { matched: SearchEntry[]; terms: string[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { matched: [], terms: [] };

  const terms = q.split(/\s+/).filter(Boolean);

  const matched = entries
    .map((entry) => ({ entry, s: scoreEntry(entry, terms, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.entry);

  return { matched, terms };
}

/** 转义 HTML，防止索引内容里的特殊字符破坏结构。 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 高亮关键词。先转义再插入 <mark>，避免 XSS。 */
export function highlight(text: string, terms: string[]): string {
  const escaped = escapeHtml(text);
  if (terms.length === 0) return escaped;

  const pattern = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

/** 取正文里包含关键词的片段，让结果能看出为何命中。 */
export function excerptAround(body: string, terms: string[], length = 120): string {
  if (terms.length === 0) return body.slice(0, length);

  const lower = body.toLowerCase();
  const idx = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];

  if (idx === undefined) return body.slice(0, length);

  const start = Math.max(0, idx - 40);
  const prefix = start > 0 ? '…' : '';
  return prefix + body.slice(start, start + length);
}

/** 格式化日期为 2026/10/03。 */
export function formatIndexDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * 把索引里的站内绝对路径解析成当前站点下可用的 URL。
 *
 * 索引里的 `url` / `tagUrls` 是 `/blog/xxx/` 这种站点根绝对路径。
 * 但站点同时支持两个地址：
 *   - 根路径    https://yumesumi.cyou/blog/xxx/
 *   - 子路径    https://yumesumi.github.io/Yumesumi-Blog/blog/xxx/
 * 直接赋值给 `location.href` 或 `<a href>` 时，绝对路径会丢掉子路径前缀，
 * 在 github.io 回退地址下 404。
 *
 * `relative-base` 插件只改写 HTML 里已有的属性，改不到 JS 运行期
 * 动态创建的节点，所以这里在运行时按当前页面深度换算成相对路径。
 */
export function toSiteUrl(path: string, doc: Document = document): string {
  if (/^https?:\/\//.test(path)) return path;

  // 文档里的 <a data-site-root> 指向站点根（BaseLayout 渲染时带上）
  const marker = doc.querySelector<HTMLAnchorElement>('[data-site-root]');
  if (marker) return new URL(path, new URL(marker.href, location.href)).href;

  // 退化方案：按当前页面路径深度逐级上溯
  const depth = location.pathname.split('/').filter(Boolean).length;
  const up = Array.from({ length: depth }, () => '..');
  return new URL([...up, path.replace(/^\//, '')].join('/'), location.href).href;
}

/** 索引加载器。
 *
 * 多个组件（顶栏 + 搜索页）会同时用到，用模块级 Promise 缓存，
 * 避免重复请求同一个 JSON。
 */
let indexPromise: Promise<SearchEntry[]> | null = null;

export function loadIndex(): Promise<SearchEntry[]> {
  indexPromise ??= fetch(indexUrl())
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .catch((err) => {
      // 失败时清空缓存，下次调用可重试
      indexPromise = null;
      throw err;
    });

  return indexPromise;
}
