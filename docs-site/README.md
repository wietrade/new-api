# NowHub 文档站 —— 更新与发布手册

> 本文是给维护者的操作手册，**不会**出现在线上站点（`.vitepress/config.mts` 里 `srcExclude: ['README.md']`）。
> 线上站点：<https://www.nowhub.org/docs/>

---

## 1. 它是怎么跑起来的

文档站不是独立服务，而是 **被编译进 new-api 二进制** 的静态资源：

```
docs-site/*.md                     ← 源文件（本目录）
   │  vitepress build
   ▼
web/dist/docs/                     ← 构建产物（VitePress，base = /docs/）
   │  go build（main.go 里 //go:embed web/dist）
   ▼
new-api 二进制                     ← 文档已经在里面了
   │  systemd: new-api.service（127.0.0.1:3000）
   ▼
nginx（43.165.167.132:443）        ← www.nowhub.org / api.nowhub.org
   │  proxy_pass
   ▼
https://www.nowhub.org/docs/
```

含义（很重要）：

- **只把 `web/dist/docs` 传到服务器是没用的**，服务器上没有"文档目录"这个东西，文档在二进制里。
- 改完文档必须 **重新 `go build` + 重新上传二进制 + 重启服务**，否则线上永远不变。
- `/docs` 与 `/docs/` 的目录索引由 `router/web-router.go` 显式处理，`/docs` 会 301 到 `/docs/`，这是正常的。

---

## 2. 目录与关键文件

```
docs-site/
├── .vitepress/config.mts     站点配置：base、导航 nav、侧边栏 sidebar、搜索、buildEnd 钩子
├── index.md                  首页
├── about.md                  关于本站
├── models.md                 模型清单
├── changelog.md              文档更新记录（建议每次改动都记一笔）
├── guide/                    8 篇：简介、快速开始、模型与分组、定价、限流、兼容性、错误码、问答
├── api/                      7 篇：Chat、Messages、Gemini、Vision、Models、Embeddings、函数调用
├── faq/                      8 篇：按现象查 + 鉴权/额度/超时/max_tokens/缓存/网络/Token 估算
├── tools/                    10 篇：VS Code、AI IDE、桌面端、CLI、Claude Code、Codex、LangChain…
└── public/                   直接拷贝到产物根的静态文件（如 llms.txt）
```

配置要点：

| 配置项 | 值 | 说明 |
|:---|:---|:---|
| `base` | `/docs/` | 站点挂在 `/docs/` 下，所有站内绝对路径会自动加这个前缀 |
| `cleanUrls` | `false` | 产物是 `xxx.html`（静态服务器没有 clean-url 重写），链接仍可省略 `.html` |
| `lastUpdated` | `true` | 每页底部显示"最后更新" |
| `buildEnd` | 自定义 | 额外生成 ①每页同名 `.md` ②全文合并的 `llms-full.txt` |

---

## 3. 环境与机器分工

| 角色 | 位置 | 有什么 |
|:---|:---|:---|
| 编辑 | 本机 `j:\hubapi\new-api\docs-site\` 或 WSL，任选 | 编辑器 |
| **构建机** | WSL `root@WSL:/root/new-api-push` | `bun`、`go 1.27`、已装好的 `web/node_modules` |
| 运行机 | `43.165.167.132` | 只有二进制 + systemd + nginx（没有 go / bun） |

> 本机 Windows 只有 `node/npm`（无 go/bun），所以**编译必须在 WSL 里做**。
> 本机改完文档后，需要把 `.md` 同步到 WSL（见 §5.2）。

---

## 4. 日常更新流程（标准路径，约 3 分钟）

### 4.0 一条命令（推荐）

在 **WSL 的仓库根目录** 执行：

```bash
cd /root/new-api-push
./scripts/deploy-nowhub.sh          # 构建文档 → 编译 → 上传 → 备份 → 重启 → 验证
./scripts/deploy-nowhub.sh verify   # 只做线上验证
./scripts/deploy-nowhub.sh rollback # 回滚到上一版
```

脚本做的事：预检（go/bun/ssh）→ 复用 `web/dist`（缺失才构建前端）→ `vitepress build` →
`go build`（embed）→ rsync 上传 → 服务器上备份旧版并 `.new` 中转切换 → `systemctl restart` →
验证 `127.0.0.1:3000` 与公网 `/docs/` → 只保留最近 3 个备份。

> **改了前端（`web/`）时**，脚本不会自动重建前端（避免误清空 `web/dist/docs` 的顺序问题）。
> 请先手动 `cd web && bun run build`，再跑脚本。

### 4.1 手工步骤（脚本失效时的兜底）

```bash
# ── 0. 进入 WSL 构建机 ─────────────────────────────
wsl -u root
cd /root/new-api-push

# ── 1. 改文档（若在本机改的，先按 §5.2 同步过来） ──
#    git status 看改动；改完顺便在 changelog.md 记一行

# ── 2. 构建文档站 ─────────────────────────────────
cd docs-site
bun install --frozen-lockfile   # 首次或依赖变更时
bun run build                   # → ../web/dist/docs（约 3s，3.1MB）

# ── 3. 编译二进制（把 docs embed 进去） ────────────
cd /root/new-api-push
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOPROXY=https://goproxy.cn,direct \
  go build -trimpath -ldflags "-s -w" -o /tmp/new-api-build .
# 约 1~2 分钟，产物 ~132MB

# ── 4. 上传（只传二进制，rsync 可断点续传） ────────
rsync -az --partial --timeout=180 \
  -e "ssh -i /root/.ssh/43key -o ServerAliveInterval=15" \
  /tmp/new-api-build root@43.165.167.132:/www/wwwroot/new-api/new-api.new
# 约 90 秒（~1.5MB/s）

# ── 5. 切换并重启 ────────────────────────────────
ssh -i /root/.ssh/43key root@43.165.167.132 '
  cd /www/wwwroot/new-api &&
  chmod +x new-api.new && mv new-api.new new-api &&
  systemctl restart new-api &&
  sleep 3 && systemctl is-active new-api &&
  curl -s -o /dev/null -w "docs=%{http_code}\n" http://127.0.0.1:3000/docs/
'
```

> 用 `.new` 中转再 `mv` 覆盖，是为了**不破坏正在运行的二进制**（Linux 允许替换已打开的文件）。若直接覆盖写，进程会崩溃。

### 只改了文档，能不能不重编？

可以，但需要把 `/docs/` 改由 nginx 静态目录提供（绕过二进制内嵌）。代价是**两份真相**：下次重编二进制时容易忘记同步。默认**不要**这么做，除非你在做高频预览。

---

## 5. 本机（Windows）工作方式

### 5.1 本机预览（不碰服务器）

```bash
cd j:\hubapi\new-api\docs-site
npm install          # 或用 bun install（若已安装 bun）
npm run dev          # → http://localhost:5173/docs/
```

`npm run build` 在本机也能出产物（写入 `j:\hubapi\new-api\web\dist\docs`），但本机**不能** `go build`，所以仍需回 WSL 编译。

### 5.2 把本机改动同步到 WSL 构建机

单个文件：

```bash
wsl -u root cp /mnt/j/hubapi/new-api/docs-site/guide/quick-start.md \
              /root/new-api-push/docs-site/guide/quick-start.md
```

整个目录（推荐，能带删除）：

```bash
wsl -u root -e bash -c '
  rsync -a --delete \
    --exclude node_modules --exclude .vitepress/cache --exclude .vitepress/dist \
    /mnt/j/hubapi/new-api/docs-site/ /root/new-api-push/docs-site/
'
```

反向同步（WSL 改的拿回本机）：

```bash
wsl -u root -e bash -c '
  rsync -a --exclude node_modules \
    /root/new-api-push/docs-site/ /mnt/j/hubapi/new-api/docs-site/
'
```

---

## 6. 编写约定

### 6.1 页面格式

不需要 frontmatter，直接以一级标题开头：

```markdown
# 快速开始

## 1. 创建令牌
...
```

### 6.2 站内链接（最容易踩坑）

- **写站点绝对路径，不要写 `/docs/` 前缀**——VitePress 会自动加 `base`：

  ```markdown
  ✅ [速率限制](/guide/rate-limits)
  ❌ [速率限制](/docs/guide/rate-limits)   → 变成 /docs/docs/...
  ```

- 链接到**主站**（不是文档站）的页面，用原生 HTML，避免被加上 base：

  ```markdown
  <a href="/pricing">模型广场</a>
  ```

- `cleanUrls: false`：产物是 `xxx.html`，但正文里写 `/guide/rate-limits` 即可，VitePress 会解析到 `.html`。

### 6.3 图片与静态文件

放到 `docs-site/public/`，引用时同样不带 `/docs/`：

```markdown
![截图](/shot.png)
```

### 6.4 新增页面

1. 在对应目录新建 `.md`（如 `guide/billing.md`）
2. 在 `.vitepress/config.mts` 的 `sidebar` 里加一项（**不加侧边栏，页面仍可访问，但用户找不到入口**）：

   ```ts
   { text: '计费规则', link: '/guide/billing' }
   ```

3. 需要在顶部导航出现时，再改 `nav`
4. 在 `changelog.md` 记一行

### 6.5 内容口径

- 站点域名 `https://nowhub.org`，API Base URL `https://api.nowhub.org/v1`（Anthropic 协议用 `https://api.nowhub.org`，不带 `/v1`）
- 模型清单以[模型广场](https://nowhub.org/pricing)与后台实际配置为准，不要在文档里硬编码价格

---

## 7. 验证清单（发布后逐条过）

```bash
# 服务器本机（不受本地网络干扰）
ssh -i /root/.ssh/43key root@43.165.167.132 '
  systemctl is-active new-api
  curl -s -o /dev/null -w "本地 /docs/ -> %{http_code}\n" http://127.0.0.1:3000/docs/
'

# 公网（Windows 需加 --ssl-no-revoke，否则报 CRYPT_E_REVOCATION_OFFLINE）
curl -s --ssl-no-revoke -o /dev/null -w "%{http_code}\n" https://www.nowhub.org/docs/
curl -s --ssl-no-revoke -o /dev/null -w "%{http_code}\n" https://www.nowhub.org/docs/guide/quick-start
curl -s --ssl-no-revoke -o /dev/null -w "%{http_code}\n" https://api.nowhub.org/docs/
curl -s --ssl-no-revoke -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.nowhub.org/docs   # 期望 301 → /docs/
```

浏览器侧重点看：标题、侧边栏、搜索、代码块高亮、暗色模式、`/docs/assets/*.css` 是否 200。

---

## 8. 回滚

```bash
# 一键回滚到最近一个备份（脚本会自动重启并验证）
./scripts/deploy-nowhub.sh rollback
```

手工方式：

```bash
# 发布前先备份（服务器上保留最近 3 版）
ssh -i /root/.ssh/43key root@43.165.167.132 '
  cd /www/wwwroot/new-api &&
  cp -a new-api new-api.bak-$(date +%Y%m%d_%H%M%S) &&
  ls -1t new-api.bak-* | tail -n +4 | xargs -r rm -f
'

# 回退
ssh -i /root/.ssh/43key root@43.165.167.132 '
  cd /www/wwwroot/new-api &&
  cp -a new-api.bak-<时间戳> new-api && systemctl restart new-api
'
```

---

## 9. 常见问题

| 现象 | 原因 | 处理 |
|:---|:---|:---|
| 线上 `/docs/` 还是旧内容 | 只构建了文档，没重编二进制 / 没重启 | 走完 §4 全流程 |
| `/docs/` 404，主站正常 | `web/dist/docs` 为空就编译了二进制 | 先 `bun run build` 再 `go build` |
| 页面能开但没样式 | `/docs/assets/` 404，或改了 `base` | 检查 `base: '/docs/'`；确认资源 URL 带 `/docs/assets/` |
| 打开 `/docs` 一直跳 | 目录索引缺失 | 确认产物里有 `docs/index.html`（路由要求它存在才注册） |
| 内链跳到 `/docs/docs/...` | 正文里手动写了 `/docs/` 前缀 | 去掉前缀 |
| 样式/内容改了但没生效 | 浏览器缓存（HTML 是 `no-cache`，assets 带 hash） | 强制刷新 |
| `rsync` 卡住不动 | 到服务器的大文件传输偶尔断 | 加 `--partial --timeout=180 -o ServerAliveInterval=15` 重跑（会续传） |
| WSL 里 `ssh -i /mnt/i/...` 提示输入密码 | DrvFs 挂载的密钥权限不合格 | `cp` 到 `/root/.ssh/43key && chmod 600` |
| Windows 上 curl 报 `CRYPT_E_REVOCATION_OFFLINE` | 本地网络拿不到证书吊销列表 | 加 `--ssl-no-revoke`，或用浏览器验证 |

---

## 10. 附录：本次线上部署参数

| 项 | 值 |
|:---|:---|
| 服务器 | `43.165.167.132`（`VM-0-10-ubuntu`，2 vCPU / 3.6 GB） |
| SSH 密钥 | 本机 `I:\1H\43.165.167.132_id_ed25519`；WSL 内 `/root/.ssh/43key`（600） |
| 部署目录 | `/www/wwwroot/new-api/`（`.env`、`data/one-api.db`、`logs/`、`new-api`） |
| 服务 | `systemd new-api.service`，`127.0.0.1:3000`，`Restart=always`，开机自启 |
| 反代 | nginx 1.24 → `/etc/nginx/sites-available/nowhub.conf` |
| 路由 | `nowhub.org` → 301 `www.nowhub.org`；`www` / `api` → proxy `127.0.0.1:3000` |
| 证书 | Let's Encrypt（`nowhub.org` + `www` + `api`），`certbot.timer` 自动续期 |
| 源码 | WSL `/root/new-api-push`（分支 `custom/auth-ui`），本机副本 `j:\hubapi\new-api` |
