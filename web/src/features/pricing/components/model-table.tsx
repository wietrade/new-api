import { useQuery } from '@tanstack/react-query'
import {
  AudioLines,
  Boxes,
  Braces,
  Brain,
  Code,
  Database,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  ListOrdered,
  MessageSquare,
  MessageSquareText,
  Paperclip,
  Save,
  Video,
  Wrench,
} from 'lucide-react'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import type { ModelPerfBadgeData } from '@/features/pricing/components/model-perf-badge'
import { getSuccessRateDotClass } from '@/features/performance-metrics/lib/format'
import type { SuccessRatePoint } from '@/features/performance-metrics/types'
import { getLobeIcon } from '@/lib/lobe-icon'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import {
  formatDynamicUnitPrice,
  formatTaskUsageUnitPrice,
  getDynamicDisplayGroupRatio,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  type DynamicPriceEntry,
} from '../lib/dynamic-price'
import { getDisplayGroupRatio } from '../lib/model-helpers'
import { formatPrice } from '../lib/price'
import { taskUsageUnitLabel } from '../lib/task-price-display'
import type {
  Modality,
  ModelCapability,
  PricingModel,
  TokenUnit,
} from '../types'

export interface ModelTableProps {
  models: PricingModel[]
  onModelClick: (modelName: string) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string}

const CAPABILITY_META: Record<
  string,
  { icon: typeof MessageSquare; label: string }
> = {
  chat: { icon: MessageSquare, label: '对话' },
  reasoning: { icon: Brain, label: '推理' },
  tools: { icon: Wrench, label: '工具调用' },
  structured_output: { icon: Braces, label: '结构化输出' },
  cache_implicit: { icon: Database, label: '隐式缓存' },
  cache_explicit: { icon: Save, label: '显式缓存' },
  vision: { icon: Eye, label: '视觉' },
  files: { icon: Paperclip, label: '文件' },
  audio: { icon: AudioLines, label: '音频' },
  image_generation: { icon: ImageIcon, label: '生图' },
  video_generation: { icon: Video, label: '生视频' },
  embedding: { icon: Boxes, label: '向量' },
  rerank: { icon: ListOrdered, label: '重排' },
  web_search: { icon: Globe, label: '联网' },
  code_interpreter: { icon: Code, label: '代码执行' },
}

/** 输入模态是另一条轴（吃什么），和 capabilities（功能特性）并列展示。 */
const MODALITY_META: Record<
  Modality,
  { icon: typeof MessageSquare; label: string }
> = {
  text: { icon: MessageSquareText, label: '文本输入' },
  image: { icon: ImageIcon, label: '图片输入' },
  file: { icon: FileText, label: '文件输入' },
  audio: { icon: AudioLines, label: '音频输入' },
  video: { icon: Video, label: '视频输入' },
}

function formatContext(tokens?: number): string {
  if (!tokens || tokens <= 0) return '—'
  if (tokens >= 1_000_000) {
    const v = tokens / 1_000_000
    return `${v >= 10 ? Math.round(v) : Number(v.toFixed(1))}M`
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

function CapabilityIcons(props: {
  capabilities?: ModelCapability[]
  inputModalities?: Modality[]
}) {
  const modalities = (props.inputModalities ?? []).filter((m) => MODALITY_META[m])
  const caps = (props.capabilities ?? []).filter((c) => CAPABILITY_META[c])
  const items = [
    ...modalities.map((m) => ({ key: `modality:${m}`, ...MODALITY_META[m] })),
    ...caps.map((c) => ({ key: `capability:${c}`, ...CAPABILITY_META[c] })),
  ]
  if (items.length === 0) {
    return <span className='text-muted-foreground/60 text-xs'>—</span>
  }
  const shown = items.slice(0, 6)
  const rest = items.length - shown.length

  return (
    <div className='flex items-center gap-1.5'>
      {shown.map((item) => {
        const Icon = item.icon
        return (
          <span
            key={item.key}
            title={item.label}
            className='text-muted-foreground/80'
          >
            <Icon className='size-3.5' strokeWidth={1.8} />
          </span>
        )
      })}
      {rest > 0 && (
        <span
          className='text-muted-foreground/70 text-[11px]'
          title={items
            .slice(6)
            .map((item) => item.label)
            .join(' · ')}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}

function PriceStack(props: {
  list: string
  ours: string
  unit?: string
}) {
  const differs = props.list !== props.ours
  return (
    <div className='leading-tight'>
      {differs && props.list !== '—' && (
        <div className='text-muted-foreground/60 text-[11.5px] line-through tabular-nums'>
          {props.list}
          {props.unit && <span className='ml-0.5 text-[10px]'>/{props.unit}</span>}
        </div>
      )}
      <div className='text-[13px] font-semibold tabular-nums'>
        {props.ours}
        {props.unit && props.ours !== '—' && (
          <span className='text-muted-foreground ml-0.5 text-[10.5px] font-normal'>
            /{props.unit}
          </span>
        )}
      </div>
    </div>
  )
}

const STATUS_SAMPLE_LIMIT = 24

// 与模型详情卡片一致的状态检测：成功率百分比 + 最近每小时的成功/失败色条。
function ModelStatusCell(props: { perf?: ModelPerfBadgeData }) {
  const { t } = useTranslation()
  const perf = props.perf
  const successRate = perf?.success_rate
  const hasSuccessRate =
    typeof successRate === 'number' &&
    Number.isFinite(successRate) &&
    successRate >= 0 &&
    successRate <= 100
  const samples: SuccessRatePoint[] = useMemo(
    () =>
      (perf?.recent_success_series ?? [])
        .filter(
          (point) =>
            Number.isFinite(point.ts) &&
            Number.isFinite(point.success_rate) &&
            point.success_rate >= 0 &&
            point.success_rate <= 100
        )
        .sort((a, b) => a.ts - b.ts)
        .slice(-STATUS_SAMPLE_LIMIT),
    [perf?.recent_success_series]
  )
  const latencyMs = perf?.avg_latency_ms
  const hasLatency =
    typeof latencyMs === 'number' && Number.isFinite(latencyMs) && latencyMs > 0
  const tooltip = hasLatency
    ? `${t('Status')} ${hasSuccessRate ? successRate.toFixed(2) + '%' : '—'} · ${t('Latency short')} ${(latencyMs / 1000).toFixed(1)}s`
    : t('No performance data available')

  if (!hasSuccessRate && samples.length === 0) {
    return <span className='text-muted-foreground/50 text-xs'>—</span>
  }

  return (
    <div className='flex flex-col gap-1' title={tooltip}>
      <span className='text-[12.5px] font-medium tabular-nums'>
        {hasSuccessRate ? `${successRate.toFixed(2)}%` : '—'}
      </span>
      <span role='img' aria-label={tooltip} className='flex h-2.5 items-center gap-px'>
        {samples.length > 0 ? (
          samples.map((sample) => (
            <span
              key={sample.ts}
              aria-hidden
              className={cn(
                'h-full w-[3px] shrink-0 rounded-xs',
                getSuccessRateDotClass(sample.success_rate)
              )}
            />
          ))
        ) : (
          <span className='text-muted-foreground/50 text-[11px]'>—</span>
        )}
      </span>
    </div>
  )
}

export const ModelTable = memo(function ModelTable(props: ModelTableProps) {
  const { t, i18n } = useTranslation()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'

  const recentModels = useMemo(
    () => props.models.map((m) => m.model_name || '').filter(Boolean),
    [props.models]
  )

  const perfQuery = useQuery({
    queryKey: ['perf-metrics-summary', 24, recentModels],
    queryFn: async () =>
      requireServerSuccess(await getPerfMetricsSummary(24, recentModels)),
    enabled: recentModels.length > 0,
    staleTime: 60 * 1000,
    retry: false,
  })

  const perfMap = useMemo(() => {
    const map = new Map<string, ModelPerfBadgeData>()
    for (const model of perfQuery.data?.data?.models ?? []) {
      map.set(String(model.model_name ?? ''), {
        ...model,
        window_start: perfQuery.data?.data.window_start,
        window_end: perfQuery.data?.data.window_end,
      })
    }
    for (const [name, series] of Object.entries(
      perfQuery.data?.data?.recent_success_series ?? {}
    )) {
      map.set(name, {
        avg_latency_ms: Number.NaN,
        avg_tps: Number.NaN,
        success_rate: Number.NaN,
        ...map.get(name),
        recent_success_series: series,
      })
    }
    return map
  }, [perfQuery.data])

  return (
    <div className='overflow-hidden rounded-[14px] border'>
      <table className='w-full table-fixed'>
        <thead>
          <tr>
            <th className='w-[25%] text-left'>{t('Model')}</th>
            <th className='w-[13%] text-left'>{t('Input')}</th>
            <th className='w-[13%] text-left'>{t('Output')}</th>
            <th className='w-[10%] text-left'>折扣</th>
            <th className='w-[10%] text-left'>上下文</th>
            <th className='w-[12%] text-left'>状态</th>
            <th className='w-[17%] text-left'>能力</th>
          </tr>
        </thead>
        <tbody>
          {props.models.map((model) => {
            const iconKey = model.icon || model.vendor_icon
            const icon = iconKey ? getLobeIcon(iconKey, 16) : null
            const ratio = getDisplayGroupRatio(model, props.selectedGroup)
            const discount =
              ratio > 0 && ratio < 1 ? Math.round((1 - ratio) * 100) : 0

            // 表达式计费：列表报该模型所有档位里**最低**的输入/输出单价。
            // 以前这里用 formatPrice(model_ratio)：表达式模型的 model_ratio 往往是未配置
            // 的兜底值 37.5，页面就会报 $75/1M，而实际表达式是 p * 1。
            const dynamicSummary = getDynamicPricingSummary(model, {
              priceRate: props.priceRate,
              usdExchangeRate: props.usdExchangeRate,
              showRechargePrice: props.showRechargePrice,
              tokenUnit,
            })
            const tierPrices = (
              field: 'inputPrice' | 'outputPrice'
            ): number[] =>
              (dynamicSummary?.tiers ?? [])
                .map((tier) =>
                  Number(
                    (tier as unknown as Record<string, unknown>)[field]
                  )
                )
                .filter((price) => Number.isFinite(price) && price >= 0)
            const groupRatioForDisplay = getDynamicDisplayGroupRatio(
              model,
              props.selectedGroup
            )
            const expressionPrice = (
              field: 'inputPrice' | 'outputPrice',
              groupRatioMultiplier: number
            ) => {
              if (!dynamicSummary) return undefined
              const prices = tierPrices(field)
              if (prices.length === 0) return '—'
              return formatDynamicUnitPrice(Math.min(...prices), {
                tokenUnit,
                priceRate: props.priceRate,
                usdExchangeRate: props.usdExchangeRate,
                showRechargePrice: props.showRechargePrice,
                groupRatioMultiplier,
              })
            }

            // 非 token 计费（按张 / 按秒 / 按视频 / 按次…）：按计量方向落到
            // 输入列或输出列，并沿用该条目的真实单位，而不是 /1M。
            const unitEntries = (dynamicSummary?.primaryEntries ?? []).filter(
              (entry) => entry.unit !== 'token'
            )
            const unitEntryFor = (direction: 'input' | 'output') =>
              unitEntries.find(
                (entry) => (entry.direction ?? 'output') === direction
              )
            const unitEntryPrice = (
              entry: DynamicPriceEntry,
              groupRatioMultiplier: number
            ) =>
              formatTaskUsageUnitPrice(entry.value, {
                tokenUnit,
                priceRate: props.priceRate,
                usdExchangeRate: props.usdExchangeRate,
                showRechargePrice: props.showRechargePrice,
                groupRatioMultiplier,
                showCurrencySymbol: true,
              })
            const unitEntrySuffix = (entry: DynamicPriceEntry) => {
              const key = getDynamicPriceUnitLabelKey(entry)
              return taskUsageUnitLabel(entry, i18n.language, key ? t(key) : '')
            }
            const inputUnitEntry = unitEntryFor('input')
            const outputUnitEntry = unitEntryFor('output')

            const inputOurs =
              expressionPrice('inputPrice', groupRatioForDisplay) ??
              formatPrice(
                model,
                'input',
                tokenUnit,
                props.showRechargePrice,
                props.priceRate,
                props.usdExchangeRate,
                props.selectedGroup
              )
            const inputList =
              expressionPrice('inputPrice', 1) ??
              formatPrice(
                model,
                'input',
                tokenUnit,
                props.showRechargePrice,
                props.priceRate,
                props.usdExchangeRate,
                undefined
              )
            const outputOurs =
              expressionPrice('outputPrice', groupRatioForDisplay) ??
              formatPrice(
                model,
                'output',
                tokenUnit,
                props.showRechargePrice,
                props.priceRate,
                props.usdExchangeRate,
                props.selectedGroup
              )
            const outputList =
              expressionPrice('outputPrice', 1) ??
              formatPrice(
                model,
                'output',
                tokenUnit,
                props.showRechargePrice,
                props.priceRate,
                props.usdExchangeRate,
                undefined
              )

            return (
              <tr
                key={model.model_name}
                className='cursor-pointer'
                onClick={() => props.onModelClick(model.model_name)}
              >
                <td>
                  <div className='flex min-w-0 items-center gap-2.5'>
                    {icon}
                    <div className='min-w-0'>
                      <div className='truncate text-[13.5px] leading-5 font-medium'>
                        {model.model_name}
                      </div>
                      {model.vendor_name && (
                        <div className='text-muted-foreground truncate text-[11.5px] leading-4'>
                          {model.vendor_name}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  {inputUnitEntry ? (
                    <PriceStack
                      list={unitEntryPrice(inputUnitEntry, 1)}
                      ours={unitEntryPrice(
                        inputUnitEntry,
                        groupRatioForDisplay
                      )}
                      unit={unitEntrySuffix(inputUnitEntry)}
                    />
                  ) : unitEntries.length > 0 ? (
                    <span className='text-muted-foreground/50 text-xs'>—</span>
                  ) : (
                    <PriceStack
                      list={inputList}
                      ours={inputOurs}
                      unit={tokenUnitLabel}
                    />
                  )}
                </td>
                <td>
                  {outputUnitEntry ? (
                    <PriceStack
                      list={unitEntryPrice(outputUnitEntry, 1)}
                      ours={unitEntryPrice(
                        outputUnitEntry,
                        groupRatioForDisplay
                      )}
                      unit={unitEntrySuffix(outputUnitEntry)}
                    />
                  ) : unitEntries.length > 0 ? (
                    <span className='text-muted-foreground/50 text-xs'>—</span>
                  ) : (
                    <PriceStack
                      list={outputList}
                      ours={outputOurs}
                      unit={tokenUnitLabel}
                    />
                  )}
                </td>
                <td>
                  {discount > 0 ? (
                    <span className='inline-flex items-center rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400'>
                      {discount}% off
                    </span>
                  ) : (
                    <span className='text-muted-foreground/50 text-xs'>—</span>
                  )}
                </td>
                <td className='text-muted-foreground text-[12.5px] tabular-nums'>
                  {formatContext(model.context_length)}
                </td>
                <td>
                  <ModelStatusCell perf={perfMap.get(model.model_name)} />
                </td>
                <td>
                  <CapabilityIcons
                    capabilities={model.capabilities}
                    inputModalities={model.input_modalities}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
