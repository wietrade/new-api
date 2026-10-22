# 网络与代理

## 先分清是谁的问题

用一条命令看四个阶段（DNS / 连接 / TLS / 首字节）：

```bash
curl -o /dev/null -sS -w 'dns=%{time_namelookup}s tcp=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s code=%{http_code}\n' \
  https://api.nowhub.org/v1/models -H "Authorization: Bearer $NEW_API_KEY"
```

| 现象 | 说明 |
| --- | --- |
| `Could not resolve host` | DNS 问题：域名没配好，或本机 DNS 被劫持 |
| `dns`/`tcp` 很久、`code=000` | 网络出口不通（公司网关、防火墙） |
| `SSL certificate problem` | 中间人证书：公司代理、或系统 CA 缺失 |
| `code=522` / `521` | CDN 回源失败（站点侧问题，不是你） |
| `code=401` | 网络通，是令牌问题，看[鉴权与路径](/faq/auth) |

## 代理环境变量

只在**需要**时设置，并且必须把本机地址排除，否则本地工具（Ollama、本地模型、内网服务）也会被代理拖死：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
export NO_PROXY=127.0.0.1,localhost,::1
```

Python 的 `httpx` / `requests` 会自动读这些变量；`requests` 还认 `REQUESTS_CA_BUNDLE`。

## Docker 容器里访问不到

- 容器默认不走宿主机代理，需要在 `docker run` 时显式传 `-e HTTPS_PROXY=...`
- 容器内的 `127.0.0.1` 是容器自己，要指宿主机得用 `host.docker.internal`（Docker Desktop）或宿主网桥 IP（Linux）
- 容器 DNS 异常时先试 `--dns 223.5.5.5`

## 大陆网络下的现实情况

- 访问**境外源站**可能不稳，是否稳定取决于站点部署位置与 CDN
- 用 Cloudflare 加速时，遇到 `521/522/523` 是**回源**问题，重试无用，需要站点侧修
- 企业内网常做 TLS 拦截，表现为证书错误；找 IT 要根证书或用 `curl --cacert` 指定

## 排查顺序

1. 换网络（手机热点）再试一次——排除本地出口
2. 用上面的 `curl -w` 看卡在哪一段
3. 换一个客户端（例如 `curl` 换成 SDK）——排除客户端配置
4. 仍然失败时把 `curl -v` 的输出（**去掉 Authorization 头**）发给管理员
