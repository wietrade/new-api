#!/usr/bin/env bash
# 把前端静态产物上传到对象存储（配合构建期的 ASSET_PREFIX 使用）。
#
# 用法：
#   OSS_BUCKET=nowhub-static \
#   OSS_ENDPOINT=oss-cn-hongkong.aliyuncs.com \
#   ./scripts/upload-static-to-oss.sh
#
# 前提：
#   1) 已安装 ossutil 并完成 ossutil config（AK/SK 走本地配置，不写进仓库）；
#   2) 构建时设置了 ASSET_PREFIX，且与这里的访问前缀一致：
#        ASSET_PREFIX=https://<加速域名>/static/ bun run build
#   3) 桶已配置 CORS：允许 https://www.nowhub.org 的 GET/HEAD。
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

echo "==> 上传普通文件到 oss://$BUCKET/$PREFIX"
ossutil cp -r "$SRC_DIR" "oss://$BUCKET/$PREFIX" \
  --endpoint "$ENDPOINT" -f -u \
  --meta "Cache-Control:$CACHE_CONTROL"

# .br 预压缩文件需要标记 Content-Encoding，否则浏览器会把二进制当源码执行
if find "$SRC_DIR" -name '*.br' -print -quit | grep -q .; then
  echo "==> 上传 brotli 预压缩文件"
  ossutil cp -r "$SRC_DIR" "oss://$BUCKET/$PREFIX" \
    --endpoint "$ENDPOINT" -f -u \
    --include "*.br" \
    --meta "Content-Encoding:br#Cache-Control:$CACHE_CONTROL"
fi

echo "==> 完成。确认加速域名下的 /static/ 与本地一致："
echo "    curl -I https://<加速域名>/static/js/<file>.js"
