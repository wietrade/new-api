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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'

/**
 * 微信扫码支付弹层。
 *
 * 页面由自有支付网关渲染（GET /pay/<trade_no>?embed=1），通过 iframe 嵌进来，
 * 网关在「已到账 / 已超时 / 待人工核对 / 用户点完成」时用 postMessage 通知本页。
 */
interface WxPayDialogProps {
  open: boolean
  url: string | null
  onOpenChange: (open: boolean) => void
  /** 钱已实际到账（额度可能还在充值中） */
  onPaid: () => void
}

interface WxGatewayMessage {
  source?: string
  event?: string
  tradeNo?: string
  usd?: string
  cny?: string
}

export function WxPayDialog({
  open,
  url,
  onOpenChange,
  onPaid,
}: WxPayDialogProps) {
  const { t } = useTranslation()

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as WxGatewayMessage | undefined
      if (!data || typeof data !== 'object' || data.source !== 'wxgateway') {
        return
      }
      switch (data.event) {
        case 'paid':
          onPaid()
          break
        case 'expired':
        case 'review':
        case 'close':
          onOpenChange(false)
          break
        default:
          // pending_confirm 等状态：留在弹层里让用户点确认 / 上传凭证
          break
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onPaid, onOpenChange])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('WeChat Pay')}
      description={t(
        'Scan the QR code with WeChat. Be sure to fill in your account email when paying.'
      )}
      contentClassName='max-sm:w-[calc(100vw-1rem)] sm:max-w-[600px]'
      contentHeight='auto'
      bodyClassName='p-0'
    >
      {url ? (
        <iframe
          src={url}
          title='wx-pay'
          className='h-[72vh] max-h-[760px] min-h-[420px] w-full rounded-lg border-0'
        />
      ) : null}
    </Dialog>
  )
}
