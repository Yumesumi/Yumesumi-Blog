---
title: CVSS 9.2 分的双 RCE（php2shell）补丁 diff 实录
description: CVE-2026-109618 / CVE-2026-109619 发布当天，下载 8.5.11 和 8.5.12 源码做 diff，从补丁反推根因：OOM 时的 longjmp 是万恶之源，session 上传进度是黄金消费点。
tags: ['技术', '安全', 'PHP']
date: 2026-10-21
---

10 月 20 日深夜，PHP 社区被一条匿名帖搅得鸡犬不宁：据说有两个 CVSS 接近满分、影响 PHP 5 以来所有版本的未认证 RCE，利用工具的 banner 都已经泄露。PHP 官方当晚确认漏洞真实，并预告 10 月 21 日 22:00（北京时间）发布修复。安全圈给这组漏洞起了个外号——**php2shell**。

22 点整，官方准时发布 8.5.12 / 8.4.27 / 8.3.36 / 8.2.35 四个安全版本。我做的第一件事就是下载源码，和手头的 8.5.11 基线做 diff——**从补丁反推漏洞，是最干净的漏洞研究方式**：没有利用代码的干扰，只有"哪里改了"这个事实。这篇文章记录当天的分析过程和结论。

## 一、官方公告说了什么

两个漏洞均未认证 RCE，CVSS v4.0 均为 **9.2**：

| CVE | GHSA | 标题 | 一句话机制 |
| --- | --- | --- | --- |
| CVE-2026-109618 | GHSA-w8hw-w9fx-j79w | RCE via OOM corruption | OOM 时 `longjmp()` 从未完全初始化的上下文中跳出，请求关机阶段把无效内存当有效数据处理 |
| CVE-2026-109619 | GHSA-6wmf-4rv5-p3rp | RCE via stale global state | 请求拥有的内存已释放，但 worker 的持久全局变量还引用着它，同 worker 的下一个请求在正常初始化前消费了这个过期状态 |

受影响的是**所有服务 Web 请求的 PHP 安装**（FPM、mod_php、php-cgi、FrankenPHP、LiteSpeed），其中官方单独点名 **mod_php 风险最高**——因为未认证请求可以在任何应用代码执行之前完成攻击。

### "PHP 5 起全部受影响"的传闻，真相是什么

官方口径：8.2–8.5 全部受影响并已修复；PHP 7.4 / 8.0 / 8.1 由安全团队提供了**最小源码回移植**（GitHub 专用分支，发行版供应商自行取用）；8.1 及更早没有发布版修复。

从补丁原理看，OOM 的 `longjmp` 机制和 session 全局状态模型都是延续二十年的历史设计，理论上影响远早于 7.4——所以传闻**在技术逻辑上可信**。但官方只背书到 7.4，"全部受影响"三个字没有官方出处。对运维的实际含义很简单：还在跑 ≤8.1 的系统应当作高危处理。

## 二、根因：longjmp 与状态损坏

`NEWS` 里的修复条目把两个 CVE 归为一句话：

> Fixed GHSA-w8hw-w9fx-j79w, GHSA-6wmf-4rv5-p3rp (**Avoid state corruption via bailout**)

两个漏洞，一个共同根因：**bailout（底层就是 `longjmp`）导致状态损坏**。PHP 的错误处理用 `zend_try/zend_catch` 做跨层跳转，这在请求逻辑内部没问题，但有两个要命的盲区：

1. **multipart 解析等阶段，请求内存处于"已分配但未完全初始化"的中间态**。此时 OOM bailout 跳过后续初始化，关机阶段（shutdown）把这些无效内存当有效数据读写——这就是 109618，类型混淆/UAF。
2. **worker 是跨请求存活的**。致命错误可能在状态重置完成前打断执行，持久全局变量里留下指向已释放内存的指针。同一个 worker 处理下一个请求时，在 RINIT 之前就消费了这些残留——这就是 109619。

Advisory 里有个关键细节：**失败的分配不需要与无效内存相关**。任何一次 OOM 都会让整个请求的关机流程暴露在脏状态之下。攻击者只需要"制造一次内存耗尽"，不需要精确控制哪里炸。

## 三、补丁怎么修的（8.5.11 → 8.5.12 diff）

### 3.1 OOM 三件套：延迟、硬限、可失败

**延迟软 OOM** 是本次补丁最优雅的设计。超软限不再当场 longjmp，而是先记账：

```c
/* Zend/zend_alloc.c —— 新增 zend_oom_info 状态机 */
EG(delayed_oom).message = zend_string_init(buf, strlen(buf), /* persistent */ true);
GC_MAKE_PERSISTENT_LOCAL(EG(delayed_oom).message);
EG(delayed_oom).state = ZEND_OOM_STATE_PENDING;
zend_atomic_bool_store_ex(&EG(vm_interrupt), true);
```

状态机 `NONE → PENDING → HANDLING → HANDLED`，真正的错误处理被推迟到**下一个 VM 安全点**：

```c
/* Zend/zend_vm_def.h —— VM 中断处理器 */
if (zend_atomic_bool_load_ex(&EG(timed_out))) {
    zend_timeout();
} else if (ZEND_HAS_OOM()) {
    zend_handle_delayed_oom();
    HANDLE_EXCEPTION();
} else if (zend_interrupt_function) {
    ...
}
```

`zend_handle_delayed_oom()` 内部抛 `zend_throw_unwind_exit()` 走正常 VM 退出路径，再在受控点执行 `E_ERROR`——关机流程看到的永远是完整初始化过的状态。本质上是把"任意时刻可打断的致命错误"改造成**协作式退出**。

但 SAPI 早期阶段没有 VM 帧，所以 diff 里能看到手动补的处理点：

```c
/* main/SAPI.c —— POST 解析之后 */
if (ZEND_HAS_OOM()) {
    zend_handle_delayed_oom();
}
```

这类"安全点覆盖完整性"是审这类补丁最该盯的地方——漏掉一个就还是洞。

**硬限**：软限之上引入更高的硬限（默认 `memory_limit + 1G`），撞上直接 `_exit(137)`，进程当场终结，不存在"带着脏状态进关机"的可能性。这也解释了官方缓解措施里一个反直觉的警告：**不要用 `RLIMIT_AS`/`RLIMIT_DATA`**——它们让 `mmap()` 失败，走的是另一条"insufficient memory"分支，在不可失败的上下文里仍会触发 vulnerable 的 bailout 路径。

**可失败分配 API**：新增 `femalloc / ferealloc / safe_ferealloc(..., fallible)` 系列，超限返回 NULL 而非 bailout，让调用方优雅失败。这是给 rfc1867 这类无法推迟到 VM 安全点的路径准备的——相当于给 C 语言补了一个"可恢复错误"原语。

### 3.2 rfc1867.c：堵住 OOM 的攻击面

Advisory 列了几种"在表观限额内摸到 OOM"的手法：无有效 Content-Length 绕过 `post_max_size` 初检、每个 part 塞无限头部（wire 体积小、PHP 内存占用爆炸）、空文件控件不计入 `max_file_uploads` 但照常生成元数据数组。补丁逐一对付：

- multipart 解析全路径插入 `ZEND_HAS_OOM()` 检查点，任一阶段软 OOM 挂起即停止解析、走干净的 `fileupload_done` 出口；
- **头部白名单**：`php_mime_should_save_hdr()` 只保留 `Content-Disposition` / `Content-Type`，重复头直接忽略；
- `multipart_buffer_read()` 增加 `post_max_size` 二次校验，按实际读到的字节数算账；
- 注册函数（`safe_php_register_variable` 等）改返回 `bool`，失败即释放中间内存并退出；
- `multipart_buffer_read_body()` 的 `erealloc` 换成 fallible 版——旧代码 realloc 失败会直接 bailout，留下半写状态的缓冲区。

### 3.3 session.c：这次 diff 里最有"破案感"的一段

长亭通告聚焦的 session 上传进度路径，病灶在旧代码里写得明明白白：

```c
/* 旧版 php_session_rfc1867_update() / cleanup()： */
php_session_initialize();
PS(session_status) = php_session_active;   /* ← 无条件强制 active！ */
```

`php_session_initialize()` 失败（save path 异常、OOM bailout 等）后，状态仍被强写为 active，`PS(id)` / `PS(mod_data)` / `PS(session_vars)` 指向无效或未初始化的内存。这段代码运行在 multipart 解析回调中——**RINIT 之前**——残留状态跨请求存活，下一个请求在正常初始化前消费。与 Advisory 的"生产者 + 消费者"模型完全吻合。

新版修复：

```c
/* 检查返回值，失败不推进状态机 */
PS(in_rfc1867_update) = true;
if (php_session_initialize() == FAILURE || PS(session_status) != php_session_active) {
    PS(in_rfc1867_update) = false;
    return;
}
```

第二个维度同样精彩：旧版在 rfc1867 更新中对 session 数据做完整 `unserialize`——会话里的对象会触发 `__wakeup()` / autoloader，等于**在 RINIT、任何用户态初始化之前执行用户代码**。这条路径本身就是消费者。新版引入 `incomplete_classes_only` 模式：

```c
/* 上传进度处理器在 RINIT 之前解码 session，
 * 对象一律保持 __PHP_Incomplete_Class：无 autoloading、无 __wakeup()，
 * 原样写回，不执行任何用户代码 */
static void php_session_unserialize_init(php_unserialize_data_t *var_hash)
{
    PHP_VAR_UNSERIALIZE_INIT(*var_hash);
    if (PS(in_rfc1867_update)) {
        php_var_unserialize_set_incomplete_classes_only(*var_hash, true);
    }
}
```

### 3.4 main.c：关机时的状态清零

消费者侧的封堵，每行对应一类已确认的残留状态：

```c
/* php_request_shutdown() */
EG(delayed_oom).state = ZEND_OOM_STATE_NONE;
for (i=0; i<NUM_TRACK_VARS; i++) {
    zval_ptr_dtor(&PG(http_globals)[i]);
    ZVAL_UNDEF(&PG(http_globals)[i]);   /* May be accessed before php_request_startup() */
}
clear_last_error();                     /* 清除 last fatal error 状态（含 8.5 的 backtrace） */
PG(modules_activated) = 0;
```

`clear_last_error()` 正是 PHP 8.5 `fatal_error_backtraces` 残留的修复点——Advisory 称之为"已确认的 mod_php RCE 最强案例"：8.5 的致命错误回溯在关机时**从不重置**，worker 的下一个请求在 RINIT 前消费它即 UAF。这也是官方缓解措施里让 8.5 用户设 `fatal_error_backtraces=0` 的原因。

## 四、与长亭通告的相互印证

长亭在补丁发布前的应急通告给出了不少实验观测，事后对照官方 Advisory 和补丁，逐项印证：

| 长亭观测 | 官方 Advisory + 补丁 | 结论 |
| --- | --- | --- |
| UAF 位于 session upload progress 与 multipart 解析交互路径 | GHSA-6wmf 明确列出该路径已对 mod_php 和 FPM 验证 RCE；session.c 补丁完全落在该路径 | ✅ 吻合 |
| "multipart 解析中触发多次会话状态切换" | 对应 `php_session_rfc1867_update()` 里失败也不检查的初始化 + 强制 active 切换 | ✅ 吻合，且 diff 暴露了具体病灶 |
| release 构建稳定 SIGSEGV，debug/ASAN 构建见引用计数异常 | RINIT 前消费指向已释放请求内存的残留状态；`ZVAL_UNDEF` / `clear_last_error` 等修复点表明残留的正是 track_vars / 错误状态 | ✅ 吻合 |
| 需特定请求顺序 + 应用会话状态组合 | "生产者与消费者必须命中同一 worker" | ✅ 吻合 |
| 建议关闭 `session.upload_progress.enabled` | 官方缓解措施同款 | ✅ 一致 |

一个视角差异值得记下：长亭以"UAF / 引用计数"为单一根因叙事，官方拆成两个 CVE。长亭描述的更接近 109619 的**变现路径**，109618 则是**制造异常退出的前置手段**——互补而非矛盾。

## 五、我学到的

1. **`longjmp` 与资源不变量天然冲突**。PHP 用了二十年的 `zend_try/zend_bailout` 机制，最终以一次 9.2 分的 RCE 代价还债。任何跳跃式错误处理，都必须审计跳跃路径上每一个"已分配未初始化"的中间态。
2. **SAPI 早期阶段（RINIT 之前）是状态残留攻击的黄金窗口**：没有 VM 帧、没有用户态清理逻辑，但 session 上传进度、INI 诊断都会在这里触碰全局状态。审计框架三问：谁能写全局（生产者）→ 什么关机清理会漏掉它 → 谁在下一个请求 RINIT 前读它（消费者）。
3. **"强制推进状态机"是最常见也最危险的 C 错误模式**：`status = ACTIVE` 不该写在 `init()` 返回值未检查之后。整个 109619 的 session 修复，一半工作量是在补"不信任返回值"的旧账。
4. **缓解措施要区分"减少攻击面"与"修根因"**：头部白名单、post_max_size 复查是缩小 OOM 可达面；真正修根因的是"OOM 延迟处理 + 硬限 `_exit` + 关机状态清零"三层。
5. **`memory_limit=-1` 不是妥协，是换武器**：把可预测的 per-request 软限（攻击者的扳机刻度）换成不可预测的系统级 OOM，攻击者失去了精确控制分配失败位置的能力。
6. **应急响应的正确顺序**：升级到修复版本 → 无法升级则 `memory_limit=-1` + `session.upload_progress.enabled=0`（8.5 加 `fatal_error_backtraces=0`），**并重启所有 worker**——残留状态在 worker 内存里，不重启等于没缓解 → 检查 `.htaccess` / `php_value` / `PHP_VALUE` 通道是否会覆盖管理员的 `php_admin_value`。
7. **给防御方的检测线索**：Apache 日志中集中于 multipart POST 的 `AH00051: child pid N exit signal Segmentation fault`，以及退出码 137 的 FPM worker（新版硬 OOM 特征）都是高价值信号。

## 写在最后

补丁 diff 分析的乐趣在于：漏洞通报告诉你"哪里疼"，补丁告诉你"医生怎么下刀"。这次 PHP 官方的处理相当漂亮——两个 9.2 分的 RCE，根因被收敛成一句 "Avoid state corruption via bailout"，修复方案（延迟 OOM + 硬限 + fallible 分配）是一个体系而非零散补丁。

唯一的美中不足是时间：从匿名帖泄露到补丁发布不到 24 小时，Sansec 预测补丁发布 15 分钟内会出现大规模攻击。如果你读完这篇文章还没升级，现在就去。

---

*本文为补丁 diff 的防御性分析，不含、也不会提供任何针对未打补丁系统的利用代码。参考来源：php.net 官方公告、GHSA-w8hw-w9fx-j79w、GHSA-6wmf-4rv5-p3rp、长亭应急响应中心通告，以及本人对 php-8.5.11 / php-8.5.12 源码的 diff 分析（2026-10-21）。*
