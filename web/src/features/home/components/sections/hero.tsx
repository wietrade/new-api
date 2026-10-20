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
import { ArrowRight, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { GatewayDiagram } from '../gateway-diagram'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

const providerLogos = [
  { name: 'OpenAI', src: '/provider-logos/openai.svg' },
  { name: 'Anthropic', src: '/provider-logos/anthropic.svg' },
  { name: 'Gemini', src: '/provider-logos/gemini.svg' },
  { name: 'Groq', src: '/provider-logos/groq.svg' },
  { name: 'Mistral', src: '/provider-logos/mistral.svg' },
]

/* [改造] 完全对齐 tokenmix.ai 首屏：左侧文案 + 右侧产品卡，无渐变背景 */
export function Hero(props: HeroProps) {
  const { t } = useTranslation()

  const host =
    typeof window === 'undefined' ? 'api.nowhub.org' : window.location.host
  const baseUrl =
    typeof window === 'undefined'
      ? 'https://api.nowhub.org/v1'
      : `${window.location.origin}/v1`

  const chips = [
    'OpenAI / Claude / Gemini / DeepSeek / Qwen',
    t('No subscription'),
    t('$1 minimum top-up'),
  ]

  return (
    <section className='border-border/80 border-b'>
      {/* 头部是 fixed（57px），首屏需补足这段高度，对应 tokenmix.ai 的 sticky 头部间距 */}
      <div className='mx-auto grid w-full max-w-6xl gap-7 px-5 pt-[89px] pb-8 sm:px-6 sm:pt-[113px] sm:pb-14 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:pt-[121px] lg:pb-16'>
        {/* 左：文案 */}
        <div className='min-w-0 text-left'>
          <p className='text-muted-foreground truncate font-mono text-[11px] font-medium uppercase'>
            Base URL: {baseUrl}
          </p>

          <h1 className='mt-4 max-w-3xl text-[2.1rem] leading-[1.12] font-semibold tracking-tight [text-wrap:balance] sm:text-5xl sm:leading-tight lg:text-[3.5rem]'>
            {t('NowHub API Gateway')}
            <span className='text-zinc-500 dark:text-zinc-400 block break-keep'>
              {t('One endpoint, every AI model.')}
            </span>
          </h1>

          <p className='text-muted-foreground mt-4 max-w-2xl text-sm leading-6 sm:mt-5 sm:text-base sm:leading-7'>
            {t(
              'Access OpenAI, Claude, Gemini, DeepSeek, Qwen and more through one OpenAI-compatible API. Swap the base URL and keep your code.'
            )}
          </p>

          <div className='mt-5 flex max-w-2xl flex-wrap gap-2 sm:mt-6'>
            {chips.map((chip) => (
              <span
                key={chip}
                className='border-border bg-card text-muted-foreground inline-flex min-w-0 items-center gap-2 rounded-[6px] border px-3 py-2 text-xs font-medium'
              >
                <Check className='text-muted-foreground/70 size-3.5 shrink-0' />
                <span className='truncate'>{chip}</span>
              </span>
            ))}
          </div>

          <div className='mt-6 grid grid-cols-2 gap-3 sm:mt-7 sm:flex sm:flex-row'>
            {props.isAuthenticated ? (
              <Link
                to='/dashboard'
                className='bg-foreground text-background hover:bg-foreground/90 inline-flex h-11 items-center justify-center gap-2 rounded-[6px] px-6 text-sm font-semibold transition-colors'
              >
                {t('Go to Dashboard')}
                <ArrowRight className='size-4' />
              </Link>
            ) : (
              <Link
                to='/sign-up'
                className='bg-foreground text-background hover:bg-foreground/90 inline-flex h-11 items-center justify-center gap-2 rounded-[6px] px-6 text-sm font-semibold transition-colors'
              >
                {t('Start for free')}
                <ArrowRight className='size-4' />
              </Link>
            )}
            <Link
              to='/pricing'
              className='border-border bg-card text-foreground hover:border-foreground/25 inline-flex h-11 items-center justify-center gap-2 rounded-[6px] border px-6 text-sm font-semibold transition-colors'
            >
              {t('Explore models')}
            </Link>
          </div>
        </div>

        {/* 右：我们的 SVG 产品卡 */}
        <div className='min-w-0'>
          <div className='border-border bg-card overflow-hidden rounded-lg border'>
            <div className='border-border flex items-center justify-between border-b px-4 py-3'>
              <div className='flex min-w-0 items-center gap-2'>
                <span className='bg-foreground size-2 rounded-full' />
                <span className='text-muted-foreground truncate font-mono text-xs font-medium'>
                  {host}
                </span>
              </div>
              <span className='bg-muted text-muted-foreground rounded-[6px] px-2 py-1 font-mono text-[11px]'>
                GET /v1/models
              </span>
            </div>

            <div className='p-3 sm:p-4'>
              <GatewayDiagram />
            </div>

            <div className='border-border flex items-center justify-between border-t px-4 py-3'>
              <div className='flex -space-x-2'>
                {providerLogos.map((provider) => (
                  <div
                    key={provider.name}
                    className='border-card bg-card rounded-[6px] border p-0.5'
                  >
                    <span className='inline-flex size-7 items-center justify-center rounded-[6px] border border-zinc-200 bg-white'>
                      <img
                        src={provider.src}
                        alt={provider.name}
                        className='size-4 object-contain'
                      />
                    </span>
                  </div>
                ))}
              </div>
              <Link
                to='/pricing'
                className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium transition-colors'
              >
                {t('View all models')}
                <ArrowRight className='size-3.5' />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
