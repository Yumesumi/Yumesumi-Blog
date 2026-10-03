---
title: Markdown 语法指南
description: 梦澄博客支持的 Markdown 语法速查表，包括标题、代码块、表格、引用、任务列表等，写文章前可以先看这篇。
tags: ['教程', 'Markdown', '前端']
date: 2026-10-02
---

这篇是语法速查表。写新文章时可以对照着看，**右侧目录**也能帮你快速跳转。

下面这张图用的是相对路径引用，图片和本文放在同一个文件夹里：

![星云紫渐变示意](./cover.svg)

## 标题层级

支持从 `#` 到 `######` 六级标题。正文里从 `##` 开始用即可，一篇文章只有一个 `#`。

```markdown
## 二级标题
### 三级标题
#### 四级标题
```

## 段落与强调

普通段落，直接写就行。空一行就是新段落。

**加粗**用两个星号，*斜体*用一个星号，`行内代码`用反引号。

~~删除线~~用两个波浪号。

> 引用块用 `>` 开头。
> 可以写多行，也可以嵌套其他语法，比如 **加粗** 和 `代码`。
>
> > 这是嵌套的引用，适合放别人引的话。

## 列表

无序列表：

- 第一项
- 第二项
- 第三项
  - 嵌套的子项（前面加两个空格）

有序列表：

1. 打开编辑器
2. 写 Markdown
3. 提交推送

任务列表：

- [x] 搭建博客框架
- [x] 写第一篇文章
- [ ] 补充更多内容
- [ ] 定制自己的样式

## 代码块

用三个反引号包起来，指定语言就有语法高亮。右上角有一个复制按钮，点一下就能把代码复制走。

### JavaScript

```javascript
function greet(name) {
  const message = `你好，${name}`;
  console.log(message);
  return message;
}

const result = greet('梦澄');
```

### CSS

```css
.prose {
  background: var(--prose-bg);
  border-radius: 12px;
  padding: 2.5rem;
}
```

### Shell

```bash
# 本地预览
npm run dev

# 构建
npm run build

# 推送（走代理）
git -c http.proxy=socks5://127.0.0.1:10808 push -u origin main
```

### TypeScript

```typescript
interface Post {
  slug: string;
  title: string;
  date: Date;
  tags: string[];
  draft: boolean;
}

function sortByDate(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.date.getTime() - a.date.getTime());
}
```

## 表格

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | :---: | --- |
| `title` | string | 是 | 文章标题 |
| `date` | date | 是 | 发布日期 |
| `description` | string | 否 | 列表摘要 |
| `tags` | string[] | 否 | 标签，默认空数组 |
| `draft` | boolean | 否 | 默认 `false` |
| `pinned` | boolean | 否 | 默认 `false` |

## 分隔线

用三个短横线单独一行：

---

## 链接

行内链接用方括号加圆括号：[访问 Astro 官网](https://astro.build/)

也可以只写链接地址：<https://yumesumi.cyou>

## 图片

标准语法是 `![说明文字](图片路径)`：

```markdown
![星云紫渐变示意](./cover.svg)
```

图片和本文放在同一个文件夹，用 `./` 开头引用。移动文章文件夹时图片会跟着一起走。

## 一些实用技巧

写长文时，可以用 `##` 把内容切成小节，右侧目录会自动生成，方便读者跳转。

文章头部信息里的 `description` 别忘了写——它会用在列表卡片的摘要和搜索引擎结果里，不写就只能自动截取正文前 160 个字符，效果通常不好。
