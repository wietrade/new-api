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
import { useTranslation } from 'react-i18next'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

/* [改造] 仿 tokenmix.ai 的收尾 CTA */
export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  if (props.isAuthenticated) {
    return null
  }

  return (
    <section className='border-border/80 border-b'>
      <div className='mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-6 sm:py-14'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
            {t('Start building now')}
          </h2>
          <p className='text-muted-foreground mt-2 text-sm'>
            {t('No credit card required. Explore the live model catalog right away.')}
          </p>
        </div>
        <Link
          to='/sign-up'
          className='bg-foreground text-background hover:bg-foreground/90 inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[6px] px-6 text-sm font-semibold transition-colors'
        >
          {t('Start for free')}
          <ArrowRight className='size-4' />
        </Link>
      </div>
    </section>
  )
}
