# RELAY-FINDINGS — 渠道选择 / 重试 / 上游转发 / 密钥泄露面 审计清单

> 审计范围：渠道选择算法、重试链路、并发状态、上游密钥与请求头、OpenRouter 上游同步、错误透传、超时与上下文、模型别名。
> 所有结论基于源码逐行核实。文件路径均为绝对路径。

---

## CRITICAL

### C1. 自动恢复的渠道在内存路由表中"消失"，直到下一次全量同步才被选中

**位置**：
- `J:\hubapi\new-api\model\channel_cache.go:251-274`（`CacheUpdateChannelStatus`）
- `J:\hubapi\new-api\model\channel.go:753-832`（`UpdateChannelStatus`）
- `J:\hubapi\new-api\service\channel.go:50-58`（`EnableChannel`）

**证据**：
```go
// channel_cache.go:251
func CacheUpdateChannelStatus(id int, status int) {
    channelSyncLock.Lock()
    defer channelSyncLock.Unlock()
    if channel, ok := channelsIDM[id]; ok {
        channel.Status = status
    }
    if status != common.ChannelStatusEnabled {
        // 只有"禁用"分支：从 group2model2channels 里删掉
        for group, model2channels := range group2model2channels {
            for model, channels := range model2channels {
                for i, channelId := range channels {
                    if channelId == id {
                        group2model2channels[group][model] = append(channels[:i], channels[i+1:]...)
                        break
                    }
                }
            }
        }
    }
    // status == Enabled 时：什么都不做 —— 不会把 channel id 加回 group2model2channels
}
```

`EnableChannel` → `UpdateChannelStatus(id, "", ChannelStatusEnabled, "")` → 走非 multi-key 分支（`channel.go:780-786`）：
```go
} else {
    if channelCache.Status == status { return false }
    CacheUpdateChannelStatus(channelId, status)  // status=Enabled，不进入删除分支，也不重新加入
}
```
而 `group2model2channels` 只在 `InitChannelCache()`（全量重建）时写入（`channel_cache.go:81-82`）。`EnableChannel` 路径不调用 `InitChannelCache()`。

**触发路径**：
1. 上游返回 5xx → `ProcessChannelError` → `DisableChannel` → `CacheUpdateChannelStatus(id, AutoDisabled)` 把 id 从 `group2model2channels` 删除。
2. 后台健康检查任务（`controller/channel-test.go:984-985`）测试该渠道成功 → `service.EnableChannel` → `UpdateChannelStatus(id, "", Enabled)`。
3. `channelsIDM[id].Status` 被更新为 Enabled，但 `group2model2channels[group][model]` 里没有这个 id。
4. 在 `SyncChannelCache` 下一次 tick（`common.SyncFrequency` 秒）之前，`GetRandomSatisfiedChannel` 永远选不到这个渠道。

**影响**：
- 如果该 group/model 下只有这一个渠道，恢复期间所有请求返回 "no available channel"。
- 如果有多渠道，该渠道在窗口期内完全不接流量，等于"半残"状态。
- 多 key 模式下同理：`handlerMultiKeyUpdate` 在 `beforeStatus != channelCache.Status` 时调 `CacheUpdateChannelStatus`，恢复时同样不重新加入。

**建议改法**：
在 `CacheUpdateChannelStatus` 的 `status == ChannelStatusEnabled` 分支里，把 channel id 重新追加回 `group2model2channels` 中该渠道所属的所有 group/model 列表（从 `channelsIDM[id].Group` 和 `Models` 解析），并按 priority 重排。或在 `EnableChannel` 成功后直接调用 `InitChannelCache()`（成本更高但最简单）。

---

## MAJOR

### M1. 重试不会排除已尝试过的渠道，可能反复打同一个坏渠道

**位置**：
- `J:\hubapi\new-api\model\channel_cache.go:117-217`（`GetRandomSatisfiedChannel`）
- `J:\hubapi\new-api\service\channel_select.go:390-392`（`AppendUsedChannel` 仅记录日志）

**证据**：
```go
// channel_cache.go:132
channels, _ := filterCandidateIDs(group2model2channels[group][model], model, filters)
// filters 里只有 RequestPath / TaskPluginIdentity / ResponsesWebSocket —— 没有"已用渠道"排除
```
`filterCandidateIDs`（`model/channel_constraint.go:40`）只按 request_path / task_plugin / ws 过滤，不读 `c.GetStringSlice("use_channel")`。

**触发路径**：
1. group/default 下 model=X 有两个渠道 A（坏）和 B（好），同 priority。
2. retry=0 加权随机选中 A → A 返回 503。
3. auto_ban 关闭，或错误码不在 `ShouldDisableByStatusCode` 里 → A 不被禁用。
4. retry=1：如果只有一个 priority 层，`retry` 被 clamp 到 0（`channel_cache.go:165-167`），仍在同层加权随机 → 有概率再次选中 A。
5. 最坏情况：3 次重试全部打 A，B 一次都没被试到。

**影响**：
- 同一上游被重复打（放大攻击面 / 配额浪费）。
- 用户看到的是"网关全挂了"，实际上只是单个渠道坏了。

**建议改法**：
在 `RetryParam` 里加 `UsedChannelIDs map[int]struct{}`，在 `GetRandomSatisfiedChannel` 里通过 filters 或显式排除已用 id。当某层所有渠道都被试过且仍失败，再降级到下一层。

---

### M2. 同一 priority 层内重试不会尝试同层的其他渠道，直接跳到下一个 priority 层

**位置**：`J:\hubapi\new-api\model\channel_cache.go:165-182`

**证据**：
```go
if retry >= len(uniquePriorities) {
    retry = len(uniquePriorities) - 1
}
targetPriority := int64(sortedUniquePriorities[retry])
// 只取 targetPriority 这一层的渠道
for _, channelId := range channels {
    if channel.GetPriority() == targetPriority {
        targetChannels = append(targetChannels, channel)
    }
}
```
retry=0 → 最高 priority 层随机选一个；retry=1 → 直接降到次高 priority 层。同层其他渠道不会被尝试。

**触发路径**：
- priority=10 有渠道 A（坏）、B（好）；priority=0 有渠道 C。
- retry=0 随机选到 A → A 失败。
- retry=1 直接跳到 priority=0 的 C，B 永远不被试到。

**影响**：
- 高 priority 池的冗余渠道形同虚设：只要随机选到的那个坏了，同池其他健康渠道不参与重试。
- 与 M1 叠加：如果只有一个 priority 层，还会重复选同一个。

**建议改法**：
在同一 priority 层内维护一个"已试渠道集合"，同层重试时先把同层其他渠道试完，再降级。

---

### M3. 上游 HTTP 请求未绑定客户端 context，客户端断连后上游调用继续

**位置**：`J:\hubapi\new-api\relay\channel\api_request.go:321`

**证据**：
```go
req, err := http.NewRequest(c.Request.Method, fullRequestURL, requestBody)
// 注意：不是 http.NewRequestWithContext(c.Request.Context(), ...)
```
对比 task 路径（`api_request.go:630`）正确使用了 `NewRequestWithContext`。

**触发路径**：
1. 用户发一个非流式 chat 请求，上游处理很慢（30s+）。
2. 用户在 5s 后关闭客户端。
3. `c.Request.Context()` 被 cancel，但上游 `req` 没有绑这个 ctx → `relayClient.Do(req)` 继续等上游响应。
4. 直到 `client.Timeout`（`RelayTimeout`）或上游返回才结束。
5. 上游返回后，`OpenaiHandler` 读完整 body，尝试写客户端（已断），写失败。但上游已经计费、网关已经扣 quota。

**影响**：
- 上游配额浪费（用户取消了但上游照样生成）。
- goroutine/连接占用直到超时。
- 流式路径部分缓解（`StreamScannerHandler` 有 `c.Request.Context().Err()` 检查，`stream_scanner.go:307`），但非流式完全没有。

**建议改法**：
把 `http.NewRequest` 改成 `http.NewRequestWithContext(c.Request.Context(), ...)`。流式场景如果担心长连接被客户端断连误伤，可对 stream 请求单独评估。

---

### M4. 自动禁用在 goroutine 里异步执行，重试可能打到刚被判定要禁用的渠道

**位置**：
- `J:\hubapi\new-api\service\relay_error.go:71-73`
- `J:\hubapi\new-api\controller\relay.go:211-217`

**证据**：
```go
// relay_error.go:71
gopool.Go(func() {
    DisableChannel(channelError, reason)
})
```
```go
// controller/relay.go:211
decision := service.DecideRelayRetry(c, newAPIError, ...)
service.RecordPolicyFailure(c, channel.Id, newAPIError, decision)
processChannelError(c, *types.NewChannelError(...), newAPIError, relayInfo)  // 异步禁用
if decision.Action != "retry" { break }
// 下一轮循环立即 getChannel —— goroutine 可能还没把渠道从路由表删掉
```

**触发路径**：
1. 渠道 A 返回 503，触发自动禁用。
2. `processChannelError` 启动 goroutine 去 `DisableChannel` → `UpdateChannelStatus` → `CacheUpdateChannelStatus`。
3. 主循环立刻进入下一轮 retry，调 `getChannel` → `GetRandomSatisfiedChannel`。
4. 如果 goroutine 还没跑完（调度延迟、DB 写延迟、锁竞争），A 仍在 `group2model2channels` 里。
5. retry 选中 A → 又打一次坏渠道。

**影响**：
- 对同一个已判定为坏的上游多打一次。
- 在极端高并发下，多个并发请求同时打到同一个刚坏的渠道（每个请求的 goroutine 禁用都要排队）。

**建议改法**：
在 `ProcessChannelError` 里同步先把 channel id 从内存路由表移除（轻量、无 DB），再异步做 DB 更新和通知。或在重试选渠道时把本次失败的 channel id 加入临时排除集合。

---

### M5. `filterAbilitiesByConstraints` 在 DB 查询失败时"失败开放"，可能放行不满足约束的渠道

**位置**：`J:\hubapi\new-api\model\ability.go:194-199`

**证据**：
```go
if err := DB.Where("id IN ?", channelIds).Find(&channels).Error; err != nil {
    if identityFilterRequiresKey(filters) {
        return nil
    }
    return abilities  // ← DB 挂了，不过滤了，全部放行
}
```

**触发路径**：
1. 内存缓存未开启（`MemoryCacheEnabled=false`），走 DB 路径 `GetChannel`。
2. 此时 DB 闪断 / 连接池耗尽 → `DB.Find(&channels)` 报错。
3. 如果当前请求没有 task-plugin identity filter，函数直接返回未过滤的 abilities。
4. 结果：一个不满足 request_path 或其他约束的渠道被选中。

**影响**：
- DB 故障期间，渠道约束（如 task-plugin 绑定、高级自定义 path 匹配）被绕过。
- 可能把请求发到不该接这个 path 的渠道，造成上游报错或计费错配。

**建议改法**：
DB 查询失败时应返回 error，让上层走"no channel available"而不是放行。或至少对 request_path / responses_websocket 这类 filter 也 fail-closed。

---

## MINOR

### m1. `EditChannelByTag` 修改 priority/weight 后内存路由表不重排

**位置**：`J:\hubapi\new-api\model\channel.go:865-919`

**证据**：
```go
// channel.go:913
err := UpdateAbilityByTag(tag, newTag, priority, weight)  // 只更新 abilities 表
```
但内存路由 `group2model2channels` 的排序是基于 `channelsIDM[id].Priority`（`channel_cache.go:74-76`），不是 abilities 表。`EditChannelByTag` 不调 `CacheUpdateChannel` 也不调 `InitChannelCache()`。

**影响**：批量改 tag 的 priority/weight 后，内存路由仍按旧权重随机，直到下一次全量同步。DB fallback 路径用 abilities 表是新值 —— 两条路径短期不一致。

**建议改法**：在 `EditChannelByTag` 成功后对受影响渠道调 `CacheUpdateChannel` + 重排，或直接 `InitChannelCache()`。

---

### m2. Header override 的 `{client_header:<name>}` 占位符不限制 header 名，可把用户 Authorization 透传给上游

**位置**：`J:\hubapi\new-api\relay\channel\api_request.go:155-186`

**证据**：
```go
// applyHeaderOverridePlaceholders
clientHeaderValue := c.Request.Header.Get(name)
// name 可以是 "Authorization" —— 没有黑名单
```
虽然 `processHeaderOverride` 的透传规则（`"*"` / `re:`）跳过了 `authorization/x-api-key/x-goog-api-key`（`api_request.go:94-96`），但显式 `{client_header:authorization}` 占位符路径没有这个保护。

**触发路径**：管理员在渠道 header_override 里配 `{"Authorization": "{client_header:authorization}"}`（误配或恶意）→ 用户的原始上游 key 被透传到该渠道的上游 URL。

**影响**：用户的 API key 泄露给第三方上游。需要管理员主动配置才触发，但代码层无防御。

**建议改法**：在 `applyHeaderOverridePlaceholders` 里对 `name` 做黑名单检查（authorization/x-api-key/x-goog-api-key/cookie），命中时返回错误或忽略。

---

### m3. 流式中途上游断流被记为成功，不重试也不告警

**位置**：`J:\hubapi\new-api\relay\channel\openai\relay-openai.go:104-198`

**证据**：
`OaiStreamHandler` 调 `StreamScannerHandler`（`helper/stream_scanner.go`），错误记录在 `info.StreamStatus`，但函数始终 `return usage, nil`（line 197）。主循环看到 nil error 就走成功结算分支。

**触发路径**：上游在吐了 50% 内容后断流（EOF 不带 `data: [DONE]`）。`StreamStatus.EndReason` = EOF / ScannerErr，但 gateway 返回 200 给客户端并按已收到的 token 数计费。

**影响**：
- 客户端看到半截响应但 HTTP 200，无法触发自己的重试。
- 上游渠道的健康度不会因为"流式断流"下降（因为没走 `ProcessChannelError`）。

**建议改法**：在 `OaiStreamHandler` 结束后检查 `info.StreamStatus.HasErrors()`；如果在写出第一个 chunk 之前失败，返回 error 让主循环重试；如果已写出部分内容，至少写一条 warning 日志并考虑半额退款。

---

### m4. 多 key 轮询索引在内存缓存模式下不落库，重启后丢失

**位置**：`J:\hubapi\new-api\model\channel.go:276-285`

**证据**：
```go
defer func() {
    if !common.MemoryCacheEnabled {
        _ = channel.SaveChannelInfo()
    } else {
        // CacheUpdateChannel(channel)  // 被注释掉了
    }
}()
```
内存缓存开启时，轮询索引只改内存里的 `channel.ChannelInfo.MultiKeyPollingIndex`，不写 DB。重启后从 DB 加载，索引归零。

**影响**：多 key 轮询在重启后从第一个 key 重新开始，短期偏向第一个 key。不影响正确性，只影响负载均衡平滑度。

**建议改法**：周期性把 polling index 批量落库，或接受这个已知行为并在文档里说明。

---

## 审计中已核实无问题的点

- **渠道 Key trim**：`GetNextEnabledKey`（`model/channel.go:224`）对单 key 做 `strings.TrimSpace`；`GetKeys`（line 212）对每个换行分割的 key 做 `TrimSpace`。提交 b98d745 修复已生效。
- **用户 Key 不透传上游**：`DoApiRequest` 新建 `http.Request`，只从 `c.Request.Header` 复制 Content-Type/Accept；header 透传黑名单包含 authorization/x-api-key/x-goog-api-key。
- **二次转发渠道（sub2api/newapi/submodel）**：`SetupRequestHeader` 均设置 `Authorization: Bearer <渠道自身ApiKey>`，不读用户 key。
- **流式已吐一半不重试**：`OaiStreamHandler` 返回 nil error，主循环不会重试。符合正确行为。
- **元数据同步事务**：`model_metadata_sync.go:19-28` 用进程互斥锁 + DB 行锁（`lockForUpdate` on options anchor）+ 事务，乐观锁 `RecordVersion` 防止覆盖人工 override。
- **OpenRouter 透传 header**：`openai/adaptor.go:242-249` 设置 HTTP-Referer / X-OpenRouter-Title，不泄露用户 key。
