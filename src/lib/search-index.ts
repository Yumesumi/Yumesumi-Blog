/**
 * 搜索索引生成。
 *
 * ## 为什么用这个方案
 *
 * 纯静态站点没有服务端，搜索只能在浏览器端做。常见做法有三种：
 *
 * 1. 索引写进每个 HTML —— 每个页面都带一份完整索引，浪费带宽
 * 2. 独立的 JSON 文件 + 浏览器 fetch —— **本方案**，只加载一次，可缓存
 * 3. 构建期分片 —— 内容量上千时才需要，现在过度设计
 *
 * 索引在构建时生成，包含标题、摘要、标签、URL 和正文纯文本。
 * 正文做了截断（默认 300 字），避免索引文件随文章增长过快。
 */
import type { Post } from './posts';
import { getPublishedPosts, tagPath } from './posts';

export interface SearchEntry {
  /** 站点内绝对路径 */
  url: string;
  title: string;
  description: string;
  tags: string[];
  /** 标签链接，搜索结果里可点击 */
  tagUrls: string[];
  date: string;
  /** 正文纯文本片段，用于内容匹配 */
  body: string;
}

/** 索引文件输出路径 */
export const SEARCH_INDEX_PATH = 'public/search-index.json';

/**
 * 每条索引保留的正文长度上限。
 *
 * 取值权衡：截得太短会搜不到文章靠后的内容（本项目一篇 1600 字的文章，
 * 存 300 字等于丢掉 80% 的可搜索范围）；存全文则索引文件随文章数线性膨胀。
 * 2000 字大约覆盖一篇长博客的绝大部分，且 100 篇文章时索引也才 1MB 量级
 * （压缩后更小），浏览器一次加载无压力。
 */
const BODY_PREVIEW_LENGTH = 2000;

/**
 * 去掉 Markdown 标记，得到可被搜索的纯文本。
 * 不做完整解析 —— 目标是「能搜到」，不是还原原文。
 */
export function toPlainText(markdown: string): string {
  return markdown
    // 代码块与行内代码先摘掉，避免搜到代码符号
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    // 图片
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // 链接保留文字
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 标题符号、引用、列表符、强调
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[*_~]/g, '')
    // HTML 注释
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从文章构建一条搜索索引条目。 */
export function toSearchEntry(post: Post, body = ''): SearchEntry {
  const plain = toPlainText(body);

  return {
    url: `/blog/${post.id}/`,
    title: post.data.title,
    description: post.data.description ?? '',
    tags: post.data.tags,
    tagUrls: post.data.tags.map(tagPath),
    date: post.data.date.toISOString().slice(0, 10),
    body: plain.length > BODY_PREVIEW_LENGTH ? `${plain.slice(0, BODY_PREVIEW_LENGTH)}…` : plain,
  };
}

/** 生成完整搜索索引。 */
export async function buildSearchIndex(): Promise<SearchEntry[]> {
  const posts = await getPublishedPosts();

  return posts.map((post) => toSearchEntry(post, post.body ?? ''));
}
