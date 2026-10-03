import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * 内容查询与处理的公共逻辑。
 *
 * 之前这些逻辑散落在各页面里重复实现（草稿过滤出现 5 次、
 * 日期格式化 2 次），改一处漏一处容易出 bug。收敛到这里。
 */

export type Post = CollectionEntry<'blog'>;

/** 只保留已发布文章。草稿不生成页面，也不进列表。 */
const PUBLISHED = ({ data }: Post): boolean => data.draft !== true;

/**
 * 取全部已发布文章，按日期倒序（新的在前）。
 * 同一天的文章用 id 兜底排序，保证构建输出稳定可复现。
 */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', PUBLISHED);

  return posts.sort(
    (a: Post, b: Post) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id),
  );
}

/**
 * 取已发布文章并让置顶的排在最前。
 * 首页和文章列表用这个。
 */
export async function getPublishedPostsPinnedFirst(): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return posts.sort((a, b) => Number(b.data.pinned) - Number(a.data.pinned));
}

/** 统计所有标签及各自文章数，按数量降序、名称升序。 */
export async function getTagCounts(): Promise<Map<string, number>> {
  const posts = await getPublishedPosts();
  const counts = new Map<string, number>();

  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return new Map(
    [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'),
    ),
  );
}

/**
 * 把标签拼成站内链接的路径片段。
 *
 * 注意：只在**生成链接**时编码。`getStaticPaths` 的 `params` 必须传原始值，
 * Astro 会自行编码 —— 手动编码会造成双重编码导致路径匹配不上。
 */
export function tagPath(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}/`;
}
