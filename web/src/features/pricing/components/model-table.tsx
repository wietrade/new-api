import { useQuery } from '@tanstack/react-query'
import {
  AudioLines,
  Boxes,
  Brain,
  Code,
  Eye,
  Globe,
  Image as ImageIcon,
  ListOrdered,
  MessageSquare,
  Paperclip,
  Video,
  Wrench,
} from 'lucide-react'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { getLobeIcon } from '@/lib/lobe-icon'
import { requireServerSuccess } from '@/lib/server-error-message'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { getDisplayGroupRatio } from '../lib/model-helpers'
import { formatPrice } from '../lib/price'
import type { ModelCapability, PricingModel, TokenUnit } from '../types'

export interface ModelTableProps {
  models: PricingModel[]
  onModelClick: (modelName: string) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
}

const CAPABILITY_META: Record<
  string,
  { icon: typeof MessageSquare; label: string }
> = {
  chat: { icon: MessageSquare, label: '对话' },
  reasoning: { icon: Brain, label: '推理' },
  tools: { icon: Wrench, label: '工具调用' },
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

function formatContext(tokens?: number): string {
  if (!tokens || tokens <= 0) return '—'
  if (tokens >= 1_000_000) {
    const v = tokens / 1_000_000
    return `${v >= 10 ? Math.round(v) : Number(v.toFixed(1))}M`
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

function CapabilityIcons(props: { capabilities?: ModelCapability[] }) {
  const caps = (props.capabilities ?? []).filter((c) => CAPABILITY_META[c])
  if (caps.length === 0) {
    return <span className='text-muted-foreground/60 text-xs'>—</span>
  }
  const shown = caps.slice(0, 5)
  const rest = caps.length - shown.length

  return (
    <div className='flex items-center gap-1.5'>
      {shown.map((c) => {
        const meta = CAPABILITY_META[c]
        const Icon = meta.icon
        return (
          <span key={c} title={meta.label} className='text-muted-foreground/80'>
            <Icon className='size-3.5' strokeWidth={1.8} />
          </span>
        )
      })}
      {rest > 0 && (
        <span className='text-muted-foreground/70 text-[11px]'>+{rest}</span>
      )}
    </div>
  )
}

function PriceStack(props: {
  list: string
  ours: string
  unit: string
}) {
  const differs = props.list !== props.ours
  return (
    <div className='leading-tight'>
      {differs && (
        <div className='text-muted-foreground/60 text-[11.5px] line-through tabular-nums'>
          {props.list}
          <span className='ml-0.5 text-[10px]'>/{props.unit}</span>
        </div>
      )}
      <div className='text-[13px] font-semibold tabular-nums'>
        {props.ours}
        <span className='text-muted-foreground ml-0.5 text-[10.5px] font-normal'>
          /{props.unit}
        </span>
      </div>
    </div>
  )
}

export const ModelTable = memo(function ModelTable(props: ModelTableProps) {
  const { t } = useTranslation()
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
    const map = new Map<string, number>()
    for (const m of perfQuery.data?.data?.models ?? []) {
      const ms = (m as { avg_latency_ms?: number }).avg_latency_ms
      if (typeof ms === 'number' && ms > 0) {
        map.set(String(m.model_name ?? ''), ms)
      }
    }
    return map
  }, [perfQuery.data])

  return (
    <div className='overflow-hidden rounded-[14px] border'>
      <table className='w-full table-fixed'>
        <thead>
          <tr>
            <th className='w-[26%] text-left'>{t('Model')}</th>
            <th className='w-[13%] text-left'>{t('Input')}</th>
            <th className='w-[13%] text-left'>{t('Output')}</th>
            <th className='w-[11%] text-left'>折扣</th>
            <th className='w-[10%] text-left'>上下文</th>
            <th className='w-[10%] text-left'>延迟</th>
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

            const inputOurs = formatPrice(
              model,
              'input',
              tokenUnit,
              props.showRechargePrice,
              props.priceRate,
              props.usdExchangeRate,
              props.selectedGroup
            )
            const inputList = formatPrice(
              model,
              'input',
              tokenUnit,
              props.showRechargePrice,
              props.priceRate,
              props.usdExchangeRate,
              undefined
            )
            const outputOurs = formatPrice(
              model,
              'output',
              tokenUnit,
              props.showRechargePrice,
              props.priceRate,
              props.usdExchangeRate,
              props.selectedGroup
            )
            const outputList = formatPrice(
              model,
              'output',
              tokenUnit,
              props.showRechargePrice,
              props.priceRate,
              props.usdExchangeRate,
              undefined
            )
            const ttft = perfMap.get(model.model_name)

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
                  <PriceStack
                    list={inputList}
                    ours={inputOurs}
                    unit={tokenUnitLabel}
                  />
                </td>
                <td>
                  <PriceStack
                    list={outputList}
                    ours={outputOurs}
                    unit={tokenUnitLabel}
                  />
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
                <td className='text-muted-foreground text-[12.5px] tabular-nums'>
                  {ttft ? `${(ttft / 1000).toFixed(1)} s` : '—'}
                </td>
                <td>
                  <CapabilityIcons capabilities={model.capabilities} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
