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
import { LifeBuoy, Mail, Send } from 'lucide-react'
import {
  useMemo,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

// 地球图标：用 mask 方式着色，跟随主题文字颜色
const EARTH_ICON_URL = '/earth-americas.svg'

function EarthIcon({ className }: { className?: string }) {
  const style: CSSProperties = {
    maskImage: `url(${EARTH_ICON_URL})`,
    WebkitMaskImage: `url(${EARTH_ICON_URL})`,
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  }
  return (
    <span
      aria-hidden
      className={cn('inline-block bg-current', className)}
      style={style}
    />
  )
}

interface FooterLink {
  text: string
  href: string
  icon?: ComponentType<{ className?: string }>
}

interface FooterColumnProps {
  title: string
  links: FooterLink[]
}

interface FooterProps {
  logo?: string
  name?: string
  columns?: FooterColumnProps[]
  copyright?: string
  className?: string
}

function FooterLinkItem(props: { link: FooterLink }) {
  const { t } = useTranslation()
  const label = t(props.link.text)
  const Icon = props.link.icon
  const className =
    'inline-flex min-w-0 items-start gap-2 text-[13px] leading-5 text-white/60 transition-colors hover:text-white sm:text-sm'
  const content = (
    <>
      {Icon ? <Icon className='mt-0.5 size-4 shrink-0 opacity-70' /> : null}
      <span className='min-w-0 break-words'>{label}</span>
    </>
  )

  const href = props.link.href
  const isExternal = href.startsWith('http') || href.startsWith('mailto')
  // /docs 是 Go 静态站，不参与 SPA 路由
  const isStatic = href === '/docs' || href.startsWith('/docs/')

  if (isExternal || isStatic) {
    return (
      <a
        href={href}
        target={isExternal || isStatic ? '_blank' : undefined}
        rel={isExternal || isStatic ? 'noopener noreferrer' : undefined}
        className={className}
      >
        {content}
      </a>
    )
  }

  return (
    <Link to={props.link.href} className={className}>
      {content}
    </Link>
  )
}

/* [改造] 页脚完全对齐 tokenmix.ai：5 列链接 + 品牌/状态/版权行 */
export function Footer(props: FooterProps) {
  const { t } = useTranslation()
  const { systemName, logo: systemLogo, footerHtml } = useSystemConfig()
  const { status } = useStatus()

  const displayLogo = systemLogo || props.logo || '/logo.png'
  const displayName = systemName || props.name || 'NowHub.Org'
  const currentYear = new Date().getFullYear()
  const rawDocsLink = status?.docs_link as string | undefined
  const docsHref =
    rawDocsLink && /^https?:\/\//i.test(rawDocsLink) ? rawDocsLink : '/help'

  const [nameHead, nameTail] = useMemo(() => {
    const name = displayName || ''
    const camel = name.match(/^([A-Z][a-z0-9]*)(.+)$/)
    if (camel) return [camel[1], camel[2]] as [string, string]
    return [name, ''] as [string, string]
  }, [displayName])

  const fallbackColumns = useMemo<FooterColumnProps[]>(
    () => [
      {
        title: t('Product'),
        links: [
          { text: t('Model Square'), href: '/pricing' },
          { text: t('Leaderboard'), href: '/rankings' },
          { text: t('Console'), href: '/dashboard' },
        ],
      },
      {
        title: t('Developers'),
        links: [
          { text: t('Documentation'), href: docsHref },
          { text: t('API reference'), href: docsHref },
          { text: t('FAQ'), href: '/help/faq/' },
        ],
      },
      {
        title: t('Legal'),
        links: [
          { text: t('Terms of service'), href: '/user-agreement' },
          { text: t('Privacy policy'), href: '/privacy-policy' },
          { text: t('Acceptable use'), href: '/acceptable-use' },
          { text: t('Service level'), href: '/service-level' },
        ],
      },
      {
        title: t('Contact us'),
        links: [
          {
            text: 'support@nowhub.org',
            href: 'mailto:support@nowhub.org',
            icon: Mail,
          },
          {
            text: t('About us'),
            href: '/about',
            icon: LifeBuoy,
          },
          {
            text: '@wietrade',
            href: 'https://t.me/wietrade',
            icon: Send,
          },
          {
            text: 'NowHub.Org',
            href: '/',
            icon: EarthIcon,
          },
        ],
      },
    ],
    [t, docsHref]
  )

  const displayColumns = props.columns ?? fallbackColumns

  const body: ReactNode = footerHtml ? (
    <div
      className='custom-footer text-sm text-white/60'
      dangerouslySetInnerHTML={{ __html: footerHtml }}
    />
  ) : (
    <div className='grid gap-9 sm:gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2.15fr)] lg:gap-14'>
      <div className='max-w-sm'>
        <Link to='/' className='inline-flex items-center gap-2.5'>
          <img
            src={displayLogo}
            alt={displayName}
            className='size-7 rounded-md object-contain'
          />
          <span className='text-lg font-semibold tracking-tight text-white'>
            {nameHead}
            <span className='text-white/50'>{nameTail}</span>
          </span>
        </Link>
        <p className='mt-3 text-[13px] leading-6 text-white/60 sm:mt-4 sm:text-sm'>
          {t('footer.brandDescription')}
        </p>
        <span className='mt-4 inline-flex items-center gap-2 text-xs text-white/60 sm:mt-5'>
          <span className='relative flex size-2'>
            <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
            <span className='relative inline-flex size-2 rounded-full bg-emerald-500' />
          </span>
          {t('All systems operational')}
        </span>
      </div>

      <div className='grid grid-cols-2 gap-x-6 gap-y-8 xl:grid-cols-4 xl:gap-x-8 xl:gap-y-9'>
        {displayColumns.map((column, index) => (
          <div
            key={index}
            className={cn(
              'min-w-0',
              index === displayColumns.length - 1 &&
                'xl:border-white/15 xl:border-l xl:pl-6'
            )}
          >
            <h3 className='mb-2.5 text-[13px] font-semibold text-white sm:mb-3'>
              {t(column.title)}
            </h3>
            <ul className='space-y-2 sm:space-y-2.5'>
              {column.links.map((link, linkIndex) => (
                <li key={linkIndex}>
                  <FooterLinkItem link={link} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <footer
      className={cn(
        'relative border-t border-white/10 bg-black',
        props.className
      )}
    >
      <div className='mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14'>
        {body}

        <div className='mt-10 space-y-3 border-t border-white/10 pt-6 sm:mt-12'>
          <p className='text-xs text-white/50'>
            &copy; {currentYear} {displayName}.{' '}
            {props.copyright ?? t('footer.defaultCopyright')}
          </p>
          <p className='text-xs leading-5 text-white/40'>
            {t('footer.trademarkNotice')}
          </p>
        </div>
      </div>
    </footer>
  )
}
