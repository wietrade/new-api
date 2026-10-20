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

/* [改造] 仿 tokenmix.ai 的三步上手 */
export function HowItWorks() {
  const { t } = useTranslation()

  const baseUrl =
    typeof window === 'undefined'
      ? 'https://api.nowhub.org/v1'
      : `${window.location.origin}/v1`

  const steps = [
    {
      num: '1',
      title: t('Create an account'),
      desc: t('Sign up for free and get API access right away.'),
      visual: (
        <div className='border-border bg-muted/50 text-muted-foreground rounded-[6px] border px-3 py-2 font-mono text-[11px]'>
          {t('Free sign-up')}
        </div>
      ),
    },
    {
      num: '2',
      title: t('Create an API key'),
      desc: t('Generate a key in the console — one key unlocks every model.'),
      visual: (
        <div className='border-border bg-muted/50 text-muted-foreground rounded-[6px] border px-3 py-2 font-mono text-[11px]'>
          sk-••••••••••••
        </div>
      ),
    },
    {
      num: '3',
      title: t('Make your first call'),
      desc: t('Use any OpenAI SDK or HTTP client with the base URL pointed at the gateway.'),
      visual: (
        <div className='border-border bg-muted/50 text-muted-foreground truncate rounded-[6px] border px-3 py-2 font-mono text-[11px]'>
          base_url: {baseUrl}
        </div>
      ),
    },
  ]

  return (
    <section className='border-border/80 border-b'>
      <div className='mx-auto w-full max-w-6xl px-5 py-10 sm:px-6 sm:py-14'>
        <p className='text-muted-foreground font-mono text-[11px] font-medium uppercase'>
          {t('Getting started')}
        </p>
        <h2 className='mt-3 text-2xl font-semibold tracking-tight sm:text-3xl'>
          {t('Up and running in minutes')}
        </h2>
        <p className='text-muted-foreground mt-2 text-sm'>
          {t('Three steps to start using multiple model providers.')}
        </p>

        <div className='mt-6 grid gap-3 sm:grid-cols-3'>
          {steps.map((step) => (
            <article
              key={step.num}
              className='border-border/70 bg-card flex flex-col rounded-lg border p-5'
            >
              <span className='border-border text-muted-foreground inline-flex size-7 items-center justify-center rounded-[6px] border text-xs font-semibold'>
                {step.num}
              </span>
              <h3 className='mt-4 text-base font-semibold tracking-tight'>
                {step.title}
              </h3>
              <p className='text-muted-foreground mt-1.5 text-sm leading-6'>
                {step.desc}
              </p>
              <div className='mt-4'>{step.visual}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
