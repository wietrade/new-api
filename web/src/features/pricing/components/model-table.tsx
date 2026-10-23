import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'

import type { PricingModel, TokenUnit } from '../types'
import { CachedPriceCell } from './cached-price-cell'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelPriceCell } from './model-price-cell'

export interface ModelTableProps {
  models: PricingModel[]
  onModelClick: (modelName: string) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
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

function GroupChips(props: { groups?: string[] }) {
  const groups = props.groups ?? []
  if (groups.length === 0) {
    return <span className='text-muted-foreground/60 text-xs'>—</span>
  }
  const shown = groups.slice(0, 2)
  const rest = groups.length - shown.length

  return (
    <div className='flex flex-wrap items-center gap-1'>
      {shown.map((g) => (
        <span
          key={g}
          className='bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5 text-[11px] leading-4'
        >
          {g}
        </span>
      ))}
      {rest > 0 && (
        <span
          className='text-muted-foreground/70 text-[11px]'
          title={groups.join(', ')}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}

export const ModelTable = memo(function ModelTable(props: ModelTableProps) {
  const { t } = useTranslation()

  const options = {
    tokenUnit: props.tokenUnit,
    priceRate: props.priceRate,
    usdExchangeRate: props.usdExchangeRate,
    showRechargePrice: props.showRechargePrice,
    selectedGroup: props.selectedGroup,
  }

  return (
    <div className='overflow-hidden rounded-[14px] border'>
      <table className='w-full table-fixed'>
        <thead>
          <tr>
            <th className='w-[26%] text-left'>{t('Model')}</th>
            <th className='w-[20%] text-left'>{t('Price')}</th>
            <th className='w-[13%] text-left'>{t('Cached')}</th>
            <th className='w-[10%] text-left'>上下文</th>
            <th className='w-[13%] text-left'>{t('Type')}</th>
            <th className='w-[18%] text-left'>分组</th>
          </tr>
        </thead>
        <tbody>
          {props.models.map((model) => {
            const iconKey = model.icon || model.vendor_icon
            const icon = iconKey ? getLobeIcon(iconKey, 16) : null

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
                  <ModelPriceCell model={model} options={options} />
                </td>
                <td>
                  <CachedPriceCell model={model} options={options} />
                </td>
                <td className='text-muted-foreground text-[12.5px]'>
                  {formatContext(model.context_length)}
                </td>
                <td>
                  <ModelBillingModeBadge model={model} className='-ml-1.5' />
                </td>
                <td>
                  <GroupChips groups={model.enable_groups} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
