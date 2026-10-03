/**
 * 日期与文本格式化。
 *
 * 集中管理是为了保证 `<time datetime>` 的机器可读值和
 * 页面上的中文文本始终来自同一次格式化，不会出现不一致。
 */

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let fmt = dateFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('zh-CN', options);
    dateFormatters.set(key, fmt);
  }
  return fmt;
}

/** 紧凑日期，用于列表卡片：2026/10/03 */
export function formatDateShort(date: Date): string {
  return formatter({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** 完整日期，用于文章页：2026年10月3日 */
export function formatDateLong(date: Date): string {
  return formatter({ year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

/** 机器可读时间，填进 `<time datetime>` */
export function toISO(date: Date): string {
  return date.toISOString();
}

/**
 * 估算阅读时长（分钟）。
 *
 * 中文没有空格分词，不能像英文那样按 `split(/\s+/)` 数词数 ——
 * 那样一篇千字中文会被算成 1 分钟，严重偏小。
 *
 * 这里按「字符数 + 西文单词数」混合估算：
 * - CJK 字符按 400 字/分钟
 * - 西文单词按 200 词/分钟
 * 两者相加后向上取整，最少 1 分钟。
 */
export function estimateReadingMinutes(text: string): number {
  // 去掉代码块和 Markdown 标记，避免把代码算进阅读量
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#>*_~|]/g, '');

  // CJK 字符（中日韩统一表意文字 + 中文标点）
  const cjkCount = (cleaned.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) ?? []).length;
  // 西文单词
  const wordCount = (cleaned.match(/[a-zA-Z0-9]+(?:['-][a-zA-Z0-9]+)*/g) ?? []).length;

  const minutes = cjkCount / 400 + wordCount / 200;
  return Math.max(1, Math.round(minutes));
}
