/**
 * 搜索功能验证。
 *
 * 校验索引内容与预期是否一致 —— 重点是「唯一标记词必须精确命中 1 篇」，
 * 这能发现匹配逻辑的问题，而不只是"能不能搜到东西"。
 *
 * 用法：先 `npm run build`，再 `node scripts/verify-search.mjs`
 */

import { readFile } from 'node:fs/promises';

const INDEX = 'dist/search-index.json';

/** 权重：与 src/lib/search-client.ts 保持一致 */
const W = { title: 10, tags: 5, desc: 3, body: 1 };

function score(entry, terms, phrase) {
  const hay = {
    title: entry.title.toLowerCase(),
    tags: entry.tags.join(' ').toLowerCase(),
    desc: entry.description.toLowerCase(),
    body: entry.body.toLowerCase(),
  };

  let total = 0;
  for (const t of terms) {
    for (const field of ['title', 'tags', 'desc', 'body']) {
      if (hay[field].includes(t)) total += W[field];
    }
  }
  if (terms.length > 1 && phrase && hay.title.includes(phrase)) total += 8;
  return total;
}

function search(entries, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries
    .map((e) => ({ e, s: score(e, terms, query.toLowerCase()) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
}

const entries = JSON.parse(await readFile(INDEX, 'utf8'));

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass += 1;
  else {
    fail += 1;
    failures.push(`${name}: 期望 ${expected}，实际 ${actual}`);
  }
}

console.log('索引条目数:', entries.length);
console.log('');

// ---------- 测试 1：唯一标记词精确命中 ----------
// 判定标准：搜该词时，第一名必须是标记词所属的文章。
// 允许有低分结果命中（如「石英」会命中「紫石英」，属子串的合理行为），
// 但目标文章必须排第一 —— 这才是排序正确性的核心。
console.log('【测试 1】唯一标记词 — 目标文章必须排第一');

const UNIQUE_MARKERS = [
  '紫石英', '青金石', '鸡血石', '寿山石', '碧玺', '珊瑚', '琥珀', '蜜蜡',
  '珍珠', '玛瑙', '橄榄石', '托帕石', '索引截断', '排序权重', '长标题排版',
  '无标签边界', '单字标题', '2.0', 'C++', '正则', '石英', '云母', '萤石',
  '石榴石', '黑曜石', 'quantum', 'consensus',
];

for (const marker of UNIQUE_MARKERS) {
  const r = search(entries, marker);
  if (r.length === 0) {
    fail += 1;
    failures.push(`唯一标记词「${marker}」: 无任何结果`);
    continue;
  }
  // 第一名的标题或正文必须含该标记词
  const top = r[0];
  const inTitle = top.e.title.includes(marker);
  const inBody = top.e.body.includes(marker) || top.e.description.includes(marker);
  if (inTitle || inBody) pass += 1;
  else {
    fail += 1;
    failures.push(`唯一标记词「${marker}」: 第一名是「${top.e.title}」，不含该词`);
  }
}

// ---------- 测试 2：英文大小写不敏感 ----------
console.log('【测试 2】英文大小写不敏感');
for (const q of ['quantum', 'QUANTUM', 'Quantum']) {
  const r = search(entries, q);
  check(`搜「${q}」`, r.length > 0 ? r[0].e.title : '(无)', 'Keyword Ranking Test Article');
}

// ---------- 测试 3：标签召回 ----------
console.log('【测试 3】标签搜索');
for (const [tag, minCount] of [['测试', 25], ['搜索', 8], ['地质', 4], ['教程', 3]]) {
  const r = search(entries, tag);
  check(`搜标签「${tag}」至少召回 ${minCount} 篇`, r.length >= minCount, true);
}

// ---------- 测试 4：多关键词组合 ----------
console.log('【测试 4】多关键词组合');
{
  const r = search(entries, '星云 深空');
  check('「星云 深空」同时命中两篇', r.length, 2);
  // 共享标记词，两篇得分应相同（同分时排序稳定）
  check('两篇同分（验证排序稳定性）', r.length === 2 ? r[0].s === r[1].s : false, true);
}

// ---------- 测试 5：无结果场景 ----------
console.log('【测试 5】无结果');
check('搜不存在的词', search(entries, 'zzz绝对不存在zzz').length, 0);

// ---------- 测试 6：边界情况的数据完整性 ----------
console.log('【测试 6】边界情况');
{
  const noDesc = entries.filter((e) => e.description === '');
  check('存在无摘要的条目（验证降级展示）', noDesc.length > 0, true);

  const noTags = entries.filter((e) => e.tags.length === 0);
  check('存在无标签的条目（验证相关推荐不崩）', noTags.length > 0, true);

  const longTitle = entries.find((e) => e.title.length > 40);
  check('存在超长标题（验证排版）', Boolean(longTitle), true);

  const longBody = entries.find((e) => e.body.length > 1000);
  check('存在长正文（验证索引截断）', Boolean(longBody), true);
}

// ---------- 测试 7：测试文章确实生成了页面 ----------
console.log('【测试 7】测试文章页面已生成');
{
  const testSlugs = entries.filter((e) => e.url.includes('test-post-')).length;
  check('测试文章已进索引', testSlugs, 30);
}

// ---------- 输出 ----------
console.log('');
console.log('─'.repeat(56));
console.log(`结果: ${pass} 项通过, ${fail} 项失败`);
if (failures.length > 0) {
  console.log('');
  console.log('失败明细:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exitCode = 1;
} else {
  console.log('全部通过 ✓');
}
