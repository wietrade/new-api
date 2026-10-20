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
import { ArrowRight, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const providers = [
  { name: 'OpenAI', src: '/provider-logos/openai.svg' },
  { name: 'Anthropic', src: '/provider-logos/anthropic.svg' },
  { name: 'Gemini', src: '/provider-logos/gemini.svg' },
  { name: 'Groq', src: '/provider-logos/groq.svg' },
  { name: 'Mistral', src: '/provider-logos/mistral.svg' },
]

interface FeaturesProps {
  className?: string
}

/* [改造] 仿 tokenmix.ai 的四宫格能力区 */
export function Features(_props: FeaturesProps) {
  const { t } = useTranslation()

  const cards: {
    title: string
    desc: string
    visual: ReactNode
    href?: string
    linkLabel?: string
  }[] = [
    {
      title: t('Unified API relay'),
      desc: t('Call OpenAI, Claude, Gemini, DeepSeek and Qwen through one OpenAI-compatible base URL.'),
      href: '/pricing',
      linkLabel: t('View all models'),
      visual: (
        <div className='flex flex-wrap items-center gap-2'>
          {providers.map((provider) => (
            <span
              key={provider.name}
              className='inline-flex size-9 items-center justify-center rounded-[6px] border border-zinc-200 bg-white'
            >
              <img
                src={provider.src}
                alt={provider.name}
                className='size-5 object-contain'
              />
            </span>
          ))}
        </div>
      ),
    },
    {
      title: t('Bilingual interface'),
      desc: t('Switch between Chinese and English at any time — no reload needed.'),
      visual: (
        <div className='flex flex-wrap gap-2'>
          {['简体中文', 'English'].map((lang) => (
            <span
              key={lang}
              className='border-border bg-muted/50 text-muted-foreground rounded-[6px] border px-2.5 py-1.5 text-xs font-medium'
            >
              {lang}
            </span>
          ))}
        </div>
      ),
    },
    {
      title: t('Transparent wallet'),
      desc: t('Top up from $1 and pay only for what you use. Model prices are listed up front.'),
      href: '/pricing',
      linkLabel: t('View Pricing'),
      visual: (
        <div className='flex flex-wrap gap-2'>
          {[t('Pay per token'), t('No subscription'), t('$1 minimum top-up')].map(
            (item) => (
              <span
                key={item}
                className='border-border bg-muted/50 text-muted-foreground rounded-[6px] border px-2.5 py-1.5 text-xs font-medium'
              >
                {item}
              </span>
            )
          )}
        </div>
      ),
    },
    {
      title: t('Security controls'),
      desc: t('API keys, account controls and clear usage records. Your data is never used for training.'),
      visual: (
        <div className='border-border bg-muted/50 inline-flex size-11 items-center justify-center rounded-[8px] border'>
          <ShieldCheck className='text-muted-foreground size-5' />
        </div>
      ),
    },
  ]

  return (
    <section className='border-border/80 border-b'>
      <div className='mx-auto w-full max-w-6xl px-5 py-10 sm:px-6 sm:py-14'>
        <div className='grid gap-3 sm:grid-cols-2'>
          {cards.map((card) => (
            <article
              key={card.title}
              className='border-border/70 bg-card flex flex-col rounded-lg border p-5'
            >
              <div className='flex min-h-[44px] items-center'>{card.visual}</div>
              <h3 className='mt-4 text-base font-semibold tracking-tight'>
                {card.title}
              </h3>
              <p className='text-muted-foreground mt-1.5 text-sm leading-6'>
                {card.desc}
              </p>
              {card.href ? (
                <Link
                  to={card.href}
                  className='text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1 text-sm font-medium transition-colors'
                >
                  {card.linkLabel}
                  <ArrowRight className='size-3.5' />
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
