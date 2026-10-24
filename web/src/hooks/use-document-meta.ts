import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useSystemConfig } from '@/hooks/use-system-config'

/** 社交分享图（与 index.html 的静态标签一致，切换路由时不丢失） */
const OG_IMAGE = 'https://www.nowhub.org/og-image.png'

/**
 * 主站是纯前端渲染，这里按路由补上可被搜索引擎与分享卡片读取的元信息。
 * 文案取自语言包（meta.*），中英文各一份，其余语言回落到英文。
 */
const ROUTE_META: Array<{ match: RegExp; key: string }> = [
  { match: /^\/$/, key: 'site' },
  { match: /^\/pricing/, key: 'pricing' },
  { match: /^\/rankings/, key: 'rankings' },
  { match: /^\/about/, key: 'about' },
  { match: /^\/help/, key: 'help' },
  { match: /^\/user-agreement/, key: 'terms' },
  { match: /^\/privacy-policy/, key: 'privacy' },
  { match: /^\/acceptable-use/, key: 'aup' },
  { match: /^\/service-level/, key: 'sla' },
]

function upsertMeta(
  attribute: 'name' | 'property',
  key: string,
  content: string
) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  )
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

/**
 * 按当前路由同步 title / description / Open Graph 元信息。
 * 主站没有 SSR，这一步让爬虫与社交分享拿到更准确的页面信息。
 */
export function useDocumentMeta() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { systemName } = useSystemConfig()
  const { t, i18n } = useTranslation()
  const brand = systemName || 'NowHub API'

  useEffect(() => {
    const matched = ROUTE_META.find((route) => route.match.test(pathname))
    const key = matched?.key ?? 'site'
    const pageTitle = t(`meta.${key}.title`)
    const description = t(`meta.${key}.description`)
    // 首页以品牌开头，其余页面为「页面名 · 品牌」
    const title =
      key === 'site' ? `${brand} · ${pageTitle}` : `${pageTitle} · ${brand}`

    document.title = title
    upsertMeta('name', 'title', title)
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:url', window.location.href)
    upsertMeta('property', 'og:site_name', brand)
    upsertMeta('property', 'og:image', OG_IMAGE)
    upsertMeta('property', 'og:image:width', '1200')
    upsertMeta('property', 'og:image:height', '630')
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:image', OG_IMAGE)
  }, [brand, pathname, t, i18n.language])
}
