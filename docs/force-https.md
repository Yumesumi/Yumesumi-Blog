# 强制 HTTPS 配置

> ✅ **已于 2026-10-03 配置完成并验证通过。**
> 最终只开了 Cloudflare 一层，GitHub 侧的 Enforce HTTPS **保持关闭**（原因见下）。

`http://yumesumi.cyou` 现在会 301 跳转到 https，浏览器地址栏不再提示不安全。

---

## 最终配置：只开 Cloudflare 一层

**Cloudflare → SSL/TLS → 边缘证书 → 始终使用 HTTPS：开**
**GitHub Settings → Pages → Enforce HTTPS：关**（保持默认）

### 为什么不在 GitHub 侧也开

Cloudflare 的开关提示里写了：

> 启用此功能时，如果 Origin 也强制 HTTPS 重定向，可能会导致重定向循环。

实测印证了这个风险。GitHub Pages 对 `http://yumesumi.github.io/Yumesumi-Blog/`
的跳转目标是 **`http://yumesumi.cyou/`**（http，不是 https），
如果 GitHub 侧再强制 https，两边规则叠加容易产生 `ERR_TOO_MANY_REDIRECTS`。

只开 Cloudflare 一层时，实际跳转链路是：

```text
http://yumesumi.github.io/Yumesumi-Blog/   (GitHub 301)
  → http://yumesumi.cyou/                  (Cloudflare 301)
    → https://yumesumi.cyou/               (200 ✓)
```

每跳只前进一步，收敛正常，不会循环。

### 安全性说明

不勾 GitHub 那层唯一的理论缺口是：有人直连
`http://yumesumi.github.io/Yumesumi-Blog/` 时，第一跳落在 http 上。
但因为主域名的 Cloudflare 开关会把 http 拉回 https，
实际仍然不会以明文形式呈现内容。个人博客场景下这个取舍是合理的，
也少了一个将来可能出问题的地方。

---

## 已验证的跳转行为

```text
http://yumesumi.cyou/                      → 301 → https://yumesumi.cyou/
http://yumesumi.cyou/blog/hello-world/     → 301 → https://yumesumi.cyou/blog/hello-world/
http://yumesumi.cyou/tags/                 → 301 → https://yumesumi.cyou/tags/
http://yumesumi.github.io/Yumesumi-Blog/   → 301 → http://yumesumi.cyou/ → 301 → https://... （200）
```

路径在跳转中完整保留，中文路径（`/tags/`）也正常。

---

## 代码侧的补充措施

`src/layouts/BaseLayout.astro` 的 `<head>` 里有：

```html
<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
```

浏览器会把它加载到的 HTTP 资源自动升级为 HTTPS，避免混合内容警告。

> 注意：这个 meta **不能**替代地址栏跳转。用户自己输 `http://` 时，
> 浏览器仍会先请求 http 页面 —— 真正的 301 只能由服务端发出。

---

## 验证命令

```bash
# 1. HTTP 应该 301 到 HTTPS
curl -sI http://yumesumi.cyou/ | grep -iE "^HTTP|^location"
# 期望：HTTP/1.1 301  +  location: https://yumesumi.cyou/

# 2. 跟随跳转应 1 跳到位，无循环
curl -sIL -o /dev/null -w "最终=%{url_effective} 跳数=%{num_redirects} 状态=%{http_code}\n" \
  http://yumesumi.cyou/
# 期望：最终=https://yumesumi.cyou/ 跳数=1 状态=200

# 3. 证书有效（0 = 有效）
curl -s -o /dev/null -w "%{ssl_verify_result}\n" https://yumesumi.cyou/
```

---

## 如果想改用 Redirect Rule

如果以后想用显式规则代替全局开关：

**规则 → 创建规则**，配置：

| 字段 | 值 |
| --- | --- |
| 规则名称 | `Force HTTPS` |
| 条件 | 自定义筛选表达式：`http.request.full_uri` **不包含** `https://` |
| 操作 | **URL 重写** → 静态重写 |
| 来源 | `concat("https://", http.host, http.request.uri.path)` |
| 状态码 | **301 – 永久重定向** |

两种方式选一个即可，**不要同时开**（会互相叠加）。

---

## 常见问题

**Q：配了 Cloudflare「始终使用 HTTPS」，浏览器还提示不安全？**

检查 SSL/TLS → 概述的加密模式：

| 模式 | 说明 |
| --- | --- |
| **完全（Full）** | ✅ 必须是这个 |
| 完全（严格） | ⚠️ 证书续期会失败，约 3 个月后站点 526 打不开 |
| 灵活 | ❌ 无限重定向循环 |

**Q：配了之后博客打不开了？**

大概率是加密模式被改成了「严格」而证书续期失败。
改回「完全（Full）」即可恢复。

**Q：从 github.io 回退地址进入时，第一跳是 http，为什么没循环？**

因为 Cloudflare 会把 http 拉回 https，每跳只进一步：

```text
http://yumesumi.github.io/Yumesumi-Blog/
  → http://yumesumi.cyou/        (GitHub 301)
    → https://yumesumi.cyou/     (Cloudflare 301) ✓
```

**Q：以后要不要补开 GitHub 侧的 Enforce HTTPS？**

不建议。当前配置已满足需求（浏览器不会以明文看到内容），
且多开一层反而增加循环风险。个人博客场景保持现状即可。

