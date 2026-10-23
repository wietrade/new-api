import { PublicLayout } from '@/components/layout'

export interface DocsEmbedProps {
  /** 文档站内部路径，例如 "guide/quick-start.html"；留空即文档首页 */
  path?: string
}

/**
 * 主站外壳 + iframe 嵌套文档站。
 * 文档站通过 ?embed=1 隐藏自带的顶部导航/侧边栏/页脚，只保留正文。
 * iframe 内的 SPA 跳转不会换掉外壳，因此仍保持主站的头部与页脚。
 */
export function DocsEmbed(props: DocsEmbedProps) {
  const raw = (props.path ?? '').replace(/^\/+/, '')
  const src = `/docs/${raw}?embed=1`

  return (
    <PublicLayout showMainContainer={false}>
      <div className='pt-16'>
        <iframe
          src={src}
          title='NowHub 文档'
          className='bg-background w-full border-0'
          style={{ height: 'calc(100vh - 4rem)' }}
        />
      </div>
    </PublicLayout>
  )
}
