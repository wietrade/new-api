#!/usr/bin/env bash
# 清理 OSS 上过期的前端静态资源（按「逻辑文件名」保留最近 N 个版本）。
#
# 背景：资源文件名带内容哈希，每次发版只新增文件、从不删除，长期会堆积成百上千个
# 再也没人引用的对象。本脚本按「去掉 hash 后的名字」分组，每组保留最新 N 个版本，
# 同时永远保留当前构建 web/dist/static 里存在的文件（防止误删正在用的资源）。
#
# 用法：
#   # 预演（默认，只打印不删除）
#   OSS_BUCKET=nowhub bash scripts/prune-oss-static.sh
#   # 实际删除
#   OSS_BUCKET=nowhub DRY_RUN=0 bash scripts/prune-oss-static.sh
#
# 可选环境变量：
#   OSS_ENDPOINT   默认 oss-cn-beijing.aliyuncs.com
#   OSS_PREFIX     默认 static
#   KEEP_VERSIONS  每个逻辑文件保留的版本数，默认 2
#   SRC_DIR        当前构建产物目录，默认 web/dist/static
set -euo pipefail

BUCKET="${OSS_BUCKET:?需要设置 OSS_BUCKET}"
ENDPOINT="${OSS_ENDPOINT:-oss-cn-beijing.aliyuncs.com}"
PREFIX="${OSS_PREFIX:-static}"
KEEP="${KEEP_VERSIONS:-2}"
SRC_DIR="${SRC_DIR:-web/dist/static}"
DRY_RUN="${DRY_RUN:-1}"

log() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }

if [ ! -d "$SRC_DIR" ]; then
  echo "未找到 $SRC_DIR，请先执行前端构建（它用于确定哪些文件必须保留）" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1) 当前构建产物：必须保留的对象名（相对路径）
(
  cd "$SRC_DIR"
  find . -type f ! -name '*.br' -printf '%P\n'
) | sed "s#^#oss://$BUCKET/$PREFIX/#" | sort >"$WORK/keep_current.txt"

# 2) OSS 现有对象：<mtime> <object>
log "读取 OSS 对象清单"
ossutil ls "oss://$BUCKET/$PREFIX/" --endpoint "$ENDPOINT" 2>/dev/null |
  awk 'NR > 1 && $NF ~ /^oss:\/\// && $NF !~ /\/$/ { print $1" "$2" "$3"\t"$NF }' >"$WORK/objects.txt" || true

total=$(wc -l <"$WORK/objects.txt")
if [ "$total" -eq 0 ]; then
  echo "没有找到对象，退出"
  exit 0
fi
log "共 $total 个对象，每组保留最新 $KEEP 个版本"

# 3) 按「去掉 hash 的逻辑名」分组，时间倒序
awk -F'\t' '{
  key = $2
  logical = key
  gsub(/\.[0-9a-f]{8,12}(\.|$)/, ".", logical)
  gsub(/\.\./, ".", logical)
  print $1"\t"logical"\t"key
}' "$WORK/objects.txt" |
  sort -t$'\t' -k2,2 -k1,1r >"$WORK/grouped.txt"

# 4) 每组保留前 KEEP 个；当前构建用到的无条件保留
awk -F'\t' -v keep="$KEEP" '
  {
    n[$2]++
    if (n[$2] <= keep) print $3
  }' "$WORK/grouped.txt" | sort -u >"$WORK/keep_latest.txt"

sort -u "$WORK/keep_current.txt" "$WORK/keep_latest.txt" >"$WORK/keep_all.txt"
cut -f2 "$WORK/objects.txt" | sort -u >"$WORK/all_keys.txt"
comm -23 "$WORK/all_keys.txt" "$WORK/keep_all.txt" >"$WORK/todo.txt"

todo=$(wc -l <"$WORK/todo.txt")
if [ "$todo" -eq 0 ]; then
  log "没有需要清理的对象"
  exit 0
fi

log "待删除 $todo 个对象（保留 $((total - todo)) 个）"
head -5 "$WORK/todo.txt" | sed 's/^/    /'
[ "$todo" -gt 5 ] && echo "    ..."

if [ "$DRY_RUN" != "0" ]; then
  log "预演模式：未删除任何对象。确认无误后加 DRY_RUN=0 重新执行"
  exit 0
fi

log "开始删除"
# ossutil v1 的 rm 一次只接受一个对象（多参数会报错），这里逐条删除
done_count=0
while IFS= read -r key; do
  ossutil rm -f --endpoint "$ENDPOINT" "$key" >/dev/null
  done_count=$((done_count + 1))
  printf '\r    已删除 %d/%d' "$done_count" "$todo"
done <"$WORK/todo.txt"
echo
log "完成"
