# NowHub 文档站 —— 更新与发布手册

> 维护者手册，**不会**发布到线上（`srcExclude: ['README.md']`）。线上站点：<https://www.nowhub.org/docs/>

## 1. 它是怎么跑起来的

文档站不是一个独立服务，而是被 **编译进 new-api 二进制** 的静态资源：

```
docs-site/*.md                 源文件
   │ vitepress build           （base=/docs/）
   ▼
web/dist/docs/                 构建产物
   │ go build（main.go 里 //go:embed web/dist）
   ▼
new-api 二进制                 文档已在里面
   │ systemd: new-api.service（127.0.0.1:3000）
   ▼
nginx（43:443）                www / api.nowhub.org
   ▼
https://www.nowhub.org/docs/
```

两个必须记住的点：

- 只把 `web/dist/docs` 传到服务器**没有用**，服务器上没有"文档目录"，文档在二进制里。
- 改完文档必须**重新编译 + 重启**，否则线上不变。

`/docs` → `/docs/` 的 301 由 `router/web-router.go` 显式处理，属正常行为。

## 2. 三方同步模型

| 位置 | 角色 | 说明 |
|:---|:---|:---|
| **43 服务器** `/www/wwwroot/new-api-src` | **主环境**（改代码、构建、发布） | 已配 deploy key，可直接 `git push` |
| GitHub `wietrade/new-api`（分支 `custom/auth-ui`） | 中转与备份 | public 仓库，43 与本地都从这里同步 |
| 本机 `j:\hubapi\new-api` | 本地副本 / 备份 | 可改，`git pull` 保持同步 |

日常只改一处：**在 43 上改 → push → 本地 `git pull`**（或反过来，改完 push，43 `git pull` 再构建）。

## 3. 日常更新（一条命令）

在 43 上：

```bash
cd /www/wwwroot/new-api-src
./scripts/build-on-43.sh              # git pull + 前端 + 文档 + go build + 部署重启 + 验证
./scripts/build-on-43.sh --no-pull    # 本地改动还没提交时，跳过 pull
```

从本机触发（改完并 push 后）：

```bash
ssh -i "I:/1H/43.165.167.132_id_ed25519" root@43.165.167.132 \
  'cd /www/wwwroot/new-api-src && ./scripts/build-on-43.sh'
```

脚本做的事：`git pull --ff-only` → `bun install`（缺失时）→ 前端 `bun run build` → 文档 `bun run build` →
`go build` → 备份旧二进制 → `install` 新二进制 → `systemctl restart` → 校验 3000 → 只保留最近 3 个备份。

耗时参考（2 vCPU）：首轮约 10–15 分钟（含依赖与 Go 模块下载），之后约 4–6 分钟，其中 Go 编译 ~3 分钟。

## 4. 服务器上的工具链

| 组件 | 版本 | 路径 |
|:---|:---|:---|
| Go | 1.27.2 | `/usr/local/go` |
| Node | 22.23.4 | `/usr/local/node22`（Rspack 要求 ≥22.12） |
| bun | 1.4.4 | `/usr/local/bun/bun` → `/usr/local/bin/bun` |
| nginx | 1.24 | `/etc/nginx/sites-available/nowhub.conf` |

`build-on-43.sh` 里已 `export PATH=/usr/local/go/bin:/usr/local/bun:/usr/local/node22/bin:$PATH`，
并设 `GOPROXY=https://goproxy.cn`、`GOMAXPROCS=2`、`NODE_OPTIONS=--max-old-space-size=1400`。

npm registry 用 `https://registry.npmmirror.com`（`BUN_REGISTRY` 可覆盖）。

## 5. 编写约定

- 页面不需要 frontmatter，直接以 `# 标题` 开头
- **站内链接写站点绝对路径，不带 `/docs/` 前缀**：`[速率限制](/guide/rate-limits)`；写成 `/docs/guide/...` 会变成 `/docs/docs/...`
- 指向主站（非文档站）用原生 `<a href="/pricing">`
- `cleanUrls: false`：产物是 `xxx.html`，正文里写无后缀路径即可
- 图片放 `docs-site/public/`，引用时同样不带 `/docs/`
- **新增页面必须加到 `.vitepress/config.mts` 的 `sidebar`**，否则用户找不到入口
- 改完在 `changelog.md` 记一行

## 6. 验证

```bash
# 服务器本机
ssh root@43.165.167.132 '
  systemctl is-active new-api
  curl -s -o /dev/null -w "  /docs/ -> %{http_code}\n" http://127.0.0.1:3000/docs/
'

# 公网（Windows 上必须加 --ssl-no-revoke，否则报 CRYPT_E_REVOCATION_OFFLINE）
curl -s --ssl-no-revoke -o /dev/null -w "%{http_code}\n" https://www.nowhub.org/docs/
curl -s --ssl-no-revoke -o /dev/null -w "%{http_code}\n" https://api.nowhub.org/docs/
```

浏览器侧重点看：标题、侧边栏、搜索、代码块高亮、暗色模式。

## 7. 回滚

```bash
cd /www/wwwroot/new-api
ls -1t new-api.bak-* | head -3          # 备份保留最近 3 个
cp -a new-api.bak-<时间戳> new-api && systemctl restart new-api
```

## 8. 常见问题

| 现象 | 原因 | 处理 |
|:---|:---|:---|
| 线上还是旧内容 | 只构建了文档，没重编二进制/没重启 | 跑 `build-on-43.sh` |
| `/docs/` 404，主站正常 | `web/dist/docs` 为空就编译了 | 先 `docs-site && bun run build` |
| 页面能开但没样式 | `/docs/assets/` 404 或 `base` 被改 | 检查 `base: '/docs/'` |
| 内链跳到 `/docs/docs/...` | 正文写了 `/docs/` 前缀 | 去掉前缀 |
| `npm install` 报 `EOVERRIDE katex` | `overrides` 与直接依赖写法不同，npm 不容忍 | 用 `bun install`（本项目默认） |
| Rsbuild 报 Node 版本过低 | 需要 Node ≥ 20.19 / 22.12 | 用 `/usr/local/node22`（22.23.4） |
| SSH 偶发 `kex_exchange_identification` | 网络抖动 | 重试；脚本已带 5 次退避重试 |
| Windows curl 报吊销检查失败 | 本地拿不到 CRL | 加 `--ssl-no-revoke` |
| 页脚"最后更新"是空的 | VitePress 在 `onMounted` 才填日期 | 属正常，浏览器里会显示 |

## 9. 附录：本次部署参数

| 项 | 值 |
|:---|:---|
| 服务器 | `43.165.167.132`（2 vCPU / 3.6 GB / 59 GB） |
| SSH（本机） | `I:\1H\43.165.167.132_id_ed25519` |
| 源码 | `/www/wwwroot/new-api-src`（分支 `custom/auth-ui`） |
| 部署目录 | `/www/wwwroot/new-api`（`.env`、`data/one-api.db`、`logs/`、`new-api`） |
| 服务 | `systemd new-api.service`，`127.0.0.1:3000`，`Restart=always` |
| 反代 | `nowhub.org` → 301 `www`；`www` / `api` → proxy 3000 |
| 证书 | Let's Encrypt（3 域名），`certbot.timer` 自动续期 |
| 推送凭据 | `/root/.ssh/github_deploy`（deploy key `43-nowhub-build`，read-write），通过 `core.sshCommand` 指定 |
