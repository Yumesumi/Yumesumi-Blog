# 强制 HTTPS 配置（博客子域名）

站点：**https://blog.yumesumi.cyou/**
根域 `yumesumi.cyou` 属于梦澄中心，本文只讨论博客子域名。

---

## 目标配置

| 位置 | 设置 |
| --- | --- |
| Cloudflare → SSL/TLS → 概述 → 加密模式 | **完全（Full）** |
| Cloudflare → SSL/TLS → 边缘证书 → 始终使用 HTTPS | **开启** |
| GitHub → Settings → Pages → Enforce HTTPS | **保持关闭** |

### 为什么 GitHub 侧保持关闭

Cloudflare 的开关提示里写了：如果 Origin 也强制 HTTPS 重定向，
可能导致重定向循环。博客的域名解析经过 Cloudflare 橙云，
GitHub Pages 对 HTTP 请求的跳转目标由 Cloudflare 处理；
只保留 Cloudflare 一层时链路是单向收敛的：

```text
http://blog.yumesumi.cyou/          (Cloudflare 301)
  → https://blog.yumesumi.cyou/    (200 ✓)
```

### 为什么 SSL 模式必须是「完全（Full）」

GitHub Pages 的证书由 Let's Encrypt 签发，有效期 90 天。
Cloudflare 橙云代理会挡住 GitHub 的证书续期验证：

- **完全（严格）**：约 90 天后证书续期失败，Cloudflare 返回 526，站点打不开
- **完全（Full）**：到源站走 HTTPS 但不校验证书有效性，续期失败也不会导致 526
- **灵活（Flexible）**：GitHub 会把 HTTP 301 到 HTTPS，Cloudflare 又转回来，无限重定向

---

## 验证命令

```bash
# 1. HTTP 应 301 到 HTTPS
curl -sI http://blog.yumesumi.cyou/ | grep -iE "^HTTP|^location"

# 2. 跟随跳转，最终 200，跳数正常
curl -sIL -o /dev/null -w "最终=%{url_effective} 跳数=%{num_redirects} 状态=%{http_code}\n" \
  http://blog.yumesumi.cyou/

# 3. 证书有效（0 = 有效）
curl -s -o /dev/null -w "%{ssl_verify_result}\n" https://blog.yumesumi.cyou/

# 4. 请求确实到达 GitHub Pages
curl -sI https://blog.yumesumi.cyou/ | grep -i x-github-request-id
```

---

## 代码侧的补充措施

`BaseLayout.astro` 的 `<head>` 中有：

```html
<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
```

浏览器会把页面里的 HTTP 资源自动升级为 HTTPS，避免混合内容警告。
这个 meta **不能**替代地址栏跳转——真正的 301 只能由服务端/Cloudflare 发出。

---

## 常见问题

**Q：配了「始终使用 HTTPS」，浏览器还提示不安全？**

检查加密模式是否为「完全（Full）」。选「完全（严格）」时，
证书续期失败会在约 3 个月后让站点报 526。

**Q：博客打不开了，报 526？**

大概率是 Cloudflare 加密模式被改成了「严格」，且 GitHub 证书续期失败。
改回「完全（Full）」即可恢复。

**Q：要不要在 GitHub Pages 也开 Enforce HTTPS？**

不建议。当前 Cloudflare 已经完成 HTTP → HTTPS 跳转，
GitHub 侧再开会增加重定向循环风险。个人站点保持一层即可。

---

## 回访

Cloudflare 橙云影响 GitHub 证书续期，建议约 3 个月后回访一次：

```bash
curl -s -o /dev/null -w "%{ssl_verify_result} %{http_code}\n" https://blog.yumesumi.cyou/
```

输出 `0 200` 即正常。
