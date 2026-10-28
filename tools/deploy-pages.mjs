#!/usr/bin/env node
/**
 * 部署到 GitHub Pages（分支发布模式，不使用 Actions）。
 *
 * 流程：
 *   1. 构建产物到 dist/
 *   2. 把 dist/ 的内容提交到独立的 gh-pages 分支
 *   3. 推送该分支到远端，Pages 随即重新发布
 *
 * 前置配置（一次性）：
 *   gh api -X PUT repos/Yumesumi/Yumesumi-Blog/pages \
 *     -f 'build_type=legacy' \
 *     -f 'source[branch]=gh-pages' \
 *     -f 'source[path]=/'
 *
 * 用法：npm run deploy
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const BRANCH = 'gh-pages';
const REMOTE = 'origin';
const DOMAIN = 'blog.yumesumi.cyou';
/**
 * 可选代理：本机 GitHub 需要 SOCKS5 代理时，
 * GIT_PROXY=socks5://127.0.0.1:10808 npm run deploy
 */
const PROXY = process.env.GIT_PROXY ?? '';
const proxyArgs = PROXY ? ['-c', `http.proxy=${PROXY}`] : [];

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
    ...options,
  });

const git = (args, options) => run('git', args, options);

/* ---------- 1. 构建 ---------- */
console.log('[deploy] 1/4 构建站点…');
run('npm', ['run', 'build'], { shell: process.platform === 'win32' });

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[deploy] 构建产物缺少 dist/index.html，中止');
  process.exit(1);
}

if (!existsSync(join(DIST, 'CNAME'))) {
  console.error(`[deploy] 构建产物缺少 dist/CNAME，自定义域名 ${DOMAIN} 会失效，中止`);
  process.exit(1);
}

const cname = readFileSync(join(DIST, 'CNAME'), 'utf8').trim();
if (cname !== DOMAIN) {
  console.error(`[deploy] dist/CNAME 内容为 "${cname}"，应为 "${DOMAIN}"，中止`);
  process.exit(1);
}

/* ---------- 2. 准备发布目录 ---------- */
console.log('[deploy] 2/4 准备发布目录…');

const STAGE = resolve(ROOT, '.deploy-pages');
rmSync(STAGE, { recursive: true, force: true });
cpSync(DIST, STAGE, { recursive: true });

// 告诉 GitHub Pages 不要用 Jekyll 处理，直接原样发布静态文件
writeFileSync(join(STAGE, '.nojekyll'), '', 'utf8');

/* ---------- 3. 提交到 gh-pages 分支 ---------- */
console.log('[deploy] 3/4 提交到 gh-pages 分支…');

// 用独立的 index 暂存发布内容，避免污染主分支的暂存区
const GIT_INDEX = join(ROOT, '.git', 'deploy-index');
rmSync(GIT_INDEX, { force: true });

const gitEnv = {
  ...process.env,
  GIT_INDEX_FILE: GIT_INDEX,
  GIT_WORK_TREE: STAGE,
};

run('git', ['read-tree', '--empty'], { env: gitEnv, quiet: true });
run('git', ['add', '--all', '.'], { env: gitEnv, quiet: true });

const tree = run('git', ['write-tree'], { env: gitEnv, quiet: true }).trim();

let parent = '';
try {
  parent = git(['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`], {
    quiet: true,
  }).trim();
} catch {
  parent = '';
}

if (!parent) {
  try {
    parent = git(['rev-parse', '--verify', '--quiet', `refs/remotes/${REMOTE}/${BRANCH}`], {
      quiet: true,
    }).trim();
  } catch {
    parent = '';
  }
}

const commitArgs = ['commit-tree', tree, '-m', `deploy: ${new Date().toISOString()}`];
if (parent) commitArgs.push('-p', parent);

const commit = run('git', commitArgs, { env: gitEnv, quiet: true }).trim();
console.log(`[deploy] 提交 ${commit.slice(0, 7)}（${readdirSync(STAGE).length} 个顶层条目）`);

const hasRemote = git([...proxyArgs, 'ls-remote', '--heads', REMOTE, BRANCH], {
  quiet: true,
}).trim();
git([
  ...proxyArgs,
  'push',
  REMOTE,
  `${commit}:refs/heads/${BRANCH}`,
  ...(hasRemote ? ['--force'] : []),
]);

rmSync(GIT_INDEX, { force: true });
rmSync(STAGE, { recursive: true, force: true });

/* ---------- 4. 完成 ---------- */
console.log('[deploy] 4/4 已推送到远端，GitHub Pages 正在重新发布');
console.log(`[deploy] 站点地址：https://${DOMAIN}/`);
console.log('[deploy] 发布通常 1-2 分钟生效；Cloudflare 代理下如仍是旧页面，purge 缓存');
