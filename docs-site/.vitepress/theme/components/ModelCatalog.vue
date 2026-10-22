<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Model = {
  model_name: string
  description?: string
  capabilities?: string[]
  context_length?: number
  enable_groups?: string[]
  supported_endpoint_types?: string[]
  billing_mode?: string
  model_price?: number
}

const models = ref<Model[]>([])
const groupRatio = ref<Record<string, number>>({})
const loading = ref(true)
const error = ref('')
const keyword = ref('')
const group = ref('')

const ENDPOINT_LABEL: Record<string, string> = {
  openai: 'OpenAI Chat',
  'openai-response': 'Responses',
  'openai-response-compact': 'Responses Compact',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  'openai-alpha-search': 'Alpha Search',
}

onMounted(async () => {
  try {
    const res = await fetch('/api/pricing')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    models.value = Array.isArray(data?.data) ? data.data : []
    groupRatio.value = data?.group_ratio ?? {}
  } catch (e) {
    error.value = `加载失败：${(e as Error).message}`
  } finally {
    loading.value = false
  }
})

const groups = computed(() => Object.keys(groupRatio.value))

const rows = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return models.value
    .filter((m) => !group.value || (m.enable_groups ?? []).includes(group.value))
    .filter(
      (m) =>
        !k ||
        m.model_name.toLowerCase().includes(k) ||
        (m.description ?? '').toLowerCase().includes(k)
    )
    .sort((a, b) => a.model_name.localeCompare(b.model_name))
})

function context(len?: number) {
  if (!len) return '—'
  return len >= 1000000 ? `${+(len / 1000000).toFixed(2)}M` : `${Math.round(len / 1000)}K`
}

function billing(m: Model) {
  if (m.billing_mode === 'tiered_expr') return '分档计价'
  if (m.model_price && m.model_price > 0) return '按次'
  return '按量'
}

function endpoints(m: Model) {
  return (m.supported_endpoint_types ?? [])
    .map((t) => ENDPOINT_LABEL[t] ?? t)
    .slice(0, 2)
}
</script>

<template>
  <div class="catalog">
    <div class="catalog-toolbar">
      <input v-model="keyword" type="search" placeholder="搜索模型名称或描述" />
      <select v-model="group">
        <option value="">全部分组</option>
        <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
      </select>
      <span class="catalog-count">{{ rows.length }} 个模型</span>
    </div>

    <p v-if="loading" class="catalog-tip">加载中…</p>
    <p v-else-if="error" class="catalog-tip">{{ error }}</p>

    <div v-else class="catalog-wrap">
      <table>
        <thead>
          <tr>
            <th>模型</th>
            <th>上下文</th>
            <th>分组</th>
            <th>协议</th>
            <th>计费</th>
            <th>价格</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in rows" :key="m.model_name">
            <td>
              <a :href="`/pricing/${encodeURIComponent(m.model_name)}`" target="_blank">{{ m.model_name }}</a>
              <div class="catalog-desc">{{ m.description }}</div>
            </td>
            <td class="catalog-num">{{ context(m.context_length) }}</td>
            <td>
              <span v-for="g in m.enable_groups" :key="g" class="catalog-chip">{{ g }}</span>
            </td>
            <td>{{ endpoints(m).join('、') }}</td>
            <td>{{ billing(m) }}</td>
            <td><a :href="`/pricing/${encodeURIComponent(m.model_name)}`" target="_blank">查看模型详情 →</a></td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="catalog-tip">
      价格随分组倍率与档位浮动，这里不缓存；点「查看模型详情」到模型广场看实时分档价格。
    </p>
  </div>
</template>

<style>
.catalog-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 16px 0 12px;
  flex-wrap: wrap;
}

.catalog-toolbar input,
.catalog-toolbar select {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
  font-size: 13px;
}

.catalog-toolbar input {
  flex: 1;
  min-width: 200px;
}

.catalog-count {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.catalog-wrap {
  overflow-x: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
}

.catalog table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  display: table;
}

.catalog th,
.catalog td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
}

.catalog thead th {
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-2);
  font-weight: 500;
  white-space: nowrap;
}

.catalog tbody tr:last-child td {
  border-bottom: 0;
}

.catalog-num {
  font-family: var(--vp-font-family-mono);
  white-space: nowrap;
}

.catalog td:first-child {
  min-width: 260px;
}

.catalog-desc {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  margin-top: 2px;
}

.catalog-chip {
  display: inline-block;
  padding: 1px 6px;
  margin: 0 4px 2px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  font-size: 11px;
  color: var(--vp-c-text-2);
}

.catalog-tip {
  color: var(--vp-c-text-2);
  font-size: 12px;
  margin-top: 10px;
}

.copy-md {
  display: flex;
  justify-content: flex-end;
  margin-bottom: -8px;
}

.copy-md button {
  padding: 2px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 12px;
  cursor: pointer;
}

.copy-md button:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}
</style>
