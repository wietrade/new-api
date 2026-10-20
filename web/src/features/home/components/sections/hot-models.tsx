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
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { formatPrice } from '@/features/pricing/lib/price'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'

const vendorLogo = (name?: string) => {
  const key = (name ?? '').toLowerCase()
  if (key.includes('openai')) return '/provider-logos/openai.svg'
  if (key.includes('anthropic') || key.includes('claude'))
    return '/provider-logos/anthropic.svg'
  if (key.includes('google') || key.includes('gemini'))
    return '/provider-logos/gemini.svg'
  if (key.includes('groq')) return '/provider-logos/groq.svg'
  if (key.includes('mistral')) return '/provider-logos/mistral.svg'
  return undefined
}

/* [改造] 仿 tokenmix.ai 的热门模型横向卡片 */
export function HotModels() {
  const { t } = useTranslation()
  const { models, priceRate, usdExchangeRate, isLoading } = usePricingData()

  const list = useMemo(() => {
    const rows: {
      key: string
      name: string
      vendor: string
      price: string
    }[] = []
    const perVendor = new Map<string, number>()
    for (const model of models) {
      if (!(model.model_ratio > 0)) continue
      if (/:(batch|free)$/i.test(model.model_name)) continue
      const vendor = model.vendor_name ?? ''
      if (!vendor) continue
      if ((perVendor.get(vendor) ?? 0) >= 4) continue
      perVendor.set(vendor, (perVendor.get(vendor) ?? 0) + 1)
      rows.push({
        key: model.key ?? model.model_name,
        name: model.model_name.replace(/^[^/]+\//, ''),
        vendor,
        price: formatPrice(
          model,
          'input',
          'M',
          false,
          priceRate,
          usdExchangeRate
        ),
      })
      if (rows.length === 8) break
    }
    return rows
  }, [models, priceRate, usdExchangeRate])

  return (
    <section className='border-border/80 border-b'>
      <div className='mx-auto w-full max-w-6xl px-5 py-10 sm:px-6 sm:py-12'>
        <div className='flex items-end justify-between gap-4'>
          <div>
            <h2 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
              {t('Popular models')}
            </h2>
            <p className='text-muted-foreground mt-2 text-sm'>
              {t('Access popular models through one API.')}
            </p>
          </div>
          <Link
            to='/pricing'
            className='text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-sm font-medium transition-colors'
          >
            {t('View all models')}
            <ArrowRight className='size-3.5' />
          </Link>
        </div>

        <div className='mt-6 flex snap-x gap-3 overflow-x-auto pb-2'>
          {isLoading && list.length === 0
            ? Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className='border-border/70 bg-card h-[104px] w-[248px] shrink-0 animate-pulse rounded-lg border'
                />
              ))
            : list.map((model) => (
                <Link
                  key={model.key}
                  to='/pricing'
                  className='border-border/70 bg-card hover:border-foreground/20 w-[248px] shrink-0 snap-start rounded-lg border p-4 transition-colors'
                >
                  <div className='flex items-center gap-2'>
                    {vendorLogo(model.vendor) ? (
                      <span className='inline-flex size-5 items-center justify-center rounded-[4px] border border-zinc-200 bg-white'>
                        <img
                          src={vendorLogo(model.vendor)}
                          alt={model.vendor}
                          className='size-3.5 object-contain'
                        />
                      </span>
                    ) : (
                      <span className='bg-muted size-4 rounded-[4px]' />
                    )}
                    <span className='text-muted-foreground truncate text-xs'>
                      {model.vendor}
                    </span>
                  </div>
                  <p className='mt-2 truncate text-sm font-medium'>{model.name}</p>
                  <p className='text-muted-foreground mt-2 text-xs'>
                    <span className='text-foreground font-medium'>
                      {model.price}
                    </span>{' '}
                    / 1M {t('Input')}
                  </p>
                </Link>
              ))}
        </div>
      </div>
    </section>
  )
}
