# Cloudflare DNS 配置步骤（已完成，留作参考）

> ✅ **配置已于 2026-10-03 完成**，主地址 https://yumesumi.cyou/ 已正常访问。
> 这份文档保留下来，记录配置步骤和容易踩的坑。

域名 `yumesumi.cyou` 的 `@` 原本有一条 **A 记录**（Spaceship 自动加的停放页），
和 CNAME 冲突，所以要先删掉再换。

预计耗时 3~5 分钟，其中等证书签发要 10~30 分钟。

---

## ⚠️ 两个容易踩的坑

**1. Cloudflare 会把根域 CNAME「平铺」成 A 记录**

配好 CNAME 后，用 `nslookup -type=A yumesumi.cyou` 查到的仍然是 Cloudflare 的 IP
（如 `104.21.55.201`），**看不到** `yumesumi.github.io`。

这是 Cloudflare 的正常行为（免费版 CNAME flattening），
不代表配置失败。判断是否配对要看 HTTP 响应头：

```bash
curl -sI https://yumesumi.cyou/ | grep x-github-request-id
```

有 `x-github-request-id` 就说明请求已到达 GitHub Pages，链路是通的。

**2. `https://yumesumi.github.io/` 是 404，不是站点**

GitHub Pages 的子路径地址是 `https://yumesumi.github.io/Yumesumi-Blog/`。
裸的 `yumesumi.github.io` 是账号主页，没有站点就会显示
`There isn't a GitHub Pages site here`。

---

## 第一步：删掉现有的 A 记录

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com) → 选择 `yumesumi.cyou`
2. 左侧 **DNS → Records**
3. 在 **A 记录**（Name = `yumesumi.cyou` 或 `@`）那一行点 **Edit**
4. 点 **Delete**（删除，不要只改内容）
5. 如果还有 **AAAA 记录**（Name = `yumesumi.cyou`），同样删掉

> ⚠️ 只删 Name 为 `@` / `yumesumi.cyou` 的那两条。
> 如果列表里还有 `www`、`mail` 之类其他记录，先别动它们。

---

## 第二步：添加 CNAME

在 **DNS → Records** 点 **Add record**：

| 字段 | 填什么 |
| --- | --- |
| 类型 | `CNAME` |
| 名称 | `@` |
| 目标 | `yumesumi.github.io` |
| TTL | `Auto` |
| 代理状态 | **Proxied（橙云）** |
| 备注 | 随便填，比如 `GitHub Pages` |

点 **Save**。

> **注意**：Cloudflare 会在「名称」下面提示
> `This record cannot be created because an A, AAAA, or CNAME record with that host already exists`
> —— 说明第一步的 A 记录没删干净，回到第一步确认。

---

## 第三步：检查 SSL 设置（重要）

左侧 **SSL/TLS → 概述**：

| 字段 | 设为 |
| --- | --- |
| 加密模式 | **完全（Full）** |

> ⚠️ **不要选「完全（严格）」也不要选「灵活」**
>
> - **完全（严格）**：Cloudflare 橙云会让 GitHub 无法续期证书（约 90 天后），
>   证书过期时站点会直接报 526 完全打不开。
> - **灵活**：GitHub Pages 会把 HTTP 301 重定向到 HTTPS，
>   Cloudflare 收到重定向又转回来，形成**无限重定向循环**，页面打不开。

左侧 **SSL/TLS → 边缘证书**：

| 字段 | 设为 |
| --- | --- |
| 始终使用 HTTPS | **开启** |

---

## 第四步：等待

DNS 生效通常几分钟，之后 GitHub 会自动检测到域名并签发证书。

**证书签发期间站点可能打不开**（提示 `certificate not yet provisioned`），这是正常的。

一般 10~30 分钟内会自动完成。如果超过 1 小时还没好，告诉我，我帮你查。

---

## 第五步（可选）：让 www 也能访问

如果你想让 `www.yumesumi.cyou` 也能打开，再加一条记录：

| 字段 | 填什么 |
| --- | --- |
| 类型 | `CNAME` |
| 名称 | `www` |
| 目标 | `yumesumi.github.io` |
| 代理状态 | **Proxied（橙云）** |

GitHub Pages 会自动把 `www` 重定向到主域名 `yumesumi.cyou`，不会重复内容。

> ⚠️ 不要手动加 AAAA 记录。GitHub Pages **不支持** IPv6，
> 加了 AAAA 会导致部分用户访问失败。

---

## 配置完成后的检查

| 地址 | 期望结果 |
| --- | --- |
| `https://yumesumi.cyou/` | 200，样式正常显示 |
| `http://yumesumi.cyou/` | 301 → https |
| `https://yumesumi.github.io/Yumesumi-Blog/` | 200，样式正常（回退地址） |

两个地址都会正常显示，**不需要再改任何代码**。

---

## 以后要回访

**约 3 个月后**（从今天算起）回访一次 `https://yumesumi.cyou/`，
确认没有证书相关的故障。用「完全（Full）」模式的话，正常情况下不会有问题，
但证书续期受 Cloudflare 代理影响，值得确认一次。
