#!/usr/bin/env bash
# 每日检查「已到生效日」的 upcoming 价格：提升 → 导出 → 落库 → 重启。
# 由 crontab 调用，日志写入 /var/log/new-api-promote.log。
#
# 安装（服务器 root）：
#   echo '10 3 * * * /www/wwwroot/new-api-src/scripts/ops/cron-promote-upcoming.sh' | crontab -
set -euo pipefail

cd "$(dirname "$0")/../.."
LOG="${PROMOTE_LOG:-/var/log/new-api-promote.log}"
export PATH="/usr/local/go/bin:/usr/local/bun:/usr/local/node22/bin:$PATH"

OUT="$(python3 scripts/ops/promote_upcoming_pricing.py --apply 2>&1)"
{
  echo "== $(date -u +%FT%TZ)"
  echo "$OUT"
} >>"$LOG"

if echo "$OUT" | grep -qE "PROMOTED: [1-9]"; then
  python3 -m scripts.model_sync.export_billing -o /tmp/billing-upcoming.json >>"$LOG" 2>&1
  python3 scripts/ops/apply_billing.py -i /tmp/billing-upcoming.json >>"$LOG" 2>&1
  systemctl restart new-api
  echo "applied + restarted new-api" >>"$LOG"
fi
