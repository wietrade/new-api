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
import { Loader2, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

interface GwOrder {
  trade_no: string
  uid: number
  email: string
  amount_cents: number
  amount_cny: number
  status: string
  created_at: string
  paid_at?: string | null
  notified_at?: string | null
  pay_order_no?: string | null
  wx_order_no?: string | null
  payer?: string | null
  paid_usd?: number | null
  fx_rate?: number | null
  receipt_count?: number
}

interface GwReceipt {
  id: number
  trade_no: string
  note?: string
  created_at: string
  content_type?: string
}

interface GwHealth {
  ok?: boolean
  last_push_at?: string | null
  seconds_since_push?: number | null
  today_count?: number
  today_cny?: number
  stale_pending?: number
  expired_unpaid_24h?: number
  unnotified_paid?: number
  retrying_paid?: number
  pending_ttl?: number
  warnings?: string[]
}

function agoText(sec?: number | null): string {
  if (sec === null || sec === undefined) return '从未上报'
  if (sec < 60) return `${sec} 秒前`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`
  return `${Math.floor(sec / 86400)} 天前`
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  rejected: {
    text: '待人工核对',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  pending: {
    text: '待支付',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  },
  paid: {
    text: '已到账',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  expired: {
    text: '已超时',
    cls: 'bg-muted text-muted-foreground',
  },
  canceled: {
    text: '已取消',
    cls: 'bg-muted text-muted-foreground',
  },
}

/**
 * 微信收款网关 · 记录管理
 *
 * 数据由 newapi 后端代理网关取得（网关 KEY 不进浏览器）：
 *   GET  /api/wxgateway/orders
 *   POST /api/wxgateway/orders/:trade_no/confirm | reject
 */
export function WxGatewayRecords() {
  const [status, setStatus] = useState('rejected')
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<GwOrder[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [health, setHealth] = useState<GwHealth | null>(null)

  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receipts, setReceipts] = useState<GwReceipt[]>([])
  const [images, setImages] = useState<Record<number, string>>({})
  const [receiptLoading, setReceiptLoading] = useState(false)
  const urlsRef = useRef<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/wxgateway/orders', {
        params: { status, q: keyword, limit: 50 },
      })
      const data = res.data as {
        ok?: boolean
        items?: GwOrder[]
        total?: number
        summary?: Record<string, number>
        error?: string
      }
      if (data?.ok) {
        setItems(data.items || [])
        setTotal(data.total || 0)
        setSummary(data.summary || {})
      } else {
        setItems([])
        setError(data?.error || '读取网关记录失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取网关记录失败')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [status, keyword])

  useEffect(() => {
    void load()
  }, [load])

  // 健康状态：每 60 秒拉一次（手机是否还在上报、是否有积压）
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const res = await api.get('/api/wxgateway/status')
        const d = res.data as GwHealth
        if (alive && d?.ok) setHealth(d)
      } catch {
        /* 网关不可达时保留上一次结果 */
      }
    }
    void tick()
    const timer = window.setInterval(tick, 60000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const act = async (order: GwOrder, kind: 'confirm' | 'reject') => {
    if (!order) return
    const tip =
      kind === 'confirm'
        ? `确认 ${order.trade_no} 已收款并立即入账？`
        : `把 ${order.trade_no} 标记为「信息有误/不入账」？`
    if (!window.confirm(tip)) return
    setActing(order.trade_no)
    try {
      const res = await api.post(
        `/api/wxgateway/orders/${encodeURIComponent(order.trade_no)}/${kind}`
      )
      const d = res.data as { ok?: boolean; error?: string }
      if (!d?.ok) window.alert(d?.error || '操作失败')
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActing(null)
    }
  }

  const openReceipts = async (order: GwOrder) => {
    setReceiptOpen(true)
    setReceiptLoading(true)
    setReceipts([])
    setImages({})
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
    try {
      const res = await api.get('/api/wxgateway/receipts', {
        params: { trade_no: order.trade_no },
      })
      const d = res.data as { ok?: boolean; items?: GwReceipt[] }
      const list = d?.items || []
      setReceipts(list)
      const next: Record<number, string> = {}
      for (const r of list) {
        try {
          const img = await api.get(`/api/wxgateway/receipt/${r.id}`, {
            responseType: 'blob',
          })
          const url = URL.createObjectURL(img.data as Blob)
          urlsRef.current.push(url)
          next[r.id] = url
        } catch {
          /* 单张失败不影响其它 */
        }
      }
      setImages(next)
    } finally {
      setReceiptLoading(false)
    }
  }

  const chip = (key: string, text: string) => (
    <Button
      key={key}
      size='sm'
      variant={status === key ? 'default' : 'outline'}
      onClick={() => setStatus(key)}
      className='h-8'
    >
      {text}
      {summary[key] ? ` (${summary[key]})` : ''}
    </Button>
  )

  return (
    <div className='space-y-3 rounded-lg border p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='text-base font-medium'>网关记录</h3>
          <p className='text-muted-foreground text-xs'>
            手机收款 → 网关 → 本站入账的完整流水；「待人工核对」是用户点了「信息有误」的单
          </p>
        </div>
        <Button
          size='sm'
          variant='outline'
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' />
          ) : (
            <RefreshCw className='mr-1 h-3.5 w-3.5' />
          )}
          刷新
        </Button>
      </div>

      <div className='flex flex-wrap items-center gap-2 text-xs'>
        <span className='bg-muted rounded px-2 py-1'>
          手机最后上报：
          <b>{agoText(health?.seconds_since_push)}</b>
        </span>
        <span className='bg-muted rounded px-2 py-1'>
          今日收款：{health?.today_count ?? 0} 笔 · ￥{health?.today_cny ?? 0}
        </span>
        {health?.expired_unpaid_24h ? (
          <span className='bg-muted rounded px-2 py-1'>
            过期待核对（24h）：{health.expired_unpaid_24h} 笔
          </span>
        ) : null}
        {health?.stale_pending ? (
          <span className='rounded bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'>
            超时未收尾：{health.stale_pending} 笔
          </span>
        ) : null}
        {health?.unnotified_paid ? (
          <span className='rounded bg-rose-100 px-2 py-1 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'>
            已付款未入账：{health.unnotified_paid} 笔
            {health.retrying_paid ? `（重试中 ${health.retrying_paid}）` : ''}
          </span>
        ) : null}
      </div>

      {health?.warnings?.length ? (
        <ul className='space-y-1 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'>
          {health.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}

      <div className='flex flex-wrap items-center gap-2'>
        {chip('rejected', '待人工核对')}
        {chip('pending', '待支付')}
        {chip('paid', '已到账')}
        {chip('expired', '已超时')}
        {chip('all', '全部')}
        <div className='relative ml-auto w-full sm:w-64'>
          <Search className='text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2' />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder='订单号 / 邮箱 / 微信单号 / 昵称'
            className='h-8 pl-8 text-xs'
          />
        </div>
      </div>

      {error ? (
        <div className='text-destructive rounded-md border border-dashed p-3 text-xs'>
          {error}
          <span className='text-muted-foreground ml-2'>
            （请先在上方填写「网关地址」和「网关密钥」）
          </span>
        </div>
      ) : null}

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full border-collapse text-xs'>
          <thead className='bg-muted/40 text-muted-foreground'>
            <tr>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                下单时间
              </th>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                用户邮箱
              </th>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                人民币
              </th>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                美元
              </th>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                微信昵称
              </th>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                微信订单号
              </th>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                本站订单号
              </th>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                状态
              </th>
              <th className='px-2 py-2 text-left font-medium whitespace-nowrap'>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className='text-muted-foreground px-2 py-6 text-center'>
                  加载中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className='text-muted-foreground px-2 py-6 text-center'>
                  没有记录
                </td>
              </tr>
            ) : (
              items.map((o) => {
                const st = STATUS_LABEL[o.status] || {
                  text: o.status,
                  cls: 'bg-muted text-muted-foreground',
                }
                return (
                  <tr key={o.trade_no} className='border-t'>
                    <td className='text-muted-foreground px-2 py-2 whitespace-nowrap'>
                      {o.created_at}
                    </td>
                    <td className='px-2 py-2 whitespace-nowrap'>{o.email || '—'}</td>
                    <td className='px-2 py-2 font-medium whitespace-nowrap'>
                      {o.amount_cny ? `￥${o.amount_cny.toFixed(2)}` : '—'}
                    </td>
                    <td className='px-2 py-2 whitespace-nowrap'>
                      {o.paid_usd ? `$${Number(o.paid_usd).toFixed(4)}` : '—'}
                    </td>
                    <td className='px-2 py-2 whitespace-nowrap'>{o.payer || '—'}</td>
                    <td className='px-2 py-2 font-mono whitespace-nowrap'>
                      {o.wx_order_no || '—'}
                    </td>
                    <td className='px-2 py-2 font-mono whitespace-nowrap'>
                      {o.trade_no}
                    </td>
                    <td className='px-2 py-2 whitespace-nowrap'>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}
                      >
                        {st.text}
                      </span>
                    </td>
                    <td className='px-2 py-2 whitespace-nowrap'>
                      <div className='flex items-center gap-1'>
                        {o.status !== 'paid' ? (
                          <Button
                            size='sm'
                            className='h-7 px-2 text-[11px]'
                            disabled={acting === o.trade_no}
                            onClick={() => void act(o, 'confirm')}
                          >
                            确认入账
                          </Button>
                        ) : null}
                        {o.status === 'rejected' || o.status === 'pending' ? (
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-7 px-2 text-[11px]'
                            disabled={acting === o.trade_no}
                            onClick={() => void act(o, 'reject')}
                          >
                            标记无效
                          </Button>
                        ) : null}
                        {o.receipt_count ? (
                          <Button
                            size='sm'
                            variant='ghost'
                            className='h-7 px-2 text-[11px]'
                            onClick={() => void openReceipts(o)}
                          >
                            凭证({o.receipt_count})
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className='text-muted-foreground text-xs'>共 {total} 条</div>

      <Dialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        title='付款凭证'
        description='用户点了「信息有误」后上传的微信支付截图'
        contentClassName='sm:max-w-[560px]'
        contentHeight='auto'
      >
        {receiptLoading ? (
          <div className='text-muted-foreground py-8 text-center text-sm'>
            加载中…
          </div>
        ) : receipts.length === 0 ? (
          <div className='text-muted-foreground py-8 text-center text-sm'>
            没有凭证
          </div>
        ) : (
          <div className='space-y-3'>
            {receipts.map((r) => (
              <div key={r.id} className='space-y-1'>
                <div className='text-muted-foreground text-xs'>
                  #{r.id} · {r.created_at}
                  {r.note ? ` · ${r.note}` : ''}
                </div>
                {images[r.id] ? (
                  <img
                    src={images[r.id]}
                    alt={`receipt-${r.id}`}
                    className='max-h-[60vh] w-full rounded-md border object-contain'
                  />
                ) : (
                  <div className='text-muted-foreground py-4 text-center text-xs'>
                    图片加载失败
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  )
}
