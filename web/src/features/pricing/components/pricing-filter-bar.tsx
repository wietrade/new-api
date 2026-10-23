import { useTranslation } from 'react-i18next'

import { getSortLabels, type SortOption } from '../constants'
import { getContextRangeOf, getModelTypes } from '../lib/filters'
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
  return (
    <div className={`pf-field ${props.className ?? ''}`}>
      <span className='pf-label'>{props.label}</span>
      {props.children}
    </div>
  )
}

function NativeSelect(props: {
  value: string[]
  onChange: (value: string) => void
  options: Record<string, string>
  placeholder: string
  width?: string
  /** 选项命中数；为 0 时置灰禁用，避免选完必然空结果 */
  counts?: Record<string, number>
}) {
  return (
    <select
      className='pf-select'
      style={props.width ? { width: props.width } : undefined}
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
          width='132px'
        />
      </Field>

      <Field label={t('Model Types')}>
        <NativeSelect
          value={props.modelTypeFilter}
          onChange={props.onModelTypeChange}
          options={keepHit(MODEL_TYPE_LABELS, modelTypeCounts)}
          counts={modelTypeCounts}
          placeholder='全部类型'
          width='110px'
        />
      </Field>

      <Field label={t('Input')}>
        <NativeSelect
          value={props.inputTypeFilter}
          onChange={props.onInputTypeChange}
          options={keepHit(INPUT_TYPE_LABELS, inputTypeCounts)}
          counts={inputTypeCounts}
          placeholder='全部输入'
          width='110px'
        />
      </Field>

      <Field label='上下文'>
        <NativeSelect
          value={props.contextFilter}
          onChange={props.onContextChange}
          options={keepHit(CONTEXT_LABELS, contextCounts)}
          counts={contextCounts}
          placeholder='不限'
          width='124px'
        />
      </Field>

      <Field label={t('Price')}>
        <NativeSelect
          value={props.priceTierFilter}
          onChange={props.onPriceTierChange}
          options={keepHit(PRICE_TIER_LABELS, priceCounts)}
          counts={priceCounts}
          placeholder='不限'
          width='96px'
        />
      </Field>

      <Field label={t('Sort')}>
        <select
          className='pf-select'
          style={{ width: '112px' }}
          value={props.sortBy}
          onChange={(e) => props.onSortChange(e.target.value)}
        >
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label as string}
            </option>
          ))}
        </select>
      </Field>

      <div className='pf-count'>
        {props.filteredCount}
        {props.totalCount ? ` / ${props.totalCount}` : ''} 个结果
      </div>

      <div className='pf-kinds'>
        <button
          type='button'
          className='pf-kind'
          data-active={props.modelTypeFilter.length === 0}
          onClick={() => props.onModelTypeChange('')}
        >
          全部 <span>{props.models?.length ?? 0}</span>
        </button>
        {Object.entries(MODEL_TYPE_LABELS).map(([value, label]) => {
          const count = modelTypeCounts[value] ?? 0
          if (count === 0) return null
          return (
            <button
              key={value}
              type='button'
              className='pf-kind'
              data-active={props.modelTypeFilter[0] === value}
              onClick={() => props.onModelTypeChange(value)}
            >
              {label} <span>{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
