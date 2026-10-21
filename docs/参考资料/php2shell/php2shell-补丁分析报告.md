# php2shell 补丁分析报告（CVE-2026-109618 / CVE-2026-109619）

> 分析时间：2026-10-21 22:20（北京时间，补丁发布后约 20 分钟）
> 分析方式：官方公告 + GitHub Advisory + 源码补丁 diff（PHP 8.5.11 → 8.5.12）
> 性质：**防御性漏洞研究（补丁 diff 分析），仅供学习，不含任何利用代码**

---

## 一、官方公告摘要

2026-10-21 22:00（北京时间）PHP 官方同步发布 **1 条安全通告 + 4 个安全版本**：

| 分支 | 修复版本 | 状态 |
|---|---|---|
| 8.5 | **8.5.12** | 现行维护 |
| 8.4 | **8.4.27** | 现行维护 |
| 8.3 | **8.3.36** | 仅安全修复 |
| 8.2 | **8.2.35** | 仅安全修复（2026-12-31 EOL） |

**两个漏洞均为未认证 RCE，CVSS v4.0 均为 9.2**（向量：`AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H`）：

| CVE | GHSA | 标题 | 核心机制 |
|---|---|---|---|
| CVE-2026-109618 | GHSA-w8hw-w9fx-j79w | **RCE via OOM corruption** | OOM 时 `longjmp()` 从未完全初始化的上下文中提前跳出，请求关机阶段将无效内存当作有效数据处理 |
| CVE-2026-109619 | GHSA-6wmf-4rv5-p3rp | **RCE via stale global state** | 请求拥有的内部状态在底层内存释放后仍被 worker 持久全局变量引用，同 worker 的下一个请求在正常初始化前消费过期状态 |

官方受影响环境描述：**所有服务 Web 请求的 PHP 安装**（PHP-FPM、mod_php、php-cgi、FrankenPHP、LiteSpeed），其中 **mod_php 风险最高**——未认证请求可在任何应用代码执行前触发。官方反复强调：**"There are no complete mitigations, updating is the only safe choice."**

临时缓解（不完整）：
- CVE-2026-109618：`memory_limit=-1`（用 `php_admin_value` 强制）、降低 `post_max_size`、cgroup 限制；**不要用 `RLIMIT_AS`/`RLIMIT_DATA`**（会导致 `mmap()` 失败，反而触发漏洞路径）
- CVE-2026-109619：`session.upload_progress.enabled=0` 并重启 worker；PHP 8.5 上 `fatal_error_backtraces=0`；消除攻击者可触发的致命错误与超时

## 二、受影响版本确认结论

GitHub Advisory 官方确认的受影响范围：

- **< 8.2.35、< 8.3.36、< 8.4.27、< 8.5.12**（即 8.2/8.3/8.4/8.5 全部现行支持分支）
- **PHP 8.1 及更早已 EOL，官方不发布修复版本**；但 PHP 安全团队为 **7.4 / 8.0 / 8.1 提供了最小源码回移植**（GitHub 专用分支），发行版/LTS 供应商需自行取用

**"PHP 5 起全部受影响"的传闻验证结论：部分属实，但官方口径仅覆盖 7.4+。**
- 从补丁原理看，OOM `longjmp()` 机制和 session 全局状态模型是历史设计，理论上影响远早于 7.4 的版本——传闻在技术逻辑上可信；
- 但官方只确认到"8.2–8.5 受影响 + 7.4/8.0/8.1 回移植"，**未对 PHP 5–7.3 做任何官方声明**，"全部受影响"没有官方背书；
- 对运维的实际含义：任何仍在跑 ≤8.1 的系统都应视为高危（无官方发布版补丁），应升级到 8.2+ 并打对应安全版本。

## 三、补丁 diff 根因分析（8.5.11 → 8.5.12）

本次 8.5.12 共 740 个文件变更（含大量常规 bugfix），安全修复集中在三条线。`NEWS` 中对应条目："Fixed GHSA-w8hw-w9fx-j79w, GHSA-6wmf-4rv5-p3rp (**Avoid state corruption via bailout**)"——两个 CVE 的共同根因被官方概括为一句话：**bailout（longjmp）导致状态损坏**。

### 3.1 CVE-2026-109618：OOM 不再 longjmp（`Zend/zend_alloc.c` / `zend_alloc.h`）

**旧机制（漏洞根源）**：`zend_mm_safe_error()` 在内存耗尽时调用 `zend_error_noreturn(E_ERROR)`，经 `zend_try/zend_catch` → `zend_bailout()`（底层就是 `longjmp`）直接跳出当前执行上下文。问题在于：**multipart 解析等阶段，请求内存处于"已分配但未完全初始化"的中间态**，此时 OOM bailout 会跳过后续初始化步骤；请求关机（shutdown）阶段把这些无效内存当有效数据读写 → 类型混淆/UAF → RCE。

**关键点：失败的分配不需要与无效内存相关**——任何一次 OOM 都会让整个请求的关机流程暴露在脏状态之下。

**新机制（三件套）**：

1. **延迟软 OOM（soft OOM）**：超软限时不跳了，先记账。`zend_mm_check_limit()` 检测到超限且不可回收时，调用 `zend_mm_delayed_error()` 把错误信息（持久化 `zend_string` + 文件/行号）存入 `EG(delayed_oom)`，状态置 `PENDING`，并置 `vm_interrupt`——**在下一个 VM 安全点才处理**，而不是当场 longjmp：

```c
/* 新增 zend_oom_info 状态机：NONE -> PENDING -> HANDLING -> HANDLED */
EG(delayed_oom).message = zend_string_init(buf, strlen(buf), /* persistent */ true);
GC_MAKE_PERSISTENT_LOCAL(EG(delayed_oom).message);
EG(delayed_oom).state = ZEND_OOM_STATE_PENDING;
zend_atomic_bool_store_ex(&EG(vm_interrupt), true);
```

   处理点 `zend_handle_delayed_oom()` 挂在 VM 中断处理器（`zend_vm_def.h`：`zend_timeout() || zend_handle_delayed_oom() || zend_interrupt_function`）、`zend_execute.c`、`zend_execute_API.c`、`zend.c` 主循环，以及 **`main/SAPI.c` 的 POST 解析之后**（SAPI 阶段没有 VM 帧，必须显式处理）：

```c
/* main/SAPI.c —— sapi_read_post_data 处理完后 */
if (ZEND_HAS_OOM()) {
    zend_handle_delayed_oom();
}
```

   `zend_handle_delayed_oom()` 内部：抛 `zend_throw_unwind_exit()` 走正常 VM 退出路径 → 在受控点执行 `E_ERROR` → 关机流程看到的永远是完整初始化过的状态。消息先持久分配再转 emalloc，因为 `error_get_last()` 可能把它暴露给用户态（防二次 UAF）。

2. **硬 OOM（hard limit）**：软限之上引入更高的硬限（`memory_limit + 1G`，或 `zend_set_memory_hard_limit_percent` 百分比，默认 ≥200%）。撞硬限直接 `fprintf(stderr)` + **`_exit(137)`**——进程立即退出，worker 生命周期终结，不存在"带着脏状态进关机"的可能性：

```c
static ZEND_COLD ZEND_NORETURN void zend_mm_hard_limit_error(...) {
    fprintf(stderr, "Hard memory limit of %zu bytes exhausted ...");
    _exit(137);   /* 不再 bailout，直接终止进程 */
}
```

   这解释了官方缓解措施里 "不要用 `RLIMIT_AS`" 的原因：`RLIMIT_AS` 让 `mmap()` 失败，走的是另一条"insufficient memory"分支（现在统一改为 `zend_out_of_memory()`），在 fallible=false 的上下文里仍可能 bailout。

3. **可失败分配 API（fallible allocation）**：新增 `femalloc/fecalloc/ferealloc/safe_ferealloc(..., fallible)` 系列——超出限制时**返回 NULL 而非 bailout**，让调用方优雅失败。这是给 rfc1867 这类"无法推迟到 VM 安全点"的 SAPI 早期阶段准备的。

### 3.2 rfc1867.c：multipart 解析的 OOM 加固

补丁在 multipart 解析全路径插入 `ZEND_HAS_OOM()` 检查点，任一阶段软 OOM 挂起即停止解析、走干净的 `fileupload_done` 出口：

```c
while (!multipart_buffer_eof(mbuff)) {
    ...
    if (ZEND_HAS_OOM()) {
        /* A previous body part has reached the soft memory limit: Stop here */
        goto fileupload_done;
    }
    ...
}
```

配套改动（每处都针对 Advisory 描述的 OOM 触发面）：

- **注册函数改返回 `bool`**（`safe_php_register_variable` / `add_protected_variable` / `register_http_post_files_variable[_ex]`），内部 `return !ZEND_HAS_OOM()`，调用方失败即释放中间内存并退出——消灭"注册一半带着半初始化哈希表继续跑"的路径；
- **`multipart_buffer_read()` 增加 `post_max_size` 二次校验**：

```c
zend_long post_max_size = REQUEST_PARSE_BODY_OPTION_GET(post_max_size, SG(post_max_size));
if (post_max_size > 0 && SG(read_post_bytes) > post_max_size) {
    return 0;   /* 无 Content-Length/超长解码体直接截断 */
}
```
  对应 Advisory 中"无有效 Content-Length 的 multipart 请求可绕过 `post_max_size` 初检继续喂数据"；
- **头部白名单**：`php_mime_should_save_hdr()` 只保留 `Content-Disposition` / `Content-Type`，重复头忽略——直接封杀"每 part 无限头，wire 体积小、PHP 内存占用爆炸"的内存放大向量；
- **`multipart_buffer_read_body()` 的 `erealloc` 换成 fallible 版**：`safe_ferealloc(out, ..., /* fallible */ true)`，失败即 break，原缓冲区保持完整（旧代码 `erealloc` 失败会直接 bailout，留下半写状态）；
- 结尾新增警告：`"Actual POST length does not match Content-Length, and exceeds %ld bytes"`。

### 3.3 CVE-2026-109619：残留全局状态的清理（`main/main.c` + `ext/session/`）

**main.c 请求关机的状态清零**——这是"消费者"侧的封堵，每行都对应一类已确认的残留状态：

```c
/* php_request_shutdown() */
EG(delayed_oom).state = ZEND_OOM_STATE_NONE;      /* OOM 记录 */
...
for (i=0; i<NUM_TRACK_VARS; i++) {
    zval_ptr_dtor(&PG(http_globals)[i]);
    ZVAL_UNDEF(&PG(http_globals)[i]);   /* 注释：May be accessed before php_request_startup() */
}
...
clear_last_error();                     /* 关键：清除 last fatal error 状态（含 backtrace） */
...
EG(delayed_oom).state = ZEND_OOM_STATE_NONE;
PG(modules_activated) = 0;
```

`clear_last_error()` 正是 **PHP 8.5 `fatal_error_backtraces` 残留**（Advisory 称之为"已确认的 mod_php RCE 最强案例"）的修复点：8.5 的致命错误回溯存放在 `EG(last_fatal_error_backtrace)` 等位置，旧版关机时**从不重置**，worker 的下一个请求在 RINIT 前消费它即 UAF。

**session 侧（session.c）的修复**——这是长亭通告聚焦的路径，diff 直接暴露了旧代码的病灶：

```c
/* 旧版 php_session_rfc1867_update() / cleanup()： */
php_session_initialize();
PS(session_status) = php_session_active;   /* ← 无条件强制 active！ */
```

`php_session_initialize()` 失败（save path 异常、OOM bailout 等）后**状态仍被强写为 active**，`PS(id)`/`PS(mod_data)`/`PS(session_vars)` 指向无效或未初始化内存；该代码运行于 multipart 解析回调中（**RINIT 之前**），残留状态跨越请求边界存活，同 worker 下一个请求在正常初始化前消费——与 Advisory 的"生产者+消费者"模型完全吻合。新版：

```c
/* 新版：检查返回值 + 会话初始化失败时 abort */
PS(in_rfc1867_update) = true;
if (php_session_initialize() == FAILURE || PS(session_status) != php_session_active) {
    PS(in_rfc1867_update) = false;
    return;
}
```

```c
/* php_session_create_id 失败不再无限兜底重试 */
if (!PS(id)) {
    php_session_abort();
    if (!EG(exception)) {
        zend_throw_error(NULL, "Failed to create session ID: %s (path: %s)", ...);
    }
    return FAILURE;
}
```

**第二个维度：pre-RINIT 反序列化禁止用户代码执行。** 旧版在 rfc1867 上传进度更新中对 session 数据做完整 `unserialize/serialize`——会话数据里的对象会触发 `__wakeup()`/`__unserialize()`/autoloader，即**在 RINIT、任何用户态初始化完成之前执行用户代码**，这条路径本身就是消费者。新版引入 `PS(in_rfc1867_update)` 标志 + `incomplete_classes_only` 序列化模式：

```c
/* session.c：上传进度处理器在 RINIT 之前解码/再编码 session，
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

并在 `MULTIPART_EVENT_START`（同样早于 RINIT）主动调用 `php_rinit_session_globals()` 预清全局，退出时删除 incomplete 模式填充的 `$_SESSION` 全局符号、对 `request_parse_body()` 场景（`PG(modules_activated)` 为真）直接跳过 rfc1867 回调。

## 四、关键代码片段点评（个人向）

1. **"错误延迟到安全点"是本次补丁最优雅的设计**。把 `longjmp` 的即时控制流改为 `EG(delayed_oom)` 记账 + `vm_interrupt` 通知 + VM 中断点统一处理，本质上是把"任意时刻可打断的致命错误"改造成"协作式退出"。代价是要在所有无 VM 帧的 SAPI 早期路径（`SAPI.c`、`zend_execute_API.c` 的编译/初始化流程）手动补处理点——diff 中那些散落的 `zend_handle_delayed_oom()` 调用就是补全网的痕迹。漏掉一个就还是洞，这类"安全点覆盖完整性"是审这类补丁时最该盯的。

2. **fallible 分配 API 是给 C 语言补"可恢复错误"的原语**。C 没有异常，PHP 原来用 `longjmp` 当异常机制，结果就是本漏洞——bailout 跳过 RAII 式清理。`femalloc(..., fallible)` 让关键解析路径显式选择"失败返回 NULL"语义，调用方自行清理。可以预期后续 PHP 会把更多内部路径迁移到 fallible 语义。

3. **`PS(session_status) = php_session_active` 这一行是教科书级的反例**：函数返回值不检查，状态机被强行推进，错误被"用力覆盖"。整个 109619 的 session 修复一半工作量其实就是在补"不信任返回值"的旧账。

4. **OOM 记账信息用 persistent 分配再降级为 request 分配**（`zend_handle_delayed_oom` 里的 `zend_string_init(..., 0)` + release），是因为记账结构要跨越潜在的 bailout 边界存活、又会被 `error_get_last()` 暴露给用户态——同一份数据两种生命周期，这是 PHP 内存模型下处理"跨请求边界数据"的标准手法，值得学。

5. **两个 CVE 是一条完整链的两半**：109618 提供"在任意上下文制造受控异常退出的能力"（生产者侧的扳机），109619 提供"过期状态的消费点"（变现）。单修任何一个都能显著抬升利用门槛，但官方把根因统一处理为"bailout 即状态损坏"，属于修根不修表。

## 五、与长亭通告的相互印证

| 长亭观测 / 表述 | 官方 Advisory + 补丁 | 结论 |
|---|---|---|
| 根因方向为 UAF，位于 session upload progress 与 multipart 解析交互路径 | GHSA-6wmf-4rv5-p3rp 明确列出"session upload progress lifecycle: 已针对 mod_php 和 FPM 验证 RCE"；session.c 补丁完全落在该路径 | ✅ 完全吻合 |
| "multipart 解析中触发多次会话状态切换" | 对应 `php_session_rfc1867_update()`/`cleanup()` 中的 `php_session_initialize()` + 强制 active 切换；旧版每次 part 更新进度都走一次失败也不检查的初始化 | ✅ 吻合，且补丁显示了具体病灶 |
| release 构建稳定 SIGSEGV（mod_php 下 `AH00051`），debug/ASAN 构建见引用计数异常 | Advisory 的消费者模型：RINIT 前消费指向已释放请求内存的残留状态；`ZVAL_UNDEF(&PG(http_globals)[i])`、`clear_last_error()` 等修复点表明残留的正是 track_vars/错误状态等引用 | ✅ 吻合 |
| 触发需"特定请求顺序 + 应用会话状态组合" | Advisory："生产者请求与消费者请求必须命中同一 worker"；生产者=致命错误/超时/INI 诊断，消费者=pre-RINIT 的 session 上传进度或 INI 警告 | ✅ 吻合 |
| 长亭建议关闭 `session.upload_progress.enabled` | 官方缓解措施原文同款（并补充 `fatal_error_backtraces=0`） | ✅ 一致 |
| 长亭以"UAF/引用计数"为单一根因叙事 | 官方拆为两个 CVE：OOM bailout（109618）+ stale state（109619）；长亭描述的更接近 109619 的变现路径，109618 是制造异常退出的前置手段 | ⚠️ 互补而非矛盾：长亭视角是"利用面"，官方视角是"根因对" |

另印证一点：长亭在 PHP 8.5.11 + Apache mod_php 上 3/3 稳定崩溃，与 Advisory "complete RCE validated over HTTP against mod_php with default limits" 一致——mod_php 因 `php_request_shutdown` 无条件执行而成为最优目标，这也解释了官方为什么单独点名 mod_php 风险最高。

## 六、个人学习要点

1. **`longjmp` 与资源不变量天然冲突**：任何"跳跃式错误处理"都必须审计跳跃路径上每一个"已分配未初始化"的中间态。PHP 用了二十年的 `zend_try/zend_bailout` 机制，最终以一次 9.2 分的 RCE 代价还债。
2. **SAPI 早期阶段（RINIT 之前）是状态残留攻击的黄金窗口**：没有 VM 帧、没有用户态清理逻辑，但 session/upload-progress/INI 诊断都会在这里触碰全局状态。审计框架：**谁能写全局（生产者）→ 什么关机清理会漏掉它 → 谁在下一个请求 RINIT 前读它（消费者）**。
3. **"强制推进状态机"是最常见也最危险的 C 错误模式之一**：`status = ACTIVE` 不该写在 `init()` 返回值未检查之后。
4. **防御纵深要区分"减少攻击面"与"修根因"**：头部白名单、`post_max_size` 复查、fallible 分配都是缩小 OOM 可达面；真正修根因的是"OOM 延迟处理 + 硬限 `_exit` + 关机状态清零"三层。
5. **官方缓解措辞值得注意**：`memory_limit=-1` 不是"关掉内存限制"的妥协，而是把可预测的 per-request 软限（攻击者的扳机刻度）换成不可预测的系统级 OOM——攻击者失去了精确控制分配失败位置的能力。
6. **应急响应顺序**（引用官方 + 长亭综合）：升级到 8.5.12/8.4.27/8.3.36/8.2.35 → 无法升级则 `memory_limit=-1` + `session.upload_progress.enabled=0` + 8.5 加 `fatal_error_backtraces=0`，**重启所有 worker**（残留状态在 worker 内存里，不重启等于没缓解）→ 检查 `.htaccess`/`php_value`/`PHP_VALUE` 通道是否会覆盖管理员的 `php_admin_value`。
7. **给防御方的检测线索**（非利用代码）：Apache error log 中的 `AH00051: child pid N exit signal Segmentation fault` 集中出现于 multipart POST、以及退出码 137 的 FPM worker（新版硬 OOM 特征）都是高价值 IOC；旧版受控 OOM 则表现为 "Allowed memory size exhausted" fatal 后紧接异常关机。

---

## 七、补充：修复 commit 定位与同批安全修复清单（增量分析）

两个 CVE 的修复集中在一个 commit：**`31c0ea7d7ff1` "Avoid state corruption via bailout"**（319 个 commit 中可精确检索），四名核心开发者联合署名（Arnaud、Ilija Tovilo、Jakub Zelenka、Nora Dossche、Nicolas Grekas）——PHP 内核顶配阵容，侧面反映官方对这次事件的重视程度。commit 规模 **300 文件**，其中约 130 个是新增 `oom_*.phpt` 回归测试。

**同一发布还打包了 10+ 个独立安全修复**（compare php-8.5.11...php-8.5.12 检索所得），均为优质学习素材：

| Commit | 内容 |
|---|---|
| dcdfcf86fcf7 | FastCGI allowed_clients 只比较了 IPv6 前 96 位 |
| 78cc82b37a34 | openssl 通配符证书匹配 OOB read |
| 114dbb74368e | mysqlnd 线协议多处包越界读 |
| 5af9465ca890 / 795440a704d4 | curl 重定向时剥离凭据（含边界修复） |
| 3655b79c7bfa | ext/soap XML 解析无界递归 |
| 0994e2e887cd | phar tar 条目注入 |
| f785c3f6ce29 / b11bd1d9390b | 未命名 GHSA 修复 ×2 |
| 7ac9700d0d46 | FILTER_SANITIZE_ENCODED 编码 0xFF |
| 4868dd4e0205 / eacd1576adb5 | session create_sid() 失败/异常路径 |

检索方式备忘：php.net 直连和 raw.githubusercontent.com 在本网络环境 TLS 被断，但 `api.github.com` 可用——用 compare API + commit 内容 API 即可拿到全部补丁，无需下载完整源码包。

---

## 附：本次分析产物

- `php-8.5.12.tar.gz`（php.net 官方发行包，已 diff）
- `php-8.5.11.tar.gz.fresh`（重新下载并校验的基线；原基线文件 gzip 校验失败已弃用）
- `src/php-8.5.11/`、`src/php-8.5.12/`（解压后源码树）

*声明：本报告仅为补丁 diff 的防御性分析，未包含、也不会提供任何针对未打补丁系统的利用代码或可操作的攻击步骤。*
