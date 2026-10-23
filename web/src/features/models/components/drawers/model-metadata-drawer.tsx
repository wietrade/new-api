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
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getModel, getVendors } from '../../api'
import { getNameRuleConfig } from '../../constants'
import { isModelEnabled, modelsQueryKeys, vendorsQueryKeys } from '../../lib'
import type { Model } from '../../types'

interface ModelMetadataDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: Model | null
}

function DetailRow(props: { label: string; children: ReactNode }) {
  return (
    <div className='grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 py-1.5'>
      <span className='text-muted-foreground text-sm'>{props.label}</span>
      <div className='min-w-0 text-sm break-words'>{props.children}</div>
    </div>
  )
}

function CsvBadges(props: { value?: string; emptyLabel: string }) {
  const items = (props.value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (items.length === 0) {
    return <span className='text-muted-foreground'>{props.emptyLabel}</span>
  }
  return (
    <div className='flex flex-wrap gap-1.5'>
      {items.map((item) => (
        <Badge
          key={item}
          variant='secondary'
          className='font-mono text-[11px] font-normal'
        >
          {item}
        </Badge>
      ))}
    </div>
  )
}

function TokenCount(props: { value?: number }) {
  const { t } = useTranslation()
  if (!props.value) {
    return <span className='text-muted-foreground'>{t('Not set')}</span>
  }
  return <span className='font-mono'>{props.value.toLocaleString()}</span>
}

function formatTimestamp(value?: number) {
  if (!value) return ''
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

export function ModelMetadataDrawer(props: ModelMetadataDrawerProps) {
  const { t } = useTranslation()
  const modelId = props.model?.id ?? 0
  const enabled = props.open && modelId > 0

  const detailQuery = useQuery({
    queryKey: modelsQueryKeys.detail(modelId),
    queryFn: async () => requireServerSuccess(await getModel(modelId)),
    enabled,
  })

  const vendorsQuery = useQuery({
    queryKey: vendorsQueryKeys.list(),
    queryFn: async () =>
      requireServerSuccess(await getVendors({ page_size: 1000 })),
    enabled: props.open,
  })

  const detail: Model | null = detailQuery.data?.data ?? null
  const vendors = vendorsQuery.data?.data?.items ?? []
  const vendorName =
    vendors.find((vendor) => vendor.id === detail?.vendor_id)?.name ?? ''
  const rules = getNameRuleConfig(t)

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[520px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle className='pr-6 break-all font-mono'>
            {props.model?.model_name ?? t('Metadata details')}
          </SheetTitle>
          <SheetDescription>
            {t('Read-only view of this model’s stored metadata.')}
          </SheetDescription>
        </SheetHeader>

        <div className={sideDrawerFormClassName()}>
          {modelId <= 0 && (
            <SideDrawerSection>
              <h3 className='text-sm font-semibold'>
                {t('No metadata record')}
              </h3>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'This row has no metadata record yet. Use Add metadata to create one.'
                )}
              </p>
            </SideDrawerSection>
          )}

          {modelId > 0 && detailQuery.isError && (
            <ErrorState
              description={detailQuery.error.message}
              onRetry={() => void detailQuery.refetch()}
            />
          )}

          {modelId > 0 && !detailQuery.isError && !detail && <LoadingState />}

          {detail && (
            <>
              <SideDrawerSection>
                <h3 className='text-sm font-semibold'>
                  {t('Basic Information')}
                </h3>
                <div className='flex flex-col'>
                  <DetailRow label={t('Model')}>
                    <span className='font-mono'>{detail.model_name}</span>
                  </DetailRow>
                  <DetailRow label={t('Vendor')}>
                    {vendorName || (
                      <span className='text-muted-foreground'>
                        {t('No vendor')}
                      </span>
                    )}
                  </DetailRow>
                  <DetailRow label={t('Description')}>
                    {detail.description || (
                      <span className='text-muted-foreground'>
                        {t('Not set')}
                      </span>
                    )}
                  </DetailRow>
                  <DetailRow label={t('Tags')}>
                    <CsvBadges value={detail.tags} emptyLabel={t('Not set')} />
                  </DetailRow>
                </div>
              </SideDrawerSection>

              <SideDrawerSection>
                <h3 className='text-sm font-semibold'>{t('Token limits')}</h3>
                <div className='flex flex-col'>
                  <DetailRow label={t('Context Length')}>
                    <TokenCount value={detail.context_length} />
                  </DetailRow>
                  <DetailRow label={t('Max output tokens')}>
                    <TokenCount value={detail.max_output_tokens} />
                  </DetailRow>
                  <DetailRow label={t('Free model')}>
                    {detail.is_free ? t('Yes') : t('No')}
                  </DetailRow>
                </div>
              </SideDrawerSection>

              <SideDrawerSection>
                <h3 className='text-sm font-semibold'>
                  {t('Capabilities')}
                </h3>
                <div className='flex flex-col'>
                  <DetailRow label={t('Input modalities')}>
                    <CsvBadges
                      value={detail.input_modalities}
                      emptyLabel={t('Not set')}
                    />
                  </DetailRow>
                  <DetailRow label={t('Output modalities')}>
                    <CsvBadges
                      value={detail.output_modalities}
                      emptyLabel={t('Not set')}
                    />
                  </DetailRow>
                  <DetailRow label={t('Capabilities')}>
                    <CsvBadges
                      value={detail.capabilities}
                      emptyLabel={t('Not set')}
                    />
                  </DetailRow>
                </div>
              </SideDrawerSection>

              <SideDrawerSection>
                <h3 className='text-sm font-semibold'>
                  {t('Sync and display')}
                </h3>
                <div className='flex flex-col'>
                  <DetailRow label={t('Display policy')}>
                    {isModelEnabled(detail) ? t('Allowed') : t('Not listed')}
                  </DetailRow>
                  <DetailRow label={t('Match Type')}>
                    {rules[detail.name_rule as 0 | 1 | 2 | 3]?.label ??
                      t('Not set')}
                  </DetailRow>
                  <DetailRow label={t('Official sync')}>
                    {detail.sync_official
                      ? t('Allow updates')
                      : t('Keep local')}
                  </DetailRow>
                  <DetailRow label={t('Created')}>
                    <span className='text-muted-foreground font-mono text-xs'>
                      {formatTimestamp(detail.created_time) || t('Not set')}
                    </span>
                  </DetailRow>
                  <DetailRow label={t('Updated')}>
                    <span className='text-muted-foreground font-mono text-xs'>
                      {formatTimestamp(detail.updated_time) || t('Not set')}
                    </span>
                  </DetailRow>
                </div>
              </SideDrawerSection>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
