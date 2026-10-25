import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getSortLabels, type SortOption } from '../constants'
import { getContextRangeOf, getLifecycleOf, getModelTypes } from '../lib/filters'
import type { PricingModel, PricingVendor } from '../types'
import { SearchBar } from './search-bar'

const MODEL_TYPE_LABELS: Record<string, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
  embedding: '嵌入',
  rerank: '重新排序',
}

const INPUT_TYPE_LABELS: Record<string, string> = {
  text: '文本',
  image: '图片',
  audio: '音频',
  video: '视频',
  file: '文件',
}

const CONTEXT_LABELS: Record<string, string> = {
  small: '< 200K',
  medium: '200K - 1M',
  large: '≥ 1M',
}

const PRICE_TIER_LABELS: Record<string, string> = {
  free: '免费',
  paid: '付费',
}

/** 生命周期筛选标签；unknown = 官方未声明（数据留空，不当作现役） */
const LIFECYCLE_LABELS: Record<string, string> = {
  ga: '现役',
  preview: '预览',
  legacy: '旧款',
  deprecated: '已弃用',
  retired: '已关停',
  unknown: '未标注',
}

/** 排序下拉用语：短文案，避免整行筛选栏被撑到换行 */
const SORT_SHORT_LABELS: Record<string, string> = {
  name: '名称',
  'input-price-low': '输入价 ↑',
  'input-price-high': '输入价 ↓',
  'output-price-low': '输出价 ↑',
  'output-price-high': '输出价 ↓',
  'request-price-low': '按次价 ↑',
  'request-price-high': '按次价 ↓',
}

function Field(props: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  // 标签只给读屏软件用：桌面端这排小标题是多余的视觉噪声
  return (
    <div className={`pf-field ${props.className ?? ''}`} aria-label={props.label}>
      {props.children}
    </div>
  )
}

/**
 * GitHub 风格的下拉壳：原生 select 去掉系统箭头，右侧单独一段 caret（带左侧分隔线），
 * 观感上就是一个「标签 + ▾」的复合按钮，同时保留原生 select 的无障碍与键盘行为。
 */
function SelectShell(props: {
  width?: string
  children: React.ReactNode
}) {
  return (
    <span
      className='pf-select-shell'
      style={props.width ? { width: props.width } : undefined}
    >
      {props.children}
      <span className='pf-select-caret' aria-hidden='true'>
        <ChevronDown className='size-3.5' strokeWidth={2} />
      </span>
    </span>
  )
}

function NativeSelect(props: {
  value: string[]
  onChange: (value: string) => void
  options: Record<string, string>
  placeholder: string
  /** 无障碍名称（桌面端不再显示可见标签） */
  label?: string
  width?: string
  /** 选项命中数；为 0 时置灰禁用，避免选完必然空结果 */
  counts?: Record<string, number>
}) {
  return (
    <SelectShell width={props.width}>
      <select
        className='pf-select'
        aria-label={props.label ?? props.placeholder}
        value={props.value[0] ?? ''}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value=''>{props.placeholder}</option>
        {Object.entries(props.options).map(([value, label]) => {
          const count = props.counts?.[value]
          return (
            <option key={value} value={value} disabled={count === 0}>
              {count === undefined ? label : `${label} (${count})`}
            </option>
          )
        })}
      </select>
    </SelectShell>
  )
}

export interface PricingFilterBarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  onSearchClear: () => void
  sortBy: string
  onSortChange: (value: string) => void
  vendors: PricingVendor[]
  vendorFilter: string[]
  onVendorChange: (value: string) => void
  modelTypeFilter: string[]
  onModelTypeChange: (value: string) => void
  inputTypeFilter: string[]
  onInputTypeChange: (value: string) => void
  contextFilter: string[]
  onContextChange: (value: string) => void
  priceTierFilter: string[]
  onPriceTierChange: (value: string) => void
  lifecycleFilter: string[]
  onLifecycleChange: (value: string) => void
  filteredCount: number
  totalCount?: number
  models?: PricingModel[]
}
export function PricingFilterBar(props: PricingFilterBarProps) {
  const { t } = useTranslation()
  const fullSortLabels = getSortLabels(t)
  const sortLabels = Object.fromEntries(
    Object.keys(fullSortLabels).map((key) => [
      key,
      SORT_SHORT_LABELS[key] ?? fullSortLabels[key as SortOption],
    ])
  ) as Record<SortOption, string>

  const vendorOptions = Object.fromEntries(
    props.vendors.map((v) => [v.name, v.name])
  )

  // 各筛选维度的命中数（基于全量模型，不受当前筛选影响）
  const allModels = props.models ?? []
  const vendorCounts: Record<string, number> = {}
  const modelTypeCounts: Record<string, number> = {}
  const inputTypeCounts: Record<string, number> = {}
  const contextCounts: Record<string, number> = {}
  const priceCounts: Record<string, number> = { free: 0, paid: 0 }
  const lifecycleCounts: Record<string, number> = {}
  for (const model of allModels) {
    if (model.vendor_name) {
      vendorCounts[model.vendor_name] =
        (vendorCounts[model.vendor_name] ?? 0) + 1
    }
    for (const type of new Set(getModelTypes(model))) {
      modelTypeCounts[type] = (modelTypeCounts[type] ?? 0) + 1
    }
    for (const modality of new Set(
      (model.input_modalities ?? []).map((v) => String(v).toLowerCase())
    )) {
      inputTypeCounts[modality] = (inputTypeCounts[modality] ?? 0) + 1
    }
    const range = getContextRangeOf(model)
    if (range) contextCounts[range] = (contextCounts[range] ?? 0) + 1
    priceCounts[model.is_free === true ? 'free' : 'paid'] += 1
    const lifecycle = getLifecycleOf(model)
    lifecycleCounts[lifecycle] = (lifecycleCounts[lifecycle] ?? 0) + 1
  }

  // 只保留真的有模型命中的选项，避免选完必然空结果
  const keepHit = (options: Record<string, string>, counts: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(options).filter(([key]) => (counts[key] ?? 0) > 0)
    )

  return (
    <div className='pricing-filterbar'>
      <Field label={t('Search')} className='pf-search'>
        <SearchBar
          value={props.searchQuery}
          onChange={props.onSearchChange}
          onClear={props.onSearchClear}
          placeholder={t('Search model name, provider, endpoint, or tag...')}
          className='w-full [&_input]:h-9 [&_input]:pl-9 [&_input]:text-[13px]'
        />
      </Field>

      <Field label={t('Vendor')}>
        <NativeSelect
          value={props.vendorFilter}
          onChange={props.onVendorChange}
          options={keepHit(vendorOptions, vendorCounts)}
          counts={vendorCounts}
          placeholder='全部供应商'
          label={t('Vendor')}
          width='144px'
        />
      </Field>

      <Field label={t('Model Types')}>
        <NativeSelect
          value={props.modelTypeFilter}
          onChange={props.onModelTypeChange}
          options={keepHit(MODEL_TYPE_LABELS, modelTypeCounts)}
          counts={modelTypeCounts}
          placeholder='全部类型'
          label={t('Model Types')}
          width='120px'
        />
      </Field>

      <Field label={t('Input')}>
        <NativeSelect
          value={props.inputTypeFilter}
          onChange={props.onInputTypeChange}
          options={keepHit(INPUT_TYPE_LABELS, inputTypeCounts)}
          counts={inputTypeCounts}
          placeholder='全部输入'
          label={t('Input')}
          width='120px'
        />
      </Field>

      <Field label='上下文'>
        <NativeSelect
          value={props.contextFilter}
          onChange={props.onContextChange}
          options={keepHit(CONTEXT_LABELS, contextCounts)}
          counts={contextCounts}
          placeholder='不限'
          label='上下文'
          width='134px'
        />
      </Field>

      <Field label={t('Price')}>
        <NativeSelect
          value={props.priceTierFilter}
          onChange={props.onPriceTierChange}
          options={keepHit(PRICE_TIER_LABELS, priceCounts)}
          counts={priceCounts}
          placeholder='不限'
          label={t('Price')}
          width='108px'
        />
      </Field>

      <Field label='生命周期'>
        <NativeSelect
          value={props.lifecycleFilter}
          onChange={props.onLifecycleChange}
          options={keepHit(LIFECYCLE_LABELS, lifecycleCounts)}
          counts={lifecycleCounts}
          placeholder='全部状态'
          label='生命周期'
          width='124px'
        />
      </Field>

      <Field label={t('Sort')}>
        <SelectShell width='128px'>
          <select
            className='pf-select'
            aria-label={t('Sort')}
            value={props.sortBy}
            onChange={(e) => props.onSortChange(e.target.value)}
          >
            {Object.entries(sortLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label as string}
              </option>
            ))}
          </select>
        </SelectShell>
      </Field>
    </div>
  )
}
