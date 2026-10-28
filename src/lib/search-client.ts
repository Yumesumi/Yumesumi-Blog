/**
 * 搜索交互逻辑（顶栏搜索框与搜索页共用）。
 *
 * 搜索索引由构建期生成在 `/search-index.json`。站点部署在自定义域名根路径，
 * 可以直接用 BASE_URL 拼出地址，不再需要为 github.io 子路径做运行时换算。
 */
import type { SearchEntry } from './search-types';

export type { SearchEntry };

/** 评分权重：标题 > 标签 > 摘要 > 正文 */
const W = { title: 10, tags: 5, desc: 3, body: 1 } as const;

/** 搜索索引地址。BASE_URL 始终以 `/` 结尾。 */
export function indexUrl(): string {
  return `${import.meta.env.BASE_URL}search-index.json`;
}

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

  for (const term of terms) {
    if (hay.title.includes(term)) total += W.title;
    if (hay.tags.includes(term)) total += W.tags;
    if (hay.desc.includes(term)) total += W.desc;
    if (hay.body.includes(term)) total += W.body;
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
  const normalized = query.trim().toLowerCase();
  if (!normalized) return { matched: [], terms: [] };

  const terms = normalized.split(/\s+/).filter(Boolean);

  const matched = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, terms, normalized) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry);

  return { matched, terms };
}

/** 转义 HTML，防止索引内容里的特殊字符破坏结构。 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 高亮关键词。先转义再插入 <mark>，避免 XSS。 */
export function highlight(text: string, terms: string[]): string {
  const escaped = escapeHtml(text);
  if (terms.length === 0) return escaped;

  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

/** 取正文里包含关键词的片段，让结果能看出为何命中。 */
export function excerptAround(body: string, terms: string[], length = 140): string {
  if (terms.length === 0) return body.slice(0, length);

  const lower = body.toLowerCase();
  const index = terms
    .map((term) => lower.indexOf(term))
    .filter((found) => found >= 0)
    .sort((a, b) => a - b)[0];

  if (index === undefined) return body.slice(0, length);

  const start = Math.max(0, index - 40);
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
 * 索引加载器。
 *
 * 多个组件（顶栏 + 搜索页）会同时用到，用模块级 Promise 缓存，
 * 避免重复请求同一个 JSON。失败时清空缓存，下次调用可重试。
 */
let indexPromise: Promise<SearchEntry[]> | null = null;

export function loadIndex(): Promise<SearchEntry[]> {
  indexPromise ??= fetch(indexUrl())
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<SearchEntry[]>;
    })
    .catch((error: unknown) => {
      indexPromise = null;
      throw error;
    });

  return indexPromise;
}
