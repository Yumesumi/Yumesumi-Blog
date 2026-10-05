/**
 * 生成搜索测试用的临时文章。
 *
 * ## 为什么用脚本而不是手写
 *
 * 30 篇手写既慢又容易格式不一致。这个脚本可重跑（清空后重新生成），
 * 且测试数据有设计好的结构，能覆盖搜索的各种场景。
 *
 * ## 测试数据设计
 *
 * 每篇文章都带一个**全局唯一的标记词**（如「紫石英」），搜它必须
 * 精确命中 1 篇 —— 这样能验证搜索精度，而不只是"能搜到东西"。
 *
 * 覆盖的场景：
 *   1. 唯一标记词      → 精确命中 1 篇
 *   2. 共享标签        → 命中多篇，可验证标签权重
 *   3. 共同词          → 验证排序稳定性
 *   4. 长正文          → 验证索引截断不影响
 *   5. 边界情况        → 无标签、无摘要、极长标题
 *
 * ## 清理
 *
 *   node scripts/gen-test-posts.mjs --clean
 *
 * 会删掉本脚本生成的所有文章（靠 test-post- 前缀识别）。
 * 线上正式文章不受影响。
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BLOG_DIR = 'src/content/blog';
const PREFIX = 'test-post-';

/** ---------- 30 篇测试文章的定义 ---------- */

/**
 * marker  : 全局唯一标记词，搜它必须只命中这一篇
 * tags    : 标签，部分共享以验证标签搜索与相关推荐
 * desc    : 部分留空，验证缺摘要时的降级展示
 * body    : 正文长度不一，长的用于验证索引截断
 */
const POSTS = [
  {
    title: '紫石英：搜索测试第一篇',
    marker: '紫石英',
    tags: ['测试', '搜索'],
    desc: '这篇包含唯一标记词「紫石英」，用于验证搜索能否精确命中单篇文章。',
    body: `紫石英是一种常见的装饰石材。本文是搜索功能测试数据之一。

搜索这个站点时，输入紫石英应该只命中这一篇文章，不会有其他结果。
这可以验证搜索的精确度 —— 如果命中多篇，说明匹配逻辑有问题。`,
  },
  {
    title: '青金石：搜索测试第二篇',
    marker: '青金石',
    tags: ['测试', '搜索'],
    desc: '包含唯一标记词「青金石」，与上一篇同标签组合，用于验证标签搜索。',
    body: `青金石在古代常被用作颜料，是群青颜料的原料。

这篇带「测试」和「搜索」两个标签，用于验证标签搜索能召回多篇文章。

搜索本篇的标记词应精确命中本篇；搜索「测试」则应召回所有带该标签的文章。`,
  },
  {
    title: '鸡血石：搜索测试第三篇',
    marker: '鸡血石',
    tags: ['测试', '搜索', '随笔'],
    desc: '包含唯一标记词「鸡血石」，标签比前两篇多一个，用于验证标签权重差异。',
    body: `鸡血石因颜色如血得名。本文用于验证多标签场景下的搜索排序。

本篇带三个标签，是测试数据中标签较多的。搜索「测试」时，
标签数量不同的文章都会出现，排序应保持稳定 —— 不会因标签数不同而跳动。`,
  },
  {
    title: '寿山石：搜索测试第四篇',
    marker: '寿山石',
    tags: ['测试', '随笔'],
    desc: '包含唯一标记词「寿山石」，不共享「搜索」标签，用于验证标签精确过滤。',
    body: `寿山石产自福建。这篇刻意不带「搜索」标签，用来验证搜索是按标签过滤而非全量返回。

搜索寿山石应只命中本篇。搜索「搜索」标签时不应出现本篇。`,
  },
  {
    title: '碧玺：搜索测试第五篇',
    marker: '碧玺',
    tags: ['测试', '技术'],
    desc: '包含唯一标记词「碧玺」，标签换成「技术」，用于验证跨标签组。',
    body: `碧玺是电气石的一种，晶体常呈柱状。

这篇带「技术」标签而非「搜索」，用于验证跨标签组：
共同标签「测试」能召回本篇，而只搜「技术」不应召回带「搜索」标签的文章。`,
  },
  {
    title: '珊瑚：搜索测试第六篇',
    marker: '珊瑚',
    tags: ['测试', '技术', '教程'],
    desc: '包含唯一标记词「珊瑚」，三个标签，用于验证多标签文章。',
    body: `珊瑚是海洋动物骨骼堆积形成的礁体。

本篇带「技术」和「教程」两个标签。相关推荐区块应出现
同为「技术」标签的其他文章 —— 因为共同标签决定了相关推荐的召回。`,
  },
  {
    title: '琥珀：搜索测试第七篇',
    marker: '琥珀',
    tags: ['测试', '教程'],
    desc: '包含唯一标记词「琥珀」，带「教程」标签。',
    body: `琥珀是树脂经过地质作用形成的化石。

本篇带「教程」标签。搜索这个标签应召回所有同样带该标签的测试文章。`,
  },
  {
    title: '蜜蜡：搜索测试第八篇',
    marker: '蜜蜡',
    tags: ['测试', '教程'],
    desc: '包含唯一标记词「蜜蜡」，标签与上一篇相同，验证同标签文章的排序。',
    body: `蜜蜡与另一种树脂化石常被混淆，但成因不同。

本篇标签组合与上一篇完全相同，用于验证排序稳定性：
多次构建后，相对顺序应保持一致，不会随机跳动。`,
  },
  {
    title: '珍珠：搜索测试第九篇',
    marker: '珍珠',
    tags: ['测试', '随笔', '技术'],
    desc: '包含唯一标记词「珍珠」，标签跨三个组。',
    body: `珍珠来自贝类软体动物。这篇的标签横跨随笔和技术两组。

搜索珍珠应精确命中本篇。它的相关推荐数量应多于标签单一的测试文章。`,
  },
  {
    title: '玛瑙：搜索测试第十篇',
    marker: '玛瑙',
    tags: ['测试', '性能'],
    desc: '包含唯一标记词「玛瑙」，引入「性能」标签测试新标签。',
    body: `玛瑙是隐晶质石英。这篇引入一个新的标签「性能」，用于验证新标签能正常生成标签页。

搜索性能应只命中本篇。访问 /tags/性能/ 应能正常打开。`,
  },

  // ---------- 第二组：无 description，验证降级展示 ----------
  {
    title: '橄榄石：搜索测试第十一篇（无摘要）',
    marker: '橄榄石',
    tags: ['测试', '搜索'],
    desc: null, // 故意留空
    body: `橄榄石是镁铁橄榄石族的宝石。本篇故意没有写 description。

搜索橄榄石命中本篇时，搜索结果页应回退到显示正文片段，
而不是显示空白。这验证了搜索结果的降级展示逻辑。`,
  },
  {
    title: '托帕石：搜索测试第十二篇（无摘要）',
    marker: '托帕石',
    tags: ['测试', '搜索'],
    desc: null,
    body: `托帕石的颜色 varieties 很多。本篇同样没有 description。

搜索托帕石应命中本篇，描述位置显示从正文摘取的片段。`,
  },

  // ---------- 第三组：极长标题，验证排版 ----------
  {
    title:
      '这是一个刻意写得很长很长的标题用来测试搜索结果的标题排版是否会在窄屏下溢出或者换行异常从而影响可读性',
    marker: '长标题排版',
    tags: ['测试', '排版'],
    desc: '标题刻意写得很长，用于验证搜索结果里长标题的排版表现。',
    body: `长标题排版测试。本篇的标题被刻意写得非常长。

在窄屏下搜索这个标题，长标题应该正常换行而不是溢出容器或被截断。
搜索长标题排版应精确命中本篇。`,
  },

  // ---------- 第四组：长正文，验证索引截断 ----------
  {
    title: '长正文测试：关于索引截断的说明',
    marker: '索引截断',
    tags: ['测试', '技术', '性能'],
    desc: '正文刻意写得很长，用于验证搜索索引的截断逻辑不影响匹配。',
    body: `索引截断是搜索实现里的一个取舍。

搜索索引需要存正文的纯文本以便全文匹配。但如果把全文都存进去，
索引文件会随文章数量线性膨胀，用户加载索引的速度会变慢。

${'本文反复论述索引截断的取舍问题，这段内容用于把正文撑长。'.repeat(40)}

即便如此，索引截断这个关键词仍应能命中本篇 —— 因为标题和摘要
本身就包含它。截断只影响正文末尾的词能否被搜到，不影响前面部分。`,
  },
  {
    title: '深度长文：搜索排序权重如何设计',
    marker: '排序权重',
    tags: ['测试', '技术'],
    desc: '第二篇长正文，同样用于验证截断。',
    body: `排序权重的设计决定了搜索结果的相关性。

本文讨论标题命中、标签命中、摘要命中、正文命中各自的权重该如何分配。

${'排序权重的具体数值取决于产品预期，这里反复提及以充实正文长度。'.repeat(40)}

搜索排序权重应命中本篇。`,
  },

  // ---------- 第五组：纯 ASCII 内容，验证英文与大小写 ----------
  {
    title: 'Keyword Ranking Test Article',
    marker: 'quantum',
    tags: ['测试'],
    desc: '纯英文标题与正文，用于验证英文搜索和大小写不敏感匹配。',
    body: `This article exists to verify that English keyword search works correctly.

Searching for quantum should match this article. Searching for QUANTUM
should also match, because matching is case insensitive.

搜索 quantum 或 QUANTUM 或 Quantum 都应命中本篇。`,
  },
  {
    title: 'Distributed Systems Notes',
    marker: 'consensus',
    tags: ['测试'],
    desc: 'Another English-only article for case-insensitivity testing.',
    body: `A brief note on consensus algorithms.

Searching for consensus should match only this article.
Searching for Consensus (capital C) should also match.

共识这个中文词也应能命中本篇。`,
  },

  // ---------- 第六组：多关键词组合测试 ----------
  //
  // 这两篇的 marker 刻意相同，用来验证「多篇同标记词」时的排序稳定性。
  // 与前面各篇的「标记词唯一」是两种不同的测试目标，不冲突。
  {
    title: '多关键词测试甲篇：星云与深空',
    marker: '星云',
    tags: ['测试', '搜索'],
    desc: '用于验证多关键词搜索（空格分隔）与同标记词的排序稳定性。',
    body: `星云是星际空间的气体与尘埃云，恒星在此诞生。

多关键词测试：搜索「星云 深空」应命中本篇与下一篇（乙篇）。
只搜「星云」则命中两篇 —— 因为两篇的标记词相同。

若两篇得分不同，排序应把更相关的放前面，且多次构建后顺序稳定。`,
  },
  {
    title: '多关键词测试乙篇：深空与星云',
    marker: '星云',
    tags: ['测试', '搜索'],
    desc: '与甲篇共享标记词，用于验证同分文章的排序稳定性。',
    body: `深空观测是天文学的重要方向，需要长时间曝光。

本篇与甲篇共享同一个标记词，用于验证：得分相同时，
排序不应随机跳动，多次构建后相对顺序保持一致。

搜索「深空 星云」应同时命中两篇。`,
  },

  // ---------- 第七组：数值与符号，验证特殊字符处理 ----------
  {
    title: '版本 2.0 的改动记录',
    marker: '2.0',
    tags: ['测试', '技术'],
    desc: '标题含数字与点号，用于验证数字和符号的处理。',
    body: `版本 2.0 引入了搜索功能。

搜索 2.0 应命中本篇。标题里的点号不应导致匹配失败。`,
  },
  {
    title: 'C++ 与 Rust 的对比笔记',
    marker: 'C++',
    tags: ['测试'],
    desc: '标题含加号等特殊字符，用于验证符号不会被搜索逻辑误处理。',
    body: `C++ 和 Rust 在内存模型上有本质区别：RAII 对比所有权。

搜索 C++ 应命中本篇。加号必须被正确转义，否则匹配会出错。
这也是一个边界情况的测试。`,
  },
  {
    title: '正则表达式中的 . 通配符',
    marker: '正则',
    tags: ['测试', '技术'],
    desc: '标题含正则元字符，验证不会被当作模式解析。',
    body: `模式匹配里的点号能匹配任意字符，而加号需要转义。

搜索本篇的标记词应命中本篇。标记词本身作为搜索词时也必须被正确转义，
否则会被当作模式解析导致匹配异常。`,
  },

  // ---------- 第八组：边界情况 ----------
  {
    title: '无标签的边界情况测试',
    marker: '无标签边界',
    tags: [], // 故意无标签
    desc: '没有任何标签，用于验证无标签文章的搜索与相关推荐不报错。',
    body: `本篇没有任何标签。

无标签边界情况应能正常被搜索到。
它的相关推荐区块应该不渲染（因为找不到共同标签的候选）。
搜索无标签边界应精确命中本篇。`,
  },
  {
    title: '单字标题测试',
    marker: '单字标题',
    tags: ['测试'],
    desc: '标题只有一个字，验证极短标题的搜索与展示。',
    body: `本篇标题只有一个字。

单字标题应能正常被搜索和展示。搜索单字标题应命中本篇。`,
  },
  {
    title: 'Astro',
    marker: 'Astro',
    tags: ['测试', '技术', 'Astro'],
    desc: '标题恰好与真实文章的技术栈同名，验证不会与真实内容混淆。',
    body: `本篇标题是 Astro，与真实技术栈同名。

搜索 Astro 会同时命中本篇和真实的技术文章。
这验证了搜索能正确处理标题完全匹配的情况。`,
  },

  // ---------- 第九组：填充至 30 篇 ----------
  ...[
    ['石英', '地质', '石英是常见的造岩矿物。'],
    ['云母', '地质', '云母片状解理发育。'],
    ['萤石', '地质', '萤石在紫外线下发光。'],
    ['石榴石', '地质', '石榴石晶形常为十二面体。'],
    ['黑曜石', '地质', '黑曜石是火山玻璃的一种。'],
  ].map(([marker, group, firstLine], i) => ({
    title: `${marker}：矿物笔记第 ${26 + i} 篇`,
    marker,
    tags: ['测试', group],
    desc: `矿物系列测试数据，包含唯一标记词「${marker}」。`,
    body: `${firstLine}

本篇属于「${group}」这一组测试数据，用于把测试集扩充到 30 篇。
搜索${marker}应精确命中本篇。`,
  })),
];

/** ---------- 生成 ---------- */

/** 把单行文本转成 YAML 安全的值（中文无需引号，但统一加引号更稳） */
function yamlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildContent({ title, tags, desc, body }) {
  const lines = ['---', `title: ${yamlString(title)}`];

  // date 省略 —— content.config.ts 里 date 是必填的，所以由下面统一加
  if (desc) lines.push(`description: ${yamlString(desc)}`);
  if (tags.length > 0) {
    lines.push(`tags: [${tags.map(yamlString).join(', ')}]`);
  }

  lines.push('---', '', body, '');
  return lines.join('\n');
}

async function generate() {
  console.log(`准备生成 ${POSTS.length} 篇测试文章…\n`);

  // 标记词唯一性检查。
  //
  // 唯一标记词的作用是：搜它必须精确命中 1 篇，从而验证搜索精度。
  // 但有一组文章**刻意**共享标记词（同「星云」），用于验证
  // 「多篇同分时排序是否稳定」—— 这是另一个测试目标。
  //
  // 所以允许显式声明的重复组：DEFAULT_SHARED_MARKERS 里的词可以重复，
  // 且重复次数不得超过该值。意外引入的重复会被这里拦住。
  const DEFAULT_SHARED_MARKERS = { 星云: 2 };

  const counts = new Map();
  for (const post of POSTS) {
    counts.set(post.marker, (counts.get(post.marker) ?? 0) + 1);
  }

  for (const [marker, count] of counts) {
    const allowed = DEFAULT_SHARED_MARKERS[marker] ?? 1;
    if (count > allowed) {
      throw new Error(
        `标记词「${marker}」出现 ${count} 次，超出允许的 ${allowed} 次。\n` +
          `唯一标记词用于验证搜索精度，不能随意重复。` +
          `若确需多篇同标记词，请在该词的正文里写明测试意图，并在 DEFAULT_SHARED_MARKERS 里登记。`,
      );
    }
  }

  const uniqueCount = [...counts.values()].filter((n) => n === 1).length;
  const sharedCount = [...counts.values()].filter((n) => n > 1).length;
  console.log(
    `标记词检查通过：${uniqueCount} 个唯一词，${sharedCount} 组共享词（共 ${counts.size} 个不同词）\n`,
  );

  for (const [i, post] of POSTS.entries()) {
    const slug = `${PREFIX}${String(i + 1).padStart(2, '0')}`;
    const dir = join(BLOG_DIR, slug);

    await mkdir(dir, { recursive: true });

    // date 单独处理：给成递增日期，让排序可预期
    const day = String((i % 28) + 1).padStart(2, '0');
    const content = buildContent(post).replace(
      /^---$/m,
      `---\ndate: 2026-11-${day}`,
    );

    await writeFile(join(dir, 'index.md'), content, 'utf8');
  }

  console.log(`已生成 ${POSTS.length} 篇：`);
  console.log(`  目录：${BLOG_DIR}/${PREFIX}01 … ${PREFIX}${String(POSTS.length).padStart(2, '0')}`);
  console.log('');
  console.log('清理方式：node scripts/gen-test-posts.mjs --clean');
}

async function clean() {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(BLOG_DIR, { withFileTypes: true });

  let removed = 0;
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(PREFIX)) {
      await rm(join(BLOG_DIR, entry.name), { recursive: true, force: true });
      removed += 1;
    }
  }

  console.log(removed > 0 ? `已删除 ${removed} 篇测试文章。` : '没有找到测试文章，无需清理。');
}

// ---------- 入口 ----------

if (process.argv.includes('--clean')) {
  await clean();
} else {
  await generate();
}
