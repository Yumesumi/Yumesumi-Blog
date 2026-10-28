# Cloudflare DNS 配置（博客子域名）

博客使用独立子域名 **blog.yumesumi.cyou**，根域 `yumesumi.cyou`
保留给梦澄中心。**不要修改根域的 A / AAAA / CNAME 记录。**

---

## 记录

在 Cloudflare → DNS → Records 添加：

| 类型 | 名称 | 目标 | TTL | 代理状态 |
| --- | --- | --- | --- | --- |
| `CNAME` | `blog` | `yumesumi.github.io` | `Auto` | **Proxied（橙云）** |

注意事项：

- 不要把目标写成 `yumesumi.github.io/Yumesumi-Blog` —— DNS 只接受主机名，不能带路径
- 不要给 `blog` 添加 A / AAAA 记录；GitHub Pages 不支持 IPv6，AAAA 会导致部分用户失败
- 根域的记录属于梦澄中心，博客只新增 `blog` 这一条

---

## SSL 设置

Cloudflare → SSL/TLS：

| 设置项 | 值 |
| --- | --- |
| 加密模式 | **完全（Full）** |
| 始终使用 HTTPS | **开启** |

不要选「完全（严格）」或「灵活」，原因见 [force-https.md](force-https.md)。

---

## GitHub Pages 侧

仓库 Settings → Pages：

| 项 | 值 |
| --- | --- |
| Source | **Deploy from a branch** |
| Branch | `gh-pages` / `/ (root)` |
| Custom domain | `blog.yumesumi.cyou` |
| Enforce HTTPS | 保持关闭 |

`public/CNAME` 必须是一行、无尾随换行：

```text
blog.yumesumi.cyou
```

发布脚本 `tools/deploy-pages.mjs` 会检查这一点，不匹配会中止。

---

## 等待证书与生效

1. DNS 生效通常几分钟
2. GitHub 检测到 Custom domain 后自动签发证书；期间可能短暂不可用
3. 一般 10–30 分钟完成；超过 1 小时可检查 Pages 设置与 DNS
4. 若一直 `certificate not yet provisioned`：先把橙云临时改成「仅 DNS」，
   等证书签发成功后再打开橙云

---

## 验证

```bash
# 请求到达 GitHub Pages
curl -sI https://blog.yumesumi.cyou/ | grep -i x-github-request-id

# 证书与状态
curl -s -o /dev/null -w "%{ssl_verify_result} %{http_code}\n" https://blog.yumesumi.cyou/

# 首页关键内容
curl -s https://blog.yumesumi.cyou/ | grep -o '<title>[^<]*</title>'
# 期望：<title>梦澄博客</title>
```

| 检查项 | 期望 |
| --- | --- |
| `https://blog.yumesumi.cyou/` | 200，样式正常 |
| `http://blog.yumesumi.cyou/` | 301 → https |
| 响应头 | 有 `x-github-request-id` |
| 证书 | `ssl_verify_result = 0` |

---

## 关于 CNAME flattening

博客是子域名，Cloudflare 橙云下查询 `blog.yumesumi.cyou` 会返回 Cloudflare 的 IP，
看不到 `yumesumi.github.io`，这是正常现象。
判断链路是否到达 GitHub，看响应头有没有 `x-github-request-id`。

根域的 CNAME flattening 行为与本博客无关，不要参照旧文档改动根域记录。
