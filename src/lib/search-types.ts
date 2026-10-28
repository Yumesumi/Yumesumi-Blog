/**
 * 搜索索引条目。
 *
 * 构建期（search-index.ts）与浏览器端（search-client.ts）共用同一份类型，
 * 避免两边各定义一份后字段悄悄漂移。
 */
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
