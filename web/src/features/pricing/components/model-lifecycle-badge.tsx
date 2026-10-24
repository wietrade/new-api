import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { ModelLifecycle } from '../types'

type BadgeLifecycle = Exclude<ModelLifecycle, 'ga'>

const LIFECYCLE_META: Record<
  BadgeLifecycle,
  { label: string; className: string }
> = {
  deprecated: {
    label: 'Deprecated',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  legacy: {
    label: 'Legacy',
    className: 'bg-muted text-muted-foreground',
  },
  preview: {
    label: 'Preview',
    className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  retired: {
    label: 'Retired',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
}

/**
 * 厂商生命周期徽标：只展示非 GA 且带明确官方状态的模型。
 * 状态来自上游元数据 lifecycle 字段（ga/preview/legacy/deprecated/retired）。
 */
export function ModelLifecycleBadge(props: {
  lifecycle?: ModelLifecycle
  className?: string
}) {
  const { t } = useTranslation()
  if (!props.lifecycle || props.lifecycle === 'ga') {
    return null
  }
  const meta = LIFECYCLE_META[props.lifecycle as BadgeLifecycle]
  if (!meta) {
    return null
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] leading-4 font-semibold',
        meta.className,
        props.className
      )}
    >
      {t(meta.label)}
    </span>
  )
}
