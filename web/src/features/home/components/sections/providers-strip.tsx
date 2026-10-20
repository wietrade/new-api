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

const providers = [
  { name: 'OpenAI', src: '/provider-logos/openai.svg' },
  { name: 'Anthropic', src: '/provider-logos/anthropic.svg' },
  { name: 'Gemini', src: '/provider-logos/gemini.svg' },
  { name: 'Groq', src: '/provider-logos/groq.svg' },
  { name: 'Mistral', src: '/provider-logos/mistral.svg' },
]

/* [改造] 仿 tokenmix.ai 的供应商横条 */
export function ProvidersStrip() {
  const { t } = useTranslation()

  return (
    <section className='border-border/80 border-b'>
      <div className='mx-auto w-full max-w-6xl px-5 py-10 sm:px-6 sm:py-12'>
        <p className='text-muted-foreground text-center font-mono text-[11px] font-medium uppercase'>
          {t('Providers connected to NowHub')}
        </p>
        <div className='mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5'>
          {providers.map((provider) => (
            <div
              key={provider.name}
              className='border-border/70 bg-card flex items-center justify-center gap-2 rounded-[6px] border px-3 py-3'
            >
              <span className='inline-flex size-6 items-center justify-center rounded-[5px] border border-zinc-200 bg-white'>
                <img
                  src={provider.src}
                  alt={provider.name}
                  className='size-4 object-contain'
                />
              </span>
              <span className='text-muted-foreground truncate text-xs font-medium'>
                {provider.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
