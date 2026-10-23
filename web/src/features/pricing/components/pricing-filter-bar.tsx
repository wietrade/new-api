import { useTranslation } from 'react-i18next'

import { getSortLabels, type SortOption } from '../constants'
import type { PricingVendor } from '../types'
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
}

export function PricingFilterBar(props: PricingFilterBarProps) {
  const { t } = useTranslation()
  const sortLabels = getSortLabels(t)

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
          width='138px'
        />
      </Field>

      <Field label={t('Model Types')}>
        <NativeSelect
          value={props.modelTypeFilter}
          onChange={props.onModelTypeChange}
          options={MODEL_TYPE_LABELS}
          placeholder='全部类型'
          width='118px'
        />
      </Field>

      <Field label={t('Input')}>
        <NativeSelect
          value={props.inputTypeFilter}
          onChange={props.onInputTypeChange}
          options={INPUT_TYPE_LABELS}
          placeholder='全部输入'
          width='118px'
        />
      </Field>

      <Field label='上下文'>
        <NativeSelect
          value={props.contextFilter}
          onChange={props.onContextChange}
          options={CONTEXT_LABELS}
          placeholder='不限'
          width='128px'
        />
      </Field>

      <Field label={t('Price')}>
        <NativeSelect
          value={props.priceTierFilter}
          onChange={props.onPriceTierChange}
          options={PRICE_TIER_LABELS}
          placeholder='不限'
          width='98px'
        />
      </Field>

      <Field label='分组'>
        <NativeSelect
          value={props.groupFilter}
          onChange={props.onGroupChange}
          options={groupOptions}
          placeholder='全部分组'
          width='118px'
        />
      </Field>

      <Field label={t('Sort')}>
        <select
          className='pf-select'
          style={{ width: '156px' }}
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
    </div>
  )
}
