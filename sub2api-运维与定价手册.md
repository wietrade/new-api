# sub2api 运维与定价手册（hubapi）

> 整理时间：2026-10-21　环境：WSL2 Ubuntu（root）　维护范围：sub2api + new-api + Redis + PostgreSQL + 上游 znbcode

---

## 1. 系统架构

```
客户 / 下游
   │  (sk- 用户 key, OpenAI 或 Anthropic 协议)
   ▼
new-api  :3000   ── 渠道类型「Sub2API」──▶  sub2api :8080  ──▶  上游 znbcode.com
（对外售卖、计费）        base: http://localhost:8080          （Claude / GPT / Gemini / Grok …）
```

| 组件 | 端口 | 数据/配置 |
|:---|:---|:---|
| sub2api | 8080 | PostgreSQL `sub2api` 库 + Redis db0 + `/root/sub2api/backend/config.yaml` |
| new-api | 3000 | SQLite `/root/new-api-bin/one-api.db` |
| Redis | 6379 | 缓存/调度快照（**必须 ≥ 6.2，现为 8.10.2**）|
| PostgreSQL | 5432 | 账户、分组、渠道定价、用量 |

---

## 2. 密钥与权限边界（务必分清）

| 密钥 | 前缀 | 用途 | 能否走网关 |
|:---|:---|:---|:---|
| 管理员 API Key | `admin-` | 只打 `/api/v1/admin/*`（请求头 `x-api-key`）| ❌ 401 |
| 用户 API Key | `sk-` | 绑定**某个分组**，走 `/v1/messages`、`/v1/chat/completions`、`/v1/models` | ✅ |

- 管理员 key 存放在 `/root/.sub2api-admin-key`（600），源头是 DB `settings.admin_api_key`。
- **一个 sk key 只能走一个分组** ⇒ 要卖 N 个分组，就要 N 个 key + new-api 里 N 条渠道。
- 不要把 `admin-` key 填进 new-api 渠道（权限过大且会外泄）。

---

## 3. 定价模型（核心）

```
用户实付（每 1M token）= 渠道价 × 分组倍率
我们的成本            = 渠道价 × 账号倍率
毛利                  = 1 − 账号倍率 ÷ 分组倍率
```

| 价格层级 | 存放位置 | 谁在改 | 说明 |
|:---|:---|:---|:---|
| **渠道价**（基础价/标价）| `channel_model_pricing` | 渠道管理 / 脚本 | 该渠道下所有分组共用 |
| **分组定价卡** | `groups.model_pricing` | 分组管理 | 覆盖渠道价，**填标价**，之后仍乘分组倍率 |
| **账号倍率（成本）** | `accounts.rate_multiplier` | 上游探测/同步 | 只影响成本核算与利润控制，不影响报价 |
| **分组倍率（售价）** | `groups.rate_multiplier` | 分组管理 | 直接决定利润 |
| 用户专属倍率 | `user_group_rate_multipliers` | 用户管理 | 优先于分组倍率 |
| 生图/视频独立倍率 | `groups.image_rate_multiplier` / `video_rate_multiplier` | 分组管理 | 开关开启后覆盖通用倍率 |
| 高峰倍率 | `groups.peak_rate_multiplier` | 分组管理 | 指定时段再乘 |
| 分时倍率 | 渠道定价 `time_pricing` | 渠道管理 | 按时间段整单乘 |

### 方向不要搞反
- **提高分组倍率 = 卖得更贵 = 利润更高**
- 利润为 0 的临界点：`分组倍率 = 账号倍率`

### 当前统一策略（2026-10-21）
- 账号倍率 = 上游探测的真实倍率（0.09 / 0.2 / 0.3 / 0.5 / 0.9 / 1.0 / 1.5 …）
- 分组倍率 = 账号倍率 × **1.25** ⇒ 统一 **20% 毛利**
- 全部分组 `profit_control_enabled = false`

一键重算（上游调价后执行）：
```sql
update accounts a
set rate_multiplier = (a.extra->'upstream_billing_probe'->'data'->>'group_rate_multiplier')::numeric
from account_groups ag
where ag.account_id=a.id
  and (a.extra->'upstream_billing_probe'->'data'->>'group_rate_multiplier') is not null;

update groups g
set rate_multiplier = round(a.rate_multiplier * 1.25, 4), updated_at=now()
from account_groups ag join accounts a on a.id=ag.account_id
where ag.group_id=g.id and g.status='active';
```
改完 `systemctl restart sub2api`（分组/账号缓存在调度快照里）。

---

## 4. 模型广场

| 事项 | 说明 |
|:---|:---|
| 匿名访问 | `backend_mode_enabled=true` 会拦匿名；已在路由守卫放行「require_auth=false 的广场」|
| 展示来源 | 渠道定价（`channel_model_pricing`）∩ 账号 `model_mapping` 白名单 |
| 分组排序 | Claude(anthropic) → OpenAI → 其余；桶内按倍率、名称（前后端都改过）|
| 实付价 | 渠道价/分组卡 × 分组倍率，符号 **¥**（业务上 1 元充值 = 1 美元额度）|
| 官方价 | 本地 LiteLLM 目录（`data/model_pricing.json`）+ `data/pricing_override.json` 覆盖 |
| 折扣 | `(1 − 分组倍率 / 6.78) × 100%`，柠檬绿胶囊 `xx% off` |
| 汇率常量 | `frontend/src/utils/plaza-discount.ts` → `CNY_PER_USD = 6.78` |

官方价覆盖：
- 文件 `/root/sub2api/backend/data/pricing_override.json`，`config.yaml` 里 `pricing.override_file` 指过去；
- 改完 **10 分钟内**按文件指纹热重载（也可重启立即生效）；
- `deepseek-*` 有代码内置价卡，override 无效；
- znbcode 的 `official_pricing` 有 5 个模型标的是 **CNY**（kimi-k3 / glm-5.3 / glm-5.3-flash / gpt-5.6-luna / deepseek-v4.1-flash），直接当 USD 用会虚高约 6.78 倍 —— 已从 override 剔除。

---

## 5. 日常操作

### 5.1 新建一个售卖分组（以新上游为例）
1. sub2api：建 channel（上游地址 + key）→ 导入模型定价；
2. 建 group（平台、倍率）→ 绑定 channel（`channel_groups`）；
3. 建 account（api_key + base_url + `model_mapping`）→ 绑定 group（`account_groups`）；
4. 后台「API 密钥」为该 group 建一个 `sk-` key；
5. new-api：建渠道（类型 **Sub2API**，base `http://localhost:8080`，key 填该 sk）→ 模型填该组清单。

### 5.2 下架某模型（三处必须一起做）
1. 删 `channel_model_pricing`（+ `channel_pricing_intervals`）→ 广场不再展示；
2. 账号 `credentials.model_mapping` 删掉该模型；
3. ⚠️ **mapping 清空 = 直通（全部允许）**，若整组下架，要把该组从 `channel_groups` 解绑；
4. 需要严格拒绝未定价模型时：`channels.restrict_models = true`。

### 5.3 改价
| 目的 | 改哪里 |
|:---|:---|
| 只调某个分组利润 | 分组倍率 |
| 整体跟随上游基础价 | 渠道定价（所有分组同步变化）|
| 某个分组单独特价 | 分组定价卡（填**标价**，别填折后价）|

### 5.4 缓存
```bash
redis-cli -n 0 --scan --pattern 'apikey:auth:*' | xargs -r redis-cli -n 0 del
systemctl restart sub2api
```

---

## 6. 从 znbcode 同步上游

| 脚本（`/mnt/j/hubapi`）| 作用 |
|:---|:---|
| `import_plaza.py <plaza.json> <channel_id>` | 39 个模型的渠道定价 + 区间档位 |
| `gen_pricing_override.py <plaza.json>` | 官方参考价覆盖 |
| `set_model_mapping.py` | 各账号 `/v1/models` → `model_mapping` |

```bash
curl -s --max-time 40 https://znbcode.com/api/v1/model-plaza -o /tmp/znb2.json
python3 /mnt/j/hubapi/import_plaza.py /tmp/znb2.json 4
python3 /mnt/j/hubapi/gen_pricing_override.py /tmp/znb2.json
# 然后跑第 3 节的账号倍率同步 + 分组倍率重算 SQL
```
注意：
- 上游用 Python 默认 UA 会被 Cloudflare **403**，必须带浏览器 UA；
- 渠道定价是**渠道级共享**，同名模型多组不同价时只能取一份（现有 gpt-image 系列 3 处冲突）；
- 上游「官方价」多数是真官方价，少数（5 个 CNY）不是。

---

## 7. 故障排查

### 7.1 503 `No available accounts`
按顺序查：
1. **Redis 版本**：日志出现 `ERR syntax error`（`SET key val GET` 需要 6.2+）→ 升级 Redis；
2. **利润控制**：`profit_control_enabled=true` 且 `账号倍率 > 分组倍率×(1−margin−buffer)` → 账号被静默 veto。
   查日志 `profit_control_activity` 的 `threshold`；
3. `restrict_models` 下模型无定价；
4. 账号 `status` / `schedulable` / `temp_unschedulable_until`；
5. 账号 `model_mapping` 是否包含所请求模型。

诊断命令：
```bash
journalctl -u sub2api -n 300 --no-pager | grep -iE 'scheduler\]|profit_control|no available'
redis-cli --scan --pattern 'sched:*16*' | head
redis-cli get sched:acc:11 | head -c 400
```

### 7.2 401 INVALID_API_KEY
- key 不属于该实例（删过/换过库）；
- 用了 `admin-` key 调网关；
- 修改 key 的 group/余额后未清缓存。

### 7.3 渠道保存报「按次/图片计费模式必须设置默认价格或至少一个计费层级」
前端会**全局**校验该渠道所有定价条目：任一 `per_request`/`image` 条目既无单价又无区间就整表拦截。
复制别名定价行时务必连 `channel_pricing_intervals` 一起复制。

### 7.4 模型广场 403 `Backend mode is active`
`backend_mode_enabled=true` 且广场 `require_auth=true`。已改：`require_auth=false` 时跳过该守卫。

### 7.5 价格显示不对
- 优先看 **分组定价卡**（会覆盖渠道价）；
- 折扣列是**人民币口径**（÷6.78），与「实付 ÷ 官方」不完全等号；
- 官方价列看 `pricing_override.json` 与目录版本（`data/model_pricing.json` 每 24h 自动更新）。

---

## 8. 版本升级（跟随官方）

```bash
cd /root/sub2api
git fetch origin main            # HTTPS 被墙时：export HTTPS_PROXY=http://172.20.192.1:7897
git merge origin/main            # 冲突热点：frontend/package.json、pnpm-lock.yaml
cd frontend && pnpm install && ./node_modules/.bin/vite build
cd ../backend && export GOPROXY=https://goproxy.cn,direct
CGO_ENABLED=0 go build -tags embed -trimpath -o /tmp/sub2api ./cmd/server
cp -a sub2api sub2api.bak-$(date +%Y%m%d); install -m 755 /tmp/sub2api sub2api
systemctl restart sub2api
```

要点：
- **必须带 `-tags embed`**，否则面板 404（二进制小约 6MB）；
- `pnpm` 11 不读 `package.json` 的 `pnpm` 字段 → `overrides` / `onlyBuiltDependencies` 写在 `frontend/pnpm-workspace.yaml`；
- 新版本 go.mod 要求 go1.27.3，直连 proxy.golang.org 会超时；
- 升级前**先备份 DB**（新版本可能跑迁移）；
- 自定义改动都在分支 `local/custom-20261021`：
  广场匿名访问、平台排序、CNY 折扣/表头、固定列宽、账号模型同步搜索勾选。

---

## 9. 备份与回滚清单

| 内容 | 位置/方式 |
|:---|:---|
| 源码 | `/root/backup-sub2api-src-*.tgz` |
| 数据库 | `/root/backup-sub2api-db-*.sql.gz`（`pg_dump \| gzip`）|
| 二进制 | `backend/sub2api.bak-*`（pre-upstream / old-rollback / 各次改动）|
| 前端/后端源文件 | 仓库内 `*.bak-YYYYMMDD`（已移出仓库到 `/root/sub2api-bak-files/`）|
| 分组倍率旧值 | DB 表 `_groups_rate_backup_20261021` |
| 官方价覆盖 | `data/pricing_override.json.bak-*` |
| 配置 | `backend/config.yaml.bak-*` |

回滚分组倍率：
```sql
update groups g set rate_multiplier = b.rate_multiplier
from _groups_rate_backup_20261021 b where b.id = g.id;
```

---

## 10. 已知遗留 / 待办

| 项 | 状态 |
|:---|:---|
| `Grok-studio` 倍率 2.0 → 0.1875（成本 0.15）| 待确认是否特殊定价 |
| `GPT特惠` 0.12 → 0.1125（成本 0.09）| 略降价，待确认 |
| new-api 只有 1 条 Sub2API 渠道（Claude 特惠）| 其它分组需各自建 key + 渠道 |
| `gpt-6-luna` 无上游定价 | 现被 `restrict_models` 拦截，等于不售卖 |
| gpt-image 系列 3 处价格冲突 | 渠道级定价只能取一份 |
| 价格同步 + 毛利巡检 | 建议做成定时任务（可选）|
| `deepseek-*` 官方价不可覆盖 | 代码内置价卡 |
