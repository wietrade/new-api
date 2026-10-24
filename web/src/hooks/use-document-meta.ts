import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useSystemConfig } from '@/hooks/use-system-config'

type PageMeta = {
  title: string
  description: string
}

const DEFAULT_META: PageMeta = {
  title: 'NowHub API · 统一的模型 API 接入层',
  description:
    '一个 API 接入主流大模型：兼容 OpenAI、Anthropic、Gemini 协议，按实际用量计费，价格透明。',
}

// 主站是纯前端渲染，这里按路由补上可被搜索引擎与分享卡片读取的元信息。
const ROUTE_META: Array<{ match: RegExp; meta: PageMeta }> = [
  {
    match: /^\/$/,
    meta: DEFAULT_META,
  },
  {
    match: /^\/pricing/,
    meta: {
      title: '模型广场 · NowHub API',
      description:
        '浏览全部可用大模型与实时结算价格，支持按供应商、上下文长度、输入类型和价格筛选。',
    },
  },
  {
    match: /^\/rankings/,
    meta: {
      title: '排行榜 · NowHub API',
      description: '按模型调用量、成功率与延迟查看大模型表现，选择更稳更快的接入线路。',
    },
  },
  {
    match: /^\/about/,
    meta: {
      title: '关于我们 · NowHub API',
      description: 'NowHub API 是独立的模型接口聚合与技术服务方，为开发者提供统一的大模型接入。',
    },
  },
  {
    match: /^\/help/,
    meta: {
      title: '帮助中心 · NowHub API',
      description: '接入指南、常见问题与故障排查：鉴权、额度、超时、缓存与计费说明。',
    },
  },
  {
    match: /^\/user-agreement/,
    meta: {
      title: '服务条款 · NowHub API',
      description: 'NowHub API 服务条款，说明服务范围、账号责任、计费与终止条件。',
    },
  },
  {
    match: /^\/privacy-policy/,
    meta: {
      title: '隐私政策 · NowHub API',
      description: 'NowHub API 隐私政策，说明我们收集哪些数据、如何使用与保护这些数据。',
    },
  },
  {
    match: /^\/acceptable-use/,
    meta: {
      title: '可接受使用政策 · NowHub API',
      description: 'NowHub API 可接受使用政策，列明禁止的使用方式与违规处理规则。',
    },
  },
  {
    match: /^\/service-level/,
    meta: {
      title: '服务等级说明 · NowHub API',
      description: 'NowHub API 服务等级说明：可用性目标、故障响应流程与统计口径。',
    },
  },
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
  const brand = systemName || 'NowHub API'

  useEffect(() => {
    const matched = ROUTE_META.find((route) => route.match.test(pathname))
    const meta = matched?.meta ?? { title: brand, description: DEFAULT_META.description }

    document.title = meta.title
    upsertMeta('name', 'title', meta.title)
    upsertMeta('name', 'description', meta.description)
    upsertMeta('property', 'og:title', meta.title)
    upsertMeta('property', 'og:description', meta.description)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:url', window.location.href)
    upsertMeta('name', 'twitter:card', 'summary')
  }, [brand, pathname])
}
