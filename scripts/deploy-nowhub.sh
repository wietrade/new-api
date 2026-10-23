#!/usr/bin/env bash
#
# 部署 new-api（含 NowHub 文档站）到 43 服务器
#
# 用法（在 WSL 的仓库根目录执行）：
#   ./scripts/deploy-nowhub.sh              # 构建 + 上传 + 切换 + 重启 + 验证
#   ./scripts/deploy-nowhub.sh rollback     # 回滚到上一版备份
#   ./scripts/deploy-nowhub.sh verify       # 只做线上验证，不构建
#
# 可用环境变量覆盖：
#   HOST=root@43.165.167.132   KEY=/root/.ssh/43key
#   REMOTE_DIR=/www/wwwroot/new-api   SERVICE=new-api   KEEP=3
#   SKIP_WEB_BUILD=1   # 强制不构建前端（默认仅在 web/dist 缺失时构建）
#
set -euo pipefail

HOST="${HOST:-root@43.165.167.132}"
KEY="${KEY:-/root/.ssh/43key}"
REMOTE_DIR="${REMOTE_DIR:-/www/wwwroot/new-api}"
SERVICE="${SERVICE:-new-api}"
KEEP="${KEEP:-3}"
SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10
          -o ServerAliveInterval=15 -o ServerAliveCountMax=6)
RETRIES="${RETRIES:-5}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log()  { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

# 服务器偶发 kex_exchange_identification / Connection closed，失败就退避重试
retry() {
  local n=0
  until "$@"; do
    n=$((n + 1))
    if [ "$n" -ge "$RETRIES" ]; then
      warn "重试 $RETRIES 次仍失败：$1"
      return 1
    fi
    warn "第 $n 次失败，$((n * 3))s 后重试（$1）"
    sleep $((n * 3))
  done
}

verify() {
  log "线上验证"
  retry ssh "${SSH_OPTS[@]}" "$HOST" "\
    systemctl is-active $SERVICE >/dev/null || { echo '服务未运行'; exit 1; }
    printf '  服务状态: %s\n' \"\$(systemctl is-active $SERVICE)\"
    curl -s -o /dev/null -w '  本地 /docs/ -> %{http_code}\n' http://127.0.0.1:3000/docs/
    curl -s -o /dev/null -w '  本地 /      -> %{http_code}\n' http://127.0.0.1:3000/
  "
  if command -v curl >/dev/null; then
    # Windows 上的 curl 需要 --ssl-no-revoke（本地拿不到吊销列表）
    local extra=""
    case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) extra="--ssl-no-revoke" ;; esac
    curl -s $extra -o /dev/null -w '  公网 https://www.nowhub.org/docs/ -> %{http_code}\n' --max-time 20 https://www.nowhub.org/docs/ || warn "公网检查失败（可能是本地网络）"
  fi
}

case "${1:-deploy}" in
  verify)
    verify
    exit 0
    ;;
  rollback)
    log "回滚到上一版备份"
    retry ssh "${SSH_OPTS[@]}" "$HOST" "\
      set -e; cd $REMOTE_DIR
      LAST=\$(ls -1t new-api.bak-* 2>/dev/null | head -1)
      [ -n \"\$LAST\" ] || { echo '没有可用的备份'; exit 1; }
      cp -a \"\$LAST\" new-api && chmod +x new-api
      systemctl restart $SERVICE && sleep 3
      echo \"  已回滚到: \$LAST\"
    "
    verify
    exit 0
    ;;
  deploy) ;;
  *) die "未知参数: $1（可用: deploy | rollback | verify）" ;;
esac

# ── 1. 预检 ─────────────────────────────────────────────
log "预检"
command -v go  >/dev/null || die "缺少 go（请在本脚本应在 WSL 构建机内运行）"
command -v bun >/dev/null || die "缺少 bun"
retry ssh "${SSH_OPTS[@]}" "$HOST" true || die "SSH 连不上 $HOST（密钥: $KEY）"
ok "go / bun / ssh 就绪"

# ── 2. 前端（仅缺失时构建；改动了前端请先手动 cd web && bun run build）──
if [ "${SKIP_WEB_BUILD:-0}" != "1" ] && [ ! -f web/dist/index.html ]; then
  log "web/dist 缺失，构建前端"
  ( cd web && bun run build )
  ok "前端已构建"
else
  log "复用现有 web/dist（如需更新前端：cd web && bun run build）"
fi

# ── 3. 文档站 ───────────────────────────────────────────
log "构建文档站"
( cd docs-site && bun run build )
[ -f web/dist/docs/index.html ] || die "文档构建产物缺失: web/dist/docs/index.html"
ok "docs 产物 $(du -sh web/dist/docs | cut -f1)"

# ── 4. 编译（embed 前端 + 文档）──────────────────────────
log "编译 new-api（linux/amd64）"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOPROXY="${GOPROXY:-https://goproxy.cn,direct}" \
  go build -trimpath -ldflags "-s -w" -o /tmp/new-api-build .
ok "$(ls -lh /tmp/new-api-build | awk '{print $5}')  $(file -b /tmp/new-api-build | cut -c1-40)"

# ── 5. 上传（rsync 可续传）──────────────────────────────
log "上传二进制"
rsync -az --partial --timeout=180 --info=progress2 \
  -e "ssh ${SSH_OPTS[*]}" \
  /tmp/new-api-build "$HOST:$REMOTE_DIR/new-api.new"
ok "上传完成"

# ── 6. 备份 + 切换 + 重启（.new 中转，不打断运行中的进程）──
log "备份旧版并切换"
retry ssh "${SSH_OPTS[@]}" "$HOST" "\
  set -e; cd $REMOTE_DIR
  if [ -f new-api.new ]; then
    if [ -f new-api ]; then cp -a new-api new-api.bak-\$(date +%Y%m%d_%H%M%S); fi
    chmod +x new-api.new && mv -f new-api.new new-api
  fi
  systemctl restart $SERVICE
  sleep 3
  systemctl is-active $SERVICE
  ls -1t new-api.bak-* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
"
ok "服务已重启"

verify
log "完成：https://www.nowhub.org/docs/"
