# 强制 HTTPS 配置

当前 `http://yumesumi.cyou` 会直接返回页面（200），浏览器会提示「连接不是私密连接」。
需要让它 301 跳转到 https。

**两层都要配**：Cloudflare 负责主域名，GitHub 负责源站（防止绕过 Cloudflare
直接访问 `yumesumi.github.io`）。

---

## 第一层：Cloudflare（主要生效的一层）

这一层最关键，因为所有访问流量都先经过 Cloudflare。

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com) → 选择 `yumesumi.cyou`
2. 左侧 **SSL/TLS → 边缘证书**
3. 找到 **「始终使用 HTTPS」**（Always Use HTTPS）
4. 打开开关 → 状态显示 **「开」**

> 免费版就能用，不需要任何 API Token，打开即生效，通常 1 分钟内全网生效。

### 如果想用 Redirect Rule 代替

如果你希望明确看到一条 301 规则（而不是全局开关）：

**规则 → 创建规则**，配置：

| 字段 | 值 |
| --- | --- |
| 规则名称 | `Force HTTPS` |
| 条件 | 自定义筛选表达式：`http.request.full_uri` **不包含** `https://` |
| 操作 | **URL 重写** → 静态重写 |
| 来源 | `concat("https://", http.host, http.request.uri.path)` |
| 状态码 | **301 – 永久重定向** |

两种方式选一个即可，**不要同时开**（会互相叠加，虽然不出错但没必要）。

---

## 第二层：GitHub Pages（保护源站）

1. 打开仓库 **Settings → Pages**
   → https://github.com/Yumesumi/Yumesumi-Blog/settings/pages
2. 找到 **「Enforce HTTPS」**（强制 HTTPS）
3. 勾选它

> ⚠️ 这一步**在网页上勾选**。用 API 设置会报
> `The certificate does not exist yet` —— 这是 GitHub 的已知怪癖：
> 带 `https_enforced: true` 的 API 请求会校验证书状态，
> 而它的状态同步有延迟，即使证书实际已经签发。
> 不带这个参数的其他字段（如 `cname`）则能正常更新。

**这一层的作用**：如果有人直接访问 `https://yumesumi.github.io/Yumesumi-Blog/`
（绕过 Cloudflare），GitHub 会强制跳到 https，避免出现 http 明文版本。

---

## 验证

配好后跑这几条，应该全部符合预期：

```bash
# 1. HTTP 应该 301 到 HTTPS
curl -sI http://yumesumi.cyou/ | grep -iE "^HTTP|^location"
# 期望：HTTP/1.1 301  +  location: https://yumesumi.cyou/

# 2. HTTPS 正常 200
curl -sI https://yumesumi.cyou/ | grep -iE "^HTTP"
# 期望：HTTP/2 200

# 3. HTTPS 证书有效
curl -s -o /dev/null -w "%{http_code}" https://yumesumi.cyou/blog/hello-world/
# 期望：200
```

浏览器里手动输 `http://yumesumi.cyou`，应该**立刻跳到 https**，
并且地址栏不再显示「不安全」。

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

**Q：只有主域名跳 https，回退地址不跳？**

GitHub 侧的 Enforce HTTPS 会同时管 `yumesumi.github.io/Yumesumi-Blog/`，
勾选后回退地址也会强制 https。
