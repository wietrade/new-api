import { useTranslation } from 'react-i18next'

import { getSortLabels, type SortOption } from '../constants'
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
}) {
  return (
    <select
      className='pf-select'
      style={props.width ? { width: props.width } : undefined}
      value={props.value[0] ?? ''}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <option value=''>{props.placeholder}</option>
      {Object.entries(props.options).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
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
  groupFilter: string[]
  onGroupChange: (value: string) => void
  groups: string[]
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
  const groupOptions = Object.fromEntries(props.groups.map((g) => [g, g]))

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
          options={vendorOptions}
          placeholder='全部供应商'
          width='118px'
        />
      </Field>

      <Field label={t('Model Types')}>
        <NativeSelect
          value={props.modelTypeFilter}
          onChange={props.onModelTypeChange}
          options={MODEL_TYPE_LABELS}
          placeholder='全部类型'
          width='100px'
        />
      </Field>

      <Field label={t('Input')}>
        <NativeSelect
          value={props.inputTypeFilter}
          onChange={props.onInputTypeChange}
          options={INPUT_TYPE_LABELS}
          placeholder='全部输入'
          width='100px'
        />
      </Field>

      <Field label='上下文'>
        <NativeSelect
          value={props.contextFilter}
          onChange={props.onContextChange}
          options={CONTEXT_LABELS}
          placeholder='不限'
          width='104px'
        />
      </Field>

      <Field label={t('Price')}>
        <NativeSelect
          value={props.priceTierFilter}
          onChange={props.onPriceTierChange}
          options={PRICE_TIER_LABELS}
          placeholder='不限'
          width='84px'
        />
      </Field>

      <Field label='分组'>
        <NativeSelect
          value={props.groupFilter}
          onChange={props.onGroupChange}
          options={groupOptions}
          placeholder='全部分组'
          width='108px'
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
          const count = (props.models ?? []).filter(
            (m) =>
              String((m as { model_type?: string }).model_type ?? 'text') ===
              value
          ).length
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
