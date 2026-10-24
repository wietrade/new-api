#!/usr/bin/env bash
# 在 43 服务器上构建并发布 new-api（前端 + NowHub 文档站 + Go 二进制）
#
# 用法（服务器上）：
#   cd /www/wwwroot/new-api-src
#   ./scripts/build-on-43.sh            # 拉代码 + 构建 + 部署 + 重启 + 验证
#   ./scripts/build-on-43.sh --no-pull  # 跳过 git pull（本地改动未提交时用）
#
# 也可在本地改完 push 后，用：
#   ssh 43 'cd /www/wwwroot/new-api-src && ./scripts/build-on-43.sh'
set -euo pipefail

SRC_DIR="${SRC_DIR:-/www/wwwroot/new-api-src}"
DEPLOY_DIR="${DEPLOY_DIR:-/www/wwwroot/new-api}"
SERVICE="${SERVICE:-new-api}"
BUN_REGISTRY="${BUN_REGISTRY:-https://registry.npmmirror.com}"

export PATH="/usr/local/go/bin:/usr/local/bun:/usr/local/node22/bin:$PATH"
export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"
export GOMAXPROCS="${GOMAXPROCS:-2}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1400}"

# 可选部署参数（不提交到仓库）：$SRC_DIR/deploy.env
# 例：ASSET_PREFIX=https://nowhub.oss-cn-beijing.aliyuncs.com
if [ -f "$SRC_DIR/deploy.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SRC_DIR/deploy.env"
  set +a
fi

log() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }

if [ -n "${ASSET_PREFIX:-}" ]; then
  log "静态资源前缀: $ASSET_PREFIX"
fi

cd "$SRC_DIR"

if [ "${1:-}" != "--no-pull" ]; then
  log "同步代码"
  git pull --ff-only
  git log -1 --format='  提交: %h %s'
fi

log "前端依赖"
[ -d web/node_modules ] || ( cd web && bun install --registry="$BUN_REGISTRY" )
ok "web 依赖就绪"

log "前端构建"
( cd web && bun run build )

log "文档站依赖"
[ -d docs-site/node_modules ] || ( cd docs-site && bun install --registry="$BUN_REGISTRY" )

log "文档站构建"
( cd docs-site && bun run build )

# sitemap 由 VitePress 在 buildEnd 之后写入，这里统一补上 /docs 前缀
if [ -f web/dist/docs/sitemap.xml ]; then
  sed -i 's#https://www\.nowhub\.org/#https://www.nowhub.org/docs/#g' web/dist/docs/sitemap.xml
fi

# 前端 + 文档站一起生成 brotli 预压缩文件（须在两份产物都构建完之后执行）
log "brotli 预压缩"
( cd web && node scripts/precompress.mjs )

[ -f web/dist/index.html ] || { echo "web/dist/index.html 缺失"; exit 1; }
[ -f web/dist/docs/index.html ] || { echo "web/dist/docs/index.html 缺失"; exit 1; }
ok "产物: web/dist $(du -sh web/dist | cut -f1) / docs $(du -sh web/dist/docs | cut -f1)"

# 可选：静态资源同步到 OSS（deploy.env 里同时给出 ASSET_PREFIX 与 OSS_BUCKET 时启用）。
# 必须在部署二进制之前完成：新 index.html 引用的 hash 文件要先在 OSS 上可用。
if [ -n "${ASSET_PREFIX:-}" ] && [ -n "${OSS_BUCKET:-}" ]; then
  log "上传静态资源 -> oss://$OSS_BUCKET"
  OSS_BUCKET="$OSS_BUCKET" \
    OSS_ENDPOINT="${OSS_ENDPOINT:-oss-cn-beijing.aliyuncs.com}" \
    bash "$SRC_DIR/scripts/upload-static-to-oss.sh"
fi

log "编译二进制"
BUILD_ID="$(date -u +%Y%m%d%H%M%S)"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
  -ldflags "-s -w -X github.com/QuantumNous/new-api/common.BuildID=$BUILD_ID" \
  -o /tmp/new-api-build .
ok "$(ls -lh /tmp/new-api-build | awk '{print $5}')"

log "部署并重启"
cd "$DEPLOY_DIR"
[ -f new-api ] && cp -a new-api "new-api.bak-$(date +%Y%m%d_%H%M%S)"
install -m 0755 /tmp/new-api-build new-api
systemctl restart "$SERVICE"
sleep 3
systemctl is-active "$SERVICE"
curl -s -o /dev/null -w '  本地 /docs/ -> %{http_code}\n' http://127.0.0.1:3000/docs/
curl -s -o /dev/null -w '  本地 /      -> %{http_code}\n' http://127.0.0.1:3000/
ls -1t new-api.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -f
ok "完成"
