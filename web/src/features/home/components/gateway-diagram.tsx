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
import { cn } from '@/lib/utils'

const ACCENT = '#2DA44E'
const BEAM = '#3ecf8e'

const endpoints = ['/v1/chat', '/v1/embeddings', '/v1/audio', '/v1/rerank']

const providers = [
  { name: 'OpenAI', src: '/provider-logos/openai.svg' },
  { name: 'Anthropic', src: '/provider-logos/anthropic.svg' },
  { name: 'Gemini', src: '/provider-logos/gemini.svg' },
  { name: 'Groq', src: '/provider-logos/groq.svg' },
  { name: 'Mistral', src: '/provider-logos/mistral.svg' },
]

/* 入站请求依次点亮：4 条入口线错开出发 */
const IN_DELAYS = [-2.4, -1.7, -1.0, -0.3]
/* 出站请求依次点亮：5 条出口线错开出发 */
const OUT_DELAYS = [-1.55, -1.03, -0.51, -2.07, -2.59]

const BEAM_TIMING = '2.6s cubic-bezier(.45,0,.55,1) infinite'

/* [改造] 参考 getmaxim.ai/llm-gateway：绿色光点沿连线滑动 + 卡片浮动 + 到达高亮 */
const DIAGRAM_CSS = `
  @keyframes nh-beam {
    from { stroke-dashoffset: 112; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes nh-float {
    0%, 100% { transform: translateY(-3px); }
    50% { transform: translateY(3px); }
  }
  @keyframes nh-arrive {
    0%, 62% { stroke: var(--border); }
    72% { stroke: ${BEAM}; }
    92%, 100% { stroke: var(--border); }
  }
  @keyframes nh-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 0.95; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nh-beam, .nh-arrive, .nh-float, .nh-pulse { animation: none !important; }
  }
`

export function GatewayDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 560 320'
      role='img'
      aria-label='One SDK connects to the NowHub router, which routes to multiple AI providers'
      className={cn('h-auto w-full', className)}
    >
      <defs>
        <style>{DIAGRAM_CSS}</style>
        <pattern id='gw-dots' width='16' height='16' patternUnits='userSpaceOnUse'>
          <circle cx='1' cy='1' r='0.8' fill='var(--border)' opacity='0.55' />
        </pattern>
        <filter
          id='gw-beam-glow'
          x='-30%'
          y='-30%'
          width='160%'
          height='160%'
        >
          <feGaussianBlur stdDeviation='2' result='b' />
          <feMerge>
            <feMergeNode in='b' />
            <feMergeNode in='SourceGraphic' />
          </feMerge>
        </filter>
        <marker
          id='gw-arrow'
          viewBox='0 0 10 10'
          refX='8'
          refY='5'
          markerWidth='5'
          markerHeight='5'
          orient='auto-start-reverse'
        >
          <path d='M0 0L10 5L0 10z' fill='var(--border)' />
        </marker>
      </defs>

      <rect width='560' height='320' fill='url(#gw-dots)' />

      {/* Left: one SDK */}
      <text
        x='8'
        y='26'
        fontSize='8.5'
        letterSpacing='2.4'
        fill='var(--muted-foreground)'
        fontFamily='ui-monospace, SFMono-Regular, monospace'
      >
        [ ONE SDK ]
      </text>
      {endpoints.map((path, index) => {
        const y = 52 + index * 32
        const d = `M126 ${y + 13} C146 ${y + 13} 150 130 168 130`
        return (
          <g key={path}>
            <path
              d={d}
              fill='none'
              stroke='var(--border)'
              strokeWidth='1.4'
              markerEnd='url(#gw-arrow)'
            />
            {/* 光点：10% 长度的绿色虚线沿路径滑动 */}
            <path
              className='nh-beam'
              d={d}
              pathLength={100}
              fill='none'
              stroke={BEAM}
              strokeWidth='2.2'
              strokeLinecap='round'
              strokeDasharray='10 102'
              filter='url(#gw-beam-glow)'
              style={{
                animation: `nh-beam ${BEAM_TIMING}`,
                animationDelay: `${IN_DELAYS[index]}s`,
              }}
            />
            <rect
              x='8'
              y={y}
              width='118'
              height='26'
              rx='5'
              fill='var(--card)'
              stroke='var(--border)'
            />
            <text
              x='18'
              y={y + 17}
              fontSize='10'
              fill='var(--muted-foreground)'
              fontFamily='ui-monospace, SFMono-Regular, monospace'
            >
              {path}
            </text>
          </g>
        )
      })}

      {/* Center: router (轻微上下浮动) */}
      <g
        className='nh-float'
        style={{
          animation: 'nh-float 6s ease-in-out infinite',
          transformOrigin: '286px 130px',
        }}
      >
        <rect
          x='168'
          y='52'
          width='236'
          height='156'
          rx='10'
          fill='var(--card)'
          stroke='var(--border)'
        />
        <g>
          <rect x='182' y='66' width='20' height='20' rx='5' fill={ACCENT} />
          <text
            x='192'
            y='80.5'
            fontSize='11'
            fontWeight='700'
            textAnchor='middle'
            fill='#ffffff'
          >
            N
          </text>
          <text
            x='210'
            y='80'
            fontSize='9.5'
            fontWeight='700'
            letterSpacing='1.4'
            fill='var(--foreground)'
          >
            NOWHUB ROUTER
          </text>
          <rect
            x='334'
            y='64'
            width='56'
            height='18'
            rx='9'
            fill={ACCENT}
            fillOpacity='0.12'
            stroke={ACCENT}
            strokeOpacity='0.35'
          />
          <circle
            className='nh-pulse'
            cx='344'
            cy='73'
            r='2.5'
            fill={ACCENT}
            style={{ animation: 'nh-pulse 2.6s ease-in-out infinite' }}
          />
          <text x='352' y='76.5' fontSize='7' fill={ACCENT} fontWeight='600'>
            ACTIVE
          </text>
        </g>
        <line
          x1='168'
          y1='96'
          x2='404'
          y2='96'
          stroke='var(--border)'
          strokeDasharray='2 3'
        />
        <text
          x='184'
          y='120'
          fontSize='7'
          letterSpacing='1.2'
          fill='var(--muted-foreground)'
        >
          ALIAS
        </text>
        <text
          x='252'
          y='120'
          fontSize='9.5'
          fill='var(--foreground)'
          fontFamily='ui-monospace, SFMono-Regular, monospace'
        >
          fast-chat → gpt-4o
        </text>
        <text
          x='184'
          y='148'
          fontSize='7'
          letterSpacing='1.2'
          fill='var(--muted-foreground)'
        >
          KEY
        </text>
        <text
          x='252'
          y='148'
          fontSize='9.5'
          fill='var(--foreground)'
          fontFamily='ui-monospace, SFMono-Regular, monospace'
        >
          sk-••••4f2c
        </text>
      </g>

      {/* Right: providers */}
      <text
        x='552'
        y='26'
        fontSize='8.5'
        letterSpacing='2.4'
        textAnchor='end'
        fill='var(--muted-foreground)'
        fontFamily='ui-monospace, SFMono-Regular, monospace'
      >
        [ PROVIDERS ]
      </text>
      {providers.map((provider, index) => {
        const y = 44 + index * 38
        const d = `M404 130 C438 130 452 ${y + 15} 486 ${y + 15}`
        return (
          <g key={provider.name}>
            <path
              d={d}
              fill='none'
              stroke='var(--border)'
              strokeWidth='1.4'
              markerEnd='url(#gw-arrow)'
            />
            <path
              className='nh-beam'
              d={d}
              pathLength={100}
              fill='none'
              stroke={BEAM}
              strokeWidth='2.2'
              strokeLinecap='round'
              strokeDasharray='10 102'
              filter='url(#gw-beam-glow)'
              style={{
                animation: `nh-beam ${BEAM_TIMING}`,
                animationDelay: `${OUT_DELAYS[index]}s`,
              }}
            />
            {/* 光点抵达时边框闪一下绿 */}
            <rect
              className='nh-arrive'
              x='486'
              y={y}
              width='30'
              height='30'
              rx='8'
              fill='#ffffff'
              stroke='var(--border)'
              style={{
                animation: 'nh-arrive 2.6s linear infinite',
                animationDelay: `${OUT_DELAYS[index]}s`,
              }}
            />
            <image
              href={provider.src}
              x='491'
              y={y + 5}
              width='20'
              height='20'
              preserveAspectRatio='xMidYMid meet'
            />
          </g>
        )
      })}
      <text
        x='501'
        y='248'
        fontSize='7.5'
        textAnchor='middle'
        fill='var(--muted-foreground)'
      >
        + 13 MORE
      </text>

      {/* Footer */}
      <text
        x='280'
        y='302'
        fontSize='8'
        letterSpacing='2'
        textAnchor='middle'
        fill='var(--muted-foreground)'
        fontFamily='ui-monospace, SFMono-Regular, monospace'
      >
        [ ONE INTERFACE · 20+ PROVIDERS · 1,000+ MODELS ]
      </text>
    </svg>
  )
}
