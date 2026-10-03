import type { APIRoute } from 'astro';
import { buildSearchIndex } from '../lib/search-index';

/**
 * 生成搜索索引 `/search-index.json`。
 *
 * ## 为什么用 endpoint 而不是构建插件
 *
 * 最初写成 Astro 插件，在 `astro:build:done` 钩子里写文件。但那个时机
 * 跑在 Node 原生解析器下（不走 Vite），会遇到两个问题：
 *
 * 1. 配置文件加载阶段静态 import 依赖 `astro:content` 的模块会直接失败
 *    （`astro:content` 虚拟模块那时还没就绪）
 * 2. 改成动态 import 后，仍需给相对路径写扩展名，且会连锁触发
 *    下一层模块解析失败
 *
 * endpoint 由 Astro 正常编译，`astro:content` 可用，且能自动处理
 * 静态输出的资源路径 —— 天然适配「根路径 / 子路径」两种访问方式。
 */
export const GET: APIRoute = async () => {
  const entries = await buildSearchIndex();

  return new Response(JSON.stringify(entries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
