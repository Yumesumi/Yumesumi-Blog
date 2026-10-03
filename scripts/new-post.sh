#!/usr/bin/env bash
#
# 新建一篇文章的脚手架
#
# 用法：
#   bash scripts/new-post.sh "文章标题" [标签1] [标签2]
#
# 例：
#   bash scripts/new-post.sh "我的新文章" 技术 前端
#   bash scripts/new-post.sh "读后感" 随笔
#
# 会生成：src/content/blog/<slug>/index.md
# 然后你只需要填 title / date / 正文，push 即可上线。

set -euo pipefail

# ---------- 参数检查 ----------
if [ $# -lt 1 ]; then
  echo "用法: bash scripts/new-post.sh \"文章标题\" [标签1] [标签2] ..."
  echo "例:   bash scripts/new-post.sh \"我的新文章\" 技术 前端"
  exit 1
fi

TITLE="$1"
shift
TAGS=("$@")

# ---------- 生成 slug（中文标题转拼音太复杂，这里用日期+序号） ----------
DATE=$(date +%Y-%m-%d)
SLUG="post-${DATE//-/}-${RANDOM}"
DIR="src/content/blog/${SLUG}"

if [ -e "$DIR" ]; then
  echo "错误: 目录已存在 $DIR"
  exit 1
fi

mkdir -p "$DIR"

# ---------- 处理标签 ----------
TAGS_LINE=""
if [ ${#TAGS[@]} -gt 0 ]; then
  TAGS_LINE="tags: ["
  for i in "${!TAGS[@]}"; do
    [ $i -gt 0 ] && TAGS_LINE+=", "
    TAGS_LINE+="'${TAGS[$i]}'"
  done
  TAGS_LINE+="]"
fi

# ---------- 生成 index.md ----------
cat > "$DIR/index.md" << EOF
---
title: ${TITLE}
date: ${DATE}
description: TODO 用一两句话概括这篇内容，会显示在列表卡片和搜索结果里。
${TAGS_LINE}
---

<!-- 从这里开始写正文，删掉这个注释。 -->

## 第一个小节

正文写这里，支持标准 Markdown：

- 列表
- **加粗**、*斜体*、\`行内代码\`
- [链接](https://example.com)

> 引用块

\`\`\`js
// 代码块带语法高亮，右上角有复制按钮
console.log('hello');
\`\`\`

## 另一个小节

每个 \`##\` 二级标题都会自动出现在右侧目录里，不用手动维护。
EOF

echo "已创建: $DIR/index.md"
echo ""
echo "接下来:"
echo "  1. 编辑 $DIR/index.md，把 TODO 换成真实摘要，并删掉示例正文"
echo "  2. 需要配图时：把图片文件放进 $DIR/ 再在正文写 !\\[说明\\](./图片名)"
echo "     （图片必须真实存在，否则构建会报 ImageNotFound 失败）"
echo "  3. 预览: npm run dev"
echo "  4. 校验并发布: npm run build && git add -A && git commit -m \"feat: 添加《${TITLE}》\" && git push"
echo ""
echo "提示: 目录名 $SLUG 可以随便改（英文小写加连字符即可），"
echo "      改了之后网站 URL 会跟着变。"
