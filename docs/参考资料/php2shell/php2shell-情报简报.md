# php2shell (CVE-2026-109618 / CVE-2026-109619) 情报简报

> 整理时间：2026-10-21 21:55（北京时间）· 补丁发布前
> 状态：官方补丁预定 2026-10-21 14:00 UTC（北京时间 22:00）发布

## 一、漏洞基本信息（已确认部分）

| 项目 | 内容 |
|---|---|
| CVE 编号 | CVE-2026-109618、CVE-2026-109619 |
| 漏洞类型 | 远程代码执行（RCE） |
| 官方评级 | CVSS v4.0 **9.2**（PHP 官方确认，两个均为 9.2） |
| 受影响组件 | PHP 解释器内核（非扩展、非框架层） |
| 认证要求 | 无需认证（依据评分推断，官方未明说） |
| 用户交互 | 无 |
| 在野利用 | 截至 10-21 无公开证据，未列入 CISA KEV |
| 官方修复 | 10-21 22:00（北京时间）随安全版本发布 |
| 缓解措施 | 官方明确提到可关闭 `session.upload_progress.enabled` |

## 二、技术线索（长亭通告 + 社区信息综合）

1. **根因方向：UAF（释放后重用）**——位于 session 上传进度（session upload progress）与 multipart 请求解析的交互路径。
2. **触发机制**：multipart 解析过程中触发多次会话状态切换；特定请求顺序 + 应用会话状态组合下，内存对象被提前释放，又在上传进度更新时被再次访问。
3. **观测证据**（长亭实验）：
   - release 构建：进程崩溃（SIGSEGV，3/3 稳定触发），Apache 日志 `AH00051: child pid N exit signal Segmentation fault`
   - debug/ASAN 构建：引用计数异常
   - 存在对象生命周期与引用计数管理不一致问题
4. **已验证环境**：PHP 8.5.11 (NTS) + Apache 2.4.68 (mod_php)
5. **社区演示视频**（真实性未经官方确认）：对 WordPress、MediaWiki、phpBB、Magento、Laravel、Symfony、Drupal、Joomla、WHMCS 实现 RCE
6. **未经确认的传闻**：漏洞影响 PHP 5 及之后所有版本（来自泄露工具 banner，官方未确认）

## 三、版本与修复矩阵

| 分支 | 支持状态 | 预计能否获得修复 |
|---|---|---|
| 8.5 | 现行维护 | ✅ |
| 8.4 | 现行维护 | ✅ |
| 8.3 | 仅安全修复 | ✅ |
| 8.2 | 仅安全修复（2026-12 EOL） | ✅ |
| 8.1 及更早 | 已 EOL | ❌ 无官方补丁 |

上一批安全版本（9 月 24 日）：8.5.11 / 8.4.26 / 8.3.35 / 8.2.34——本次修复版本预计在此基础上递增。

## 四、补丁发布后值得盯的分析点（diff 指南）

重点检查这些文件的变更：

- `main/rfc1867.c` —— multipart/form-data 解析主体，上传进度回调的触发点
- `ext/session/session.c`、`ext/session/php_session.h` —— 会话状态切换、RINIT/RSHUTDOWN 生命周期
- `php_session_flush` / `php_session_initialize` 相关调用序列
- 引用计数宏（`GC_ADDREF/GC_DELREF/ZEND_TRY_ASSIGN_REF`）的改动
- Chaitin 提到的"多次会话状态切换"——关注 `php_session_start` 与 flush 的重入路径

## 五、时间线

- **10-20**：匿名帖泄露（声称 CVSS 10.0、影响 PHP 5+，原定 10-22 披露），随后删除；watchTowr 确认漏洞真实（ embargo 中）；PHP 官方当晚发布预告（19:33 UTC）
- **10-21 14:00 UTC（北京 22:00）**：官方安全更新发布，将公布完整细节、受影响版本、修复版本
- Sansec 预测：补丁发布后 **15 分钟内**出现大规模攻击
- **10-21 21:55（本文写作时）**：POC 未完全公开，无在野利用

## 六、参考资料

- PHP 官方公告页：https://www.php.net/archive/2026.php
- 长亭应急响应中心通告（含复现细节）
- watchTowr FAQ：https://watchtowr.com/intelligence/php-cve-2026-109618-faq/
- Huntress Rapid Response：https://www.huntress.com/blog/php2shell-leaked-critical-php-vulnerabilities
- Ars Technica 报道：https://arstechnica.com/security/2026/10/php-maintainers-tell-web-devs-to-prepare-themselves-for-critical-security-patches/
- CERT-EU Advisory 2026-018
- Sansec 分析（15 分钟攻击窗口预测）

## 七、本仓库文件

- `php-8.5.11.tar.gz` —— 旧版基线源码（补丁 diff 用）
- `php2shell-补丁分析报告.md` —— 补丁发布后自动生成的根因分析（待 22:00 后）
