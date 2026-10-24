# RELAY-DATAFLOW — `/v1/chat/completions` 完整调用链

> 基于源码逐行梳理，覆盖：选渠道 → 鉴权 → 预扣 → 转发 → 流式/非流式 → 结算 → 写日志。
> 路径根目录：`J:\hubapi\new-api`。

## 0. 路由注册

- `router/relay-router.go` → 把 `/v1/chat/completions` 绑定到 `controller.Relay`（格式 OpenAI）。
- 中间件链（`router/api-router.go`）：
  1. `middleware.RequestId` — 生成 request id。
  2. `middleware.Distribute()` — **第一次选渠道**（只选一次，失败后的重试在 `Relay` 内部循环）。
  3. `middleware.Auth` — 校验用户 token、配额、模型分组权限。
  4. 进入 `controller.Relay`。

## 1. 选渠道（第一次）

文件：`middleware/distributor.go`

1. `Distribute()`（line 34）调用 `getModelRequest(c)`（line 355）从 body 解析出 `model` 字段。
2. `service.SelectChannelForRequest(c, model, &RetryParam{Retry: 0})`（line 103）：
   - `service/channel_select.go:283` — 优先 pin → session affinity（`GetPreferredChannelByAffinity`）→ 随机加权。
   - 随机路径：`service/channel_select.go:114 CacheGetRandomSatisfiedChannel` → `model/channel_cache.go:117 GetRandomSatisfiedChannel`。
3. `GetRandomSatisfiedChannel`：
   - 从内存表 `group2model2channels[group][model]` 取候选 channel id 列表（已按 priority 降序排序，见 `channel_cache.go:72-79`）。
   - `retry=0` 取最高 priority 层；层内按 `weight` 加权随机（`channel_cache.go:209-214`）。
   - 若内存缓存未开启，走 `model/ability.go:108 GetChannel`（DB 直查）。
4. `middleware.SetupContextForSelectedChannel(c, channel, model)`（line 125）：
   - 把 channel id/type/name/base_url/key/priority/weight/model_mapping/header_override 等塞入 gin.Context。
   - `channel.GetNextEnabledKey()`（`model/channel.go:221`）选一个启用的上游 key（多 key 轮询/随机），trim 后放入 `ContextKeyChannelKey`。

## 2. 进入 Relay 主循环

文件：`controller/relay.go:71 Relay(c, types.RelayFormatOpenAI)`

1. `helper.GetAndValidateRequest(c, relayFormat)` — 解析 body 为 `dto.GeneralOpenAIRequest`。
2. `relaycommon.GenRelayInfo(c, relayFormat, request, ws)` — 构造 `RelayInfo`（含 ApiKey=渠道 key、UpstreamModelName、PriceData 占位）。
3. `relay.PrepareRequestBilling(c, relayInfo)` — 预扣配额（按模型价 × 分组倍率估算）。
4. **重试主循环**（`controller/relay.go:162`）：
   ```go
   for ; retryParam.GetRetry() <= common.RetryTimes; retryParam.IncreaseRetry() {
       channel, channelErr := getChannel(c, relayInfo, retryParam)   // 每次重试重新选渠道
       service.PrepareTieredBillingForSelectedGroup(c, relayInfo)     // 分组倍率重算
       bodyStorage := common.GetBodyStorage(c)                        // 重放 body
       c.Request.Body = io.NopCloser(bodyStorage)
       newAPIError = relayHandler(c, relayInfo)                       // 实际转发
       if newAPIError == nil { return }
       decision := service.DecideRelayRetry(c, newAPIError, ...)      // 决定是否重试
       service.RecordPolicyFailure(c, channel.Id, newAPIError, decision)
       processChannelError(c, channelError, newAPIError, relayInfo)    // 自动禁用 / 写错误日志
       if decision.Action != "retry" { break }
   }
   ```
5. `getChannel`（line 266）：
   - 首次：用 distributor 选好的 channel（从 context 取）。
   - 重试：调 `service.CacheGetRandomSatisfiedChannel(retryParam)`，`retryParam.Retry` 作为 priority 降级索引（retry=1 走次高 priority 层）。

## 3. 构造上游请求

文件：`relay/compatible_handler.go:25 TextHelper`

1. `helper.ModelMappedHelper` — 应用渠道的 `model_mapping`（把用户模型名映射成上游模型名）。
2. `adaptor := GetAdaptor(info.ApiType)` — 按 channel type 选 adaptor（`relay/relay_adaptor.go:50`）。
3. `adaptor.ConvertOpenAIRequest` — 协议转换（OpenAI/Claude/Gemini 之间）。
4. `common.Marshal(convertedRequest)` → `RemoveDisabledFields` → `ApplyParamOverrideWithRelayInfo`。
5. `adaptor.DoRequest(c, info, requestBody)` — 实际发 HTTP。

## 4. 发 HTTP

文件：`relay/channel/api_request.go:315 DoApiRequest`

1. `http.NewRequest(method, url, body)` — **注意：未绑定 c.Request.Context()**（line 321）。
2. `adaptor.SetupRequestHeader` — 设置 `Authorization: Bearer <渠道key>`（见 `relay/channel/openai/adaptor.go:239`）。
3. `processHeaderOverride` — 应用渠道 header override；`"*"` 或 `re:xxx` 透传客户端 header，但跳过 `authorization/x-api-key/x-goog-api-key/cookie/host` 等（`api_request.go:75-102`）。
4. `doRequest` → `relayClient.Do(req)`（共享 http.Client，含 ResponseHeaderTimeout、RelayTimeout）。
5. 流式：若上游返回 `Content-Type: text/event-stream`，先 `SetEventStreamHeaders` 给客户端，再启动 ping 保活 goroutine。

## 5. 处理上游响应

文件：`relay/channel/openai/relay-openai.go`

- **非流式**（`OpenaiHandler`，line 252）：
  1. `io.ReadAll(resp.Body)` 读完整 body。
  2. 解析 `dto.OpenAITextResponse`，提取 `usage`。
  3. `service.IOCopyBytesGracefully(c, resp, responseBody)` 原样写回客户端。
- **流式**（`OaiStreamHandler`，line 104）：
  1. `helper.StreamScannerHandler` 逐行读 SSE，每个 chunk 调回调写回客户端。
  2. 结束后从最后两个 chunk 提取 `usage`；若上游未返回 usage，用 `ResponseText2Usage` 本地估算。
  3. **关键**：一旦开始写流，`OaiStreamHandler` 永远返回 `nil` error（line 197），即使中途上游断流。因此主循环不会重试（无法对已吐一半的流重试）。

## 6. 重试判定

文件：`service/relay_error.go:20 DecideRelayRetry`

- 重试条件（满足其一）：
  - `types.IsChannelError(err)` — 连接级错误（DNS/TCP/超时）。
  - `err.StatusCode` 命中 `ShouldRetryByStatusCode`（默认 5xx、429、307）。
  - status code 未识别（<100 或 >599）。
- 不重试：
  - `IsSkipRetryError`（4xx 参数错误、鉴权失败等）。
  - 2xx。
  - `IsAlwaysSkipRetryStatusCode`（默认含 408/429 之外的 4xx）。
  - pinned channel / strict session。
- 每次重试都 `IncreaseRetry`，循环上界 `common.RetryTimes`（即最多尝试 RetryTimes+1 次）。

## 7. 自动禁用 / 恢复

文件：`service/channel.go:29 DisableChannel`、`service/relay_error.go:63 ProcessChannelError`

1. `ShouldDisableChannel(err)` — 命中 `ShouldDisableByStatusCode` 或关键词。
2. `gopool.Go(func(){ DisableChannel(...) })` — 异步禁用。
3. `model.UpdateChannelStatus(channelId, usingKey, ChannelStatusAutoDisabled, reason)`：
   - 更新 DB。
   - `CacheUpdateChannelStatus` 把该 channel id 从 `group2model2channels` 内存表移除。
4. 恢复：仅靠后台 channel 健康检查任务（`controller/channel-test.go:942 testChannelForHealthCheck`），测试成功后 `service.EnableChannel`。

## 8. 结算与日志

文件：`relay/compatible_handler.go:181`、`service/text_quota.go`

1. 成功后：`service.PostTextConsumeQuota(c, info, usage, nil)` — 按实际 usage 结算（多退少补）。
2. 失败后：`defer relay.RefundFailedRequestBilling` — 退还预扣。
3. `model.RecordConsumeLog` / `RecordErrorLog` — 写消费日志 / 错误日志（含 channel id、model、quota、use_time）。

## 关键函数索引

| 阶段 | 函数 | 文件:行 |
|---|---|---|
| 路由 | `Relay` | `controller/relay.go:71` |
| 首次选渠道 | `SelectChannelForRequest` | `service/channel_select.go:283` |
| 内存路由 | `GetRandomSatisfiedChannel` | `model/channel_cache.go:117` |
| 重试选渠道 | `CacheGetRandomSatisfiedChannel` | `service/channel_select.go:114` |
| 渠道上下文 | `SetupContextForSelectedChannel` | `middleware/distributor.go:551` |
| 预扣 | `PrepareRequestBilling` | `relay/request_billing.go` |
| 转发主循环 | `Relay` for-loop | `controller/relay.go:162` |
| 请求转换 | `TextHelper` | `relay/compatible_handler.go:25` |
| 发 HTTP | `DoApiRequest` | `relay/channel/api_request.go:315` |
| 流式响应 | `OaiStreamHandler` | `relay/channel/openai/relay-openai.go:104` |
| 非流式响应 | `OpenaiHandler` | `relay/channel/openai/relay-openai.go:252` |
| 重试判定 | `DecideRelayRetry` | `service/relay_error.go:20` |
| 自动禁用 | `DisableChannel` | `service/channel.go:29` |
| 结算 | `PostTextConsumeQuota` | `service/text_quota.go` |
