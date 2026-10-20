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
import { useTranslation } from 'react-i18next'

import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'

/* [改造] 仿 tokenmix.ai：首屏下方的两个大数字 */
export function StatsStrip() {
  const { t } = useTranslation()
  const { models, vendors } = usePricingData()

  const stats = [
    {
      value: models.length > 0 ? `${models.length}+` : '—',
      label: t('Models'),
    },
    {
      value: vendors.length > 0 ? `${vendors.length}` : '—',
      label: t('Providers'),
    },
  ]

  return (
    <section className='border-border/80 border-b'>
      <div className='mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-5 py-8 sm:px-6 sm:py-10'>
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className='text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl'>
              {stat.value}
            </p>
            <p className='text-muted-foreground mt-1 text-xs sm:text-sm'>
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
