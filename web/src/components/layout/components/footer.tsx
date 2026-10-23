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
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

interface FooterLink {
  text: string
  href: string
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
  const className =
    'inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground'

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
        {label}
      </a>
    )
  }

  return (
    <Link to={props.link.href} className={className}>
      {label}
    </Link>
  )
}

/* [改造] 页脚完全对齐 tokenmix.ai：5 列链接 + 品牌/状态/版权行 */
export function Footer(props: FooterProps) {
  const { t } = useTranslation()
  const { systemName, logo: systemLogo, footerHtml } = useSystemConfig()
  const { status } = useStatus()

  const displayLogo = systemLogo || props.logo || '/logo.png'
  const displayName = systemName || props.name || 'New API'
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
          {
            text: 'GitHub',
            href: 'https://github.com/wietrade/new-api',
          },
        ],
      },
      {
        title: t('Company'),
        links: [
          { text: t('About us'), href: '/about' },
          { text: t('Support tickets'), href: '/dashboard/tickets' },
          {
            text: t('Contact us'),
            href: 'mailto:support@nowhub.org',
          },
        ],
      },
      {
        title: t('Legal'),
        links: [
          { text: t('Terms of service'), href: '/user-agreement' },
          { text: t('Privacy policy'), href: '/privacy-policy' },
        ],
      },
      {
        title: t('Community'),
        links: [
          {
            text: 'GitHub',
            href: 'https://github.com/wietrade/new-api',
          },
          {
            text: 'AGPL-3.0',
            href: 'https://github.com/wietrade/new-api/blob/main/LICENSE',
          },
        ],
      },
    ],
    [t, docsHref]
  )

  const displayColumns = props.columns ?? fallbackColumns

  const body: ReactNode = footerHtml ? (
    <div
      className='custom-footer text-muted-foreground text-sm'
      dangerouslySetInnerHTML={{ __html: footerHtml }}
    />
  ) : (
    <div className='grid grid-cols-2 gap-x-8 gap-y-9 md:grid-cols-5'>
      {displayColumns.map((column, index) => (
        <div key={index}>
          <h3 className='mb-3 text-[13px] font-semibold'>{t(column.title)}</h3>
          <ul className='space-y-2'>
            {column.links.map((link, linkIndex) => (
              <li key={linkIndex}>
                <FooterLinkItem link={link} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )

  return (
    <footer
      className={cn(
        'border-border/80 bg-zinc-50 relative border-t dark:bg-[#141416]',
        props.className
      )}
    >
      <div className='mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 sm:py-14'>
        {body}

        <div className='border-border mt-12 flex flex-col items-start justify-between gap-4 border-t pt-8 sm:flex-row sm:items-center'>
          <div className='flex items-center gap-4'>
            <Link to='/' className='flex items-center gap-2'>
              <img
                src={displayLogo}
                alt={displayName}
                className='size-6 rounded-md object-contain'
              />
              <span className='text-base font-semibold'>
                {nameHead}
                <span className='text-zinc-500 dark:text-zinc-400'>
                  {nameTail}
                </span>
              </span>
            </Link>
            <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
              <span className='relative flex size-2'>
                <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
                <span className='relative inline-flex size-2 rounded-full bg-emerald-500' />
              </span>
              {t('All systems operational')}
            </span>
          </div>
          <p className='text-muted-foreground text-xs'>
            &copy; {currentYear} {displayName}.{' '}
            {props.copyright ?? t('footer.defaultCopyright')}
          </p>
        </div>
      </div>
    </footer>
  )
}
