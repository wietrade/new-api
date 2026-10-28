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
import { Check, ChevronLeft, ChevronRight, Copy, Receipt, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import { useBillingHistory } from '../hooks/use-billing-history'
import { formatTimestamp, getStatusConfig } from '../lib/billing'
import type { TopupRecord } from '../types'

/**
 * 交易记录（常驻列表，不再藏在弹层里）
 *
 * 列：时间 / 人民币 / 美元 / 汇率 / newapi 订单号 / 微信订单号 / 微信昵称 / 状态
 * 窄屏自动切成堆叠卡片，避免横向滚动。
 */
export function TransactionListCard() {
  const { t } = useTranslation()
  const {
    records,
    total,
    page,
    pageSize,
    keyword,
    loading,
    handlePageChange,
    handleSearch,
  } = useBillingHistory({ initialPageSize: 10 })
  const { copyToClipboard, copiedText } = useCopyToClipboard({ notify: false })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const cnyOf = (record: TopupRecord) => {
    if (record.cny_amount && record.cny_amount > 0) {
      return `￥${record.cny_amount.toFixed(2)}`
    }
    return '—'
  }
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

  const copyButton = (text: string) => (
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

  return (
    <TitledCard
      title={t('Transaction Records')}
      description={t(
        'Top-up records with CNY amount, USD credited, exchange rate and WeChat order details'
      )}
      icon={<Receipt className='h-4 w-4' />}
      iconTone='info'
      disableHoverEffect
      action={
        <div className='relative w-full sm:w-64'>
          <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
          <Input
            placeholder={t('Search by order number...')}
            value={keyword}
            onChange={(e) => handleSearch(e.target.value)}
            className='h-9 pl-10'
          />
        </div>
      }
    >
      {loading ? (
        <div className='space-y-2'>
          {['a', 'b', 'c', 'd', 'e'].map((key) => (
            <Skeleton key={key} className='h-10 w-full' />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className='text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-1 py-8 text-center'>
          <p className='text-sm font-medium'>{t('No billing records found')}</p>
          <p className='text-xs'>
            {keyword
              ? t('Try adjusting your search')
              : t('Your transaction history will appear here')}
          </p>
        </div>
      ) : (
        <>
          {/* 桌面：表格 */}
          <div className='hidden overflow-x-auto md:block'>
            <table className='w-full border-collapse text-sm'>
              <thead>
                <tr className='text-muted-foreground border-b text-left text-xs'>
                  <th className='py-2 pr-3 font-medium whitespace-nowrap'>
                    {t('Time')}
                  </th>
                  <th className='py-2 pr-3 font-medium whitespace-nowrap'>
                    {t('CNY Paid')}
                  </th>
                  <th className='py-2 pr-3 font-medium whitespace-nowrap'>
                    {t('USD Credited')}
                  </th>
                  <th className='py-2 pr-3 font-medium whitespace-nowrap'>
                    {t('Rate')}
                  </th>
                  <th className='py-2 pr-3 font-medium whitespace-nowrap'>
                    {t('Order No.')}
                  </th>
                  <th className='py-2 pr-3 font-medium whitespace-nowrap'>
                    {t('WeChat Order No.')}
                  </th>
                  <th className='py-2 pr-3 font-medium whitespace-nowrap'>
                    {t('WeChat Nickname')}
                  </th>
                  <th className='py-2 font-medium whitespace-nowrap'>
                    {t('Status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const statusConfig = getStatusConfig(record.status)
                  return (
                    <tr
                      key={record.id}
                      className='border-b last:border-0 hover:bg-muted/40'
                    >
                      <td className='text-muted-foreground py-2.5 pr-3 text-xs whitespace-nowrap'>
                        {formatTimestamp(record.create_time)}
                      </td>
                      <td className='py-2.5 pr-3 font-medium whitespace-nowrap'>
                        {cnyOf(record)}
                      </td>
                      <td className='py-2.5 pr-3 font-medium whitespace-nowrap'>
                        {usdOf(record)}
                      </td>
                      <td className='text-muted-foreground py-2.5 pr-3 text-xs whitespace-nowrap'>
                        {rateOf(record)}
                      </td>
                      <td className='py-2.5 pr-3'>
                        <div className='flex items-center gap-1'>
                          <code className='max-w-[180px] truncate font-mono text-xs'>
                            {record.trade_no}
                          </code>
                          {copyButton(record.trade_no)}
                        </div>
                      </td>
                      <td className='py-2.5 pr-3'>
                        <div className='flex items-center gap-1'>
                          <code className='max-w-[170px] truncate font-mono text-xs'>
                            {record.wx_order_no || '—'}
                          </code>
                          {record.wx_order_no
                            ? copyButton(record.wx_order_no)
                            : null}
                        </div>
                      </td>
                      <td className='max-w-[120px] truncate py-2.5 pr-3'>
                        {record.wx_nickname || '—'}
                      </td>
                      <td className='py-2.5'>
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

          {/* 移动端：堆叠 */}
          <div className='space-y-2 md:hidden'>
            {records.map((record) => {
              const statusConfig = getStatusConfig(record.status)
              return (
                <div key={record.id} className='rounded-lg border p-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='text-muted-foreground text-xs'>
                      {formatTimestamp(record.create_time)}
                    </div>
                    <StatusBadge
                      label={t(statusConfig.label)}
                      variant={statusConfig.variant}
                      showDot
                      copyable={false}
                    />
                  </div>
                  <div className='mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
                    <span className='text-base font-semibold'>
                      {cnyOf(record)}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      → {usdOf(record)}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {t('Rate')} {rateOf(record)}
                    </span>
                  </div>
                  <div className='mt-2 space-y-1 text-xs'>
                    <div className='flex items-center gap-1'>
                      <span className='text-muted-foreground shrink-0'>
                        {t('Order No.')}
                      </span>
                      <code className='truncate font-mono'>
                        {record.trade_no}
                      </code>
                      {copyButton(record.trade_no)}
                    </div>
                    {record.wx_order_no ? (
                      <div className='flex items-center gap-1'>
                        <span className='text-muted-foreground shrink-0'>
                          {t('WeChat Order No.')}
                        </span>
                        <code className='truncate font-mono'>
                          {record.wx_order_no}
                        </code>
                        {copyButton(record.wx_order_no)}
                      </div>
                    ) : null}
                    {record.wx_nickname ? (
                      <div className='flex items-center gap-1'>
                        <span className='text-muted-foreground shrink-0'>
                          {t('WeChat Nickname')}
                        </span>
                        <span className='truncate'>{record.wx_nickname}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 分页 */}
          <div className='mt-3 flex items-center justify-between'>
            <span className='text-muted-foreground text-xs'>
              {t('Total {{total}} records', { total })}
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <span className='text-xs'>
                {page} / {totalPages}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </>
      )}
    </TitledCard>
  )
}
