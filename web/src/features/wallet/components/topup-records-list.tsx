/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import { useBillingHistory } from '../hooks/use-billing-history'
import { formatTimestamp, getStatusConfig } from '../lib/billing'
import type { TopupRecord } from '../types'

/** 长单号：默认后四位，点一下展开完整 */
function ExpandableCode({ value }: { value?: string | null }) {
  const [open, setOpen] = useState(false)
  if (!value) return <span className='text-muted-foreground'>—</span>
  const short = value.length > 6 ? `…${value.slice(-4)}` : value
  return (
    <span
      role='button'
      tabIndex={0}
      title={open ? '点击收起' : '点击查看完整'}
      className='cursor-pointer font-mono underline decoration-dotted underline-offset-2'
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v)
      }}
    >
      {open ? value : short}
    </span>
  )
}

/**
 * 充值记录（直接嵌在「添加资金」卡片里，不需要再点按钮开弹层）
 *
 * 列名与 App「历史记录」保持一致：金额 / 昵称 / 顺序号 / 单号 / 订单时间 / 备注
 * 长单号默认只显示后四位，点击展开完整。
 */
export function TopupRecordsList() {
  const { t } = useTranslation()
  const {
    records,
    total,
    page,
    pageSize,
    loading,
    handlePageChange,
  } = useBillingHistory({ initialPageSize: 5 })
  const { copyToClipboard, copiedText } = useCopyToClipboard({ notify: false })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const usdOf = (record: TopupRecord) => {
    const usd =
      record.usd_amount && record.usd_amount > 0
        ? record.usd_amount
        : record.money
    return usd && usd > 0 ? `$${usd.toFixed(4)}` : '—'
  }
  const rateOf = (record: TopupRecord) => {
    if (record.fx_rate && record.fx_rate > 0) return record.fx_rate.toFixed(4)
    if (record.cny_amount && record.cny_amount > 0 && record.money > 0) {
      return (record.cny_amount / record.money).toFixed(4)
    }
    return '—'
  }
  const cnyOf = (record: TopupRecord) =>
    record.cny_amount && record.cny_amount > 0
      ? `￥${record.cny_amount.toFixed(2)}`
      : '—'

  const copyBtn = (text: string) => (
    <Button
      variant='ghost'
      size='sm'
      className='h-5 w-5 shrink-0 p-0'
      onClick={() => copyToClipboard(text)}
    >
      {copiedText === text ? (
        <Check className='h-3 w-3' />
      ) : (
        <Copy className='h-3 w-3' />
      )}
    </Button>
  )

  const th = 'whitespace-nowrap px-2 py-2 text-left font-medium'
  const td = 'whitespace-nowrap px-2 py-2'

  return (
    <div className='space-y-2.5 sm:space-y-3'>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
          {t('Topup Records')}
        </span>
        {total > 0 ? (
          <div className='flex items-center gap-1.5'>
            <Button
              variant='ghost'
              size='sm'
              className='h-6 w-6 p-0'
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className='h-3.5 w-3.5' />
            </Button>
            <span className='text-muted-foreground text-xs'>
              {page}/{totalPages}
            </span>
            <Button
              variant='ghost'
              size='sm'
              className='h-6 w-6 p-0'
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className='h-3.5 w-3.5' />
            </Button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className='space-y-2'>
          {['a', 'b', 'c'].map((k) => (
            <Skeleton key={k} className='h-8 w-full' />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border border-dashed py-6 text-center text-xs'>
          {t('Your transaction history will appear here')}
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full border-collapse text-xs'>
            <thead className='bg-muted/40 text-muted-foreground'>
              <tr>
                <th className={th}>{t('Time')}</th>
                <th className={th}>{t('Amount')}</th>
                <th className={th}>{t('USD Credited')}</th>
                <th className={th}>{t('Rate')}</th>
                <th className={th}>{t('Nickname')}</th>
                <th className={th}>{t('Customer No.')}</th>
                <th className={th}>{t('Order No.')}</th>
                <th className={th}>{t('Remark')}</th>
                <th className={th}>{t('Site Order No.')}</th>
                <th className={th}>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const statusConfig = getStatusConfig(record.status)
                return (
                  <tr key={record.id} className='border-t'>
                    <td className={`${td} text-muted-foreground`}>
                      {formatTimestamp(record.create_time)}
                    </td>
                    <td className={`${td} font-semibold`}>{cnyOf(record)}</td>
                    <td className={`${td} font-semibold`}>{usdOf(record)}</td>
                    <td className={`${td} text-muted-foreground`}>
                      {rateOf(record)}
                    </td>
                    <td className={`${td} max-w-[90px] truncate`}>
                      {record.wx_nickname || '—'}
                    </td>
                    <td className={`${td} text-muted-foreground tabular-nums`}>
                      {record.customer_no ? `#${record.customer_no}` : '—'}
                    </td>
                    <td className={td}>
                      <div className='flex items-center gap-1'>
                        <ExpandableCode value={record.wx_order_no} />
                        {record.wx_order_no
                          ? copyBtn(record.wx_order_no)
                          : null}
                      </div>
                    </td>
                    <td
                      className={`${td} text-muted-foreground max-w-[120px] truncate`}
                      title={record.pay_remark || ''}
                    >
                      {record.pay_remark || '—'}
                    </td>
                    <td className={`${td} text-muted-foreground`}>
                      <div className='flex items-center gap-1'>
                        <ExpandableCode value={record.trade_no} />
                        {copyBtn(record.trade_no)}
                      </div>
                    </td>
                    <td className={td}>
                      <StatusBadge
                        label={t(statusConfig.label)}
                        variant={statusConfig.variant}
                        showDot
                        copyable={false}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
