# 静态资源走 OSS / CDN（运维手册）

主站前端（`web/dist/static`）可以完全不经过 Go 服务，直接由阿里云 OSS（或挂在 OSS 前的 CDN）提供。
文档站（`/docs/`）不入 OSS，仍走同源，因为它是 HTML 页面且带 VitePress 的相对资源。

## 1. 工作方式

- 构建期决定资源前缀：`web/rsbuild.config.ts` 读取环境变量 `ASSET_PREFIX`，
  非空时把 `index.html` 里的 `/static/...` 全部改写为 `${ASSET_PREFIX}/static/...`。
- 资源文件名自带内容哈希（`index.<hash>.js`），所以可以安全地设置长缓存 + `immutable`；
  新版本发布只是新增文件名，不会命中旧缓存。
- 服务器上的「配置」只有一个不提交到仓库的文件：`$SRC_DIR/deploy.env`。

```bash
# /www/wwwroot/new-api-src/deploy.env
ASSET_PREFIX=https://nowhub.oss-cn-beijing.aliyuncs.com
OSS_BUCKET=nowhub
OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
```

> 仓库里有 `deploy.env.example` 作为模板；`deploy.env` 已在 `.gitignore` 中。

## 2. 一键发布

```bash
cd /www/wwwroot/new-api-src
git fetch origin -q && git reset --hard origin/custom/auth-ui -q
./scripts/build-on-43.sh --no-pull
```

脚本顺序（关键）：

1. `web` 构建（带入 `ASSET_PREFIX`）
2. 文档站构建 + brotli 预压缩
3. **上传静态资源到 OSS**（仅当 `ASSET_PREFIX` 与 `OSS_BUCKET` 都存在）
4. 编译二进制（`web/dist` 被 `go:embed` 进二进制）
5. 部署并重启服务

上传必须在第 4 步之前：新版 `index.html` 引用的 hash 文件要先在 OSS 上可用，
否则二进制上线瞬间会 404。

## 3. 增量上传

`scripts/upload-static-to-oss.sh` 会先 `ossutil ls` 拉一份现有对象清单，
同名对象直接跳过 —— 产物文件名带 hash，同名即内容相同。日常发布通常只传 1~5 个文件（秒级）。

```bash
# 需要强制全量覆盖时
SKIP_EXISTING=0 OSS_BUCKET=nowhub OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com \
  bash scripts/upload-static-to-oss.sh
```

## 4. 为什么上传的是 gzip 字节

OSS 不做 `Accept-Encoding` 内容协商，也不会自动返回 `.br`/`.gz` 变体：
上传 `a.js` 和 `a.js.br` 两个对象，浏览器只会请求 `a.js` 的原始字节。

因此上传脚本的处理是：文本类资源（js/css/html/svg/json/xml/txt/webmanifest）先用 `gzip -9`
压缩，把 gzip 字节作为对象内容上传，并带上 `Content-Encoding: gzip`；其余二进制（字体、图片）
原样上传。浏览器与主流爬虫都支持。代价是相比 brotli 大约多 5~10% 体积，但换来「零额外配置」。
如果以后在 OSS 前面挂 CDN，可以改成上传原始字节 + 让 CDN 开启 brotli/gzip 回源压缩。

## 5. 验证

```bash
# 对象头：应为 200 / Content-Encoding: gzip / immutable / 允许站点跨域
curl -sSI -H 'Accept-Encoding: gzip' -H 'Origin: https://www.nowhub.org' \
  https://nowhub.oss-cn-beijing.aliyuncs.com/static/js/index.<hash>.js

# 线上 HTML 是否指向 OSS
curl -sS https://www.nowhub.org/ | grep -oE 'src="[^"]*index[^"]*\.js"'

# 服务端本地视角（应指向 OSS）
curl -sS http://127.0.0.1:3000/ | grep -oE 'src="[^"]*index[^"]*\.js"'
```

浏览器侧检查：DevTools → Network 里 `static/*` 的 Domain 是否为 `nowhub.oss-*.aliyuncs.com`，
控制台无混合内容/CORS 报错。

## 6. 回滚

改回同源只需注释掉 `deploy.env` 里的 `ASSET_PREFIX`（或整个文件改名），重新执行
`./scripts/build-on-43.sh --no-pull`。Go 服务会继续用内嵌的 `web/dist`，并带 brotli 预压缩。

## 7. 已知坑

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 静态资源 403 | 桶未开公共读 | 控制台开启「公共读」 |
| 浏览器报 CORS / 字体不加载 | 桶没配 CORS | `ossutil cors --method put oss://<bucket> /tmp/cors.xml`（Origin 放站点域名，Methods GET/HEAD） |
| 页面白屏、`Content-Type: application/octet-stream` | 用了 `ossutil cp` 但扩展名被改写 | 保持原文件名上传，ossutil 会按扩展名推断 MIME |
| 体积没变小 | 上传了 `.br` 变体但没配 CDN | 见第 4 节，改为上传 gzip 字节 + `Content-Encoding` |
| OSS 上旧 hash 文件越积越多 | 每版新增文件、旧文件不再被引用 | 定期清理：`ossutil ls oss://<bucket>/static/` 后按需 `ossutil rm`（保留最近若干个版本即可） |

## 8. 安全

`~/.ossutilconfig` 里的 AK/SK 必须是**最小权限 RAM 子账号**（只允许 PUT/GET/LIST 该 bucket 前缀），
不要用主账号 AK。密钥一旦在聊天/日志里出现过，应立即轮换。
