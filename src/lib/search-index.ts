/**
 * 搜索索引生成（构建期）。
 *
 * 纯静态站点没有服务端，搜索只能在浏览器端做。索引在构建时生成，
 * 包含标题、摘要、标签、URL 和正文纯文本，浏览器只加载一次并可缓存。
 */
import type { Post } from './posts';
import type { SearchEntry } from './search-types';
import { getPublishedPosts, tagPath } from './posts';

/**
 * 每条索引保留的正文长度上限。
 *
 * 2000 字大约覆盖一篇长博客的绝大部分；100 篇文章时索引也在 1MB 量级，
 * 浏览器一次加载无压力。
 */
const BODY_PREVIEW_LENGTH = 2000;

/**
 * 去掉 Markdown 标记，得到可被搜索的纯文本。
 * 不做完整解析 —— 目标是「能搜到」，不是还原原文。
 */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[*_~]/g, '')
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
