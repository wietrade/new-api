#!/usr/bin/env bash
# 把前端静态产物上传到阿里云 OSS（配合构建期的 ASSET_PREFIX 使用）。
#
# 用法：
#   OSS_BUCKET=nowhub-static \
#   OSS_ENDPOINT=oss-accelerate.aliyuncs.com \
#   ./scripts/upload-static-to-oss.sh
#
# 说明：
#   * 使用 OSS 自带域名即可，不需要域名备案：
#       默认：https://<bucket>.oss-<region>.aliyuncs.com
#       加速：https://<bucket>.oss-accelerate.aliyuncs.com（需先在控制台开启「传输加速」）
#   * OSS 不会根据 Accept-Encoding 内容协商，也不会返回 .br/.gz 变体，
#     所以默认不上传 .br（上传了也没人请求）。需要 brotli 请在 OSS 前加 CDN，
#     或设置 UPLOAD_BROTLI=1 配合自行配置的压缩规则。
#   * 桶需允许公共读取，并配置 CORS：Origin=https://www.nowhub.org，Methods=GET,HEAD。
set -euo pipefail

BUCKET="${OSS_BUCKET:?需要设置 OSS_BUCKET}"
ENDPOINT="${OSS_ENDPOINT:?需要设置 OSS_ENDPOINT}"
PREFIX="${OSS_PREFIX:-static}"
SRC_DIR="${SRC_DIR:-web/dist/static}"
CACHE_CONTROL="${CACHE_CONTROL:-public, max-age=31536000, immutable}"

if [ ! -d "$SRC_DIR" ]; then
  echo "未找到 $SRC_DIR，请先执行前端构建" >&2
  exit 1
fi

echo "==> 预处理：文本资源 gzip 压缩"
STAGE_GZ="$(mktemp -d)"
STAGE_RAW="$(mktemp -d)"
trap 'rm -rf "$STAGE_GZ" "$STAGE_RAW"' EXIT

# 增量：产物文件名带内容 hash，已存在即内容相同，无需重复上传（省流量/时间）。
# 需要强制全量覆盖时：SKIP_EXISTING=0 bash scripts/upload-static-to-oss.sh
declare -A EXISTS=()
skipped=0
if [ "${SKIP_EXISTING:-1}" = "1" ]; then
  echo "==> 读取 OSS 现有对象清单"
  while IFS= read -r key; do
    [ -n "$key" ] && EXISTS["$key"]=1
  done < <(
    ossutil ls "oss://$BUCKET/$PREFIX/" --endpoint "$ENDPOINT" -s 2>/dev/null | grep -v '/$'
  )
  echo "    已存在 ${#EXISTS[@]} 个对象"
fi

gz_count=0
raw_count=0
while IFS= read -r -d '' file; do
  rel="${file#"$SRC_DIR"/}"
  case "$rel" in
    *.br) continue ;;
  esac
  if [ -n "${EXISTS["oss://$BUCKET/$PREFIX/$rel"]:-}" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  case "$rel" in
    *.js | *.css | *.html | *.svg | *.json | *.xml | *.txt | *.webmanifest)
      mkdir -p "$(dirname "$STAGE_GZ/$rel")"
      gzip -9 -c "$file" >"$STAGE_GZ/$rel"
      gz_count=$((gz_count + 1))
      ;;
    *)
      mkdir -p "$(dirname "$STAGE_RAW/$rel")"
      cp "$file" "$STAGE_RAW/$rel"
      raw_count=$((raw_count + 1))
      ;;
  esac
done < <(find "$SRC_DIR" -type f -print0)

echo "    gzip 文本 $gz_count 个 / 原样上传 $raw_count 个 / 跳过已存在 $skipped 个"

if [ "$gz_count" -eq 0 ] && [ "$raw_count" -eq 0 ]; then
  echo "==> 无新增文件，跳过上传"
  exit 0
fi

# OSS 不做 Accept-Encoding 协商，因此把 gzip 字节直接作为对象内容，
# 并用 Content-Encoding: gzip 告知浏览器解压（所有浏览器与主流爬虫都支持）。
echo "==> 上传 gzip 资源到 oss://$BUCKET/$PREFIX"
if [ "$gz_count" -gt 0 ]; then
  ossutil cp -r "$STAGE_GZ/." "oss://$BUCKET/$PREFIX" \
    --endpoint "$ENDPOINT" -f -u \
    --meta "Content-Encoding:gzip#Cache-Control:$CACHE_CONTROL"
fi

if [ "$raw_count" -gt 0 ]; then
  echo "==> 上传其余资源到 oss://$BUCKET/$PREFIX"
  ossutil cp -r "$STAGE_RAW/." "oss://$BUCKET/$PREFIX" \
    --endpoint "$ENDPOINT" -f -u \
    --meta "Cache-Control:$CACHE_CONTROL"
fi

echo "==> 完成。确认对象头（应有 Content-Encoding: gzip）："
echo "    curl -I https://<域名>/$PREFIX/js/<file>.js"
