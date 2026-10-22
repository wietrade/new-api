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
import { ArrowUpDown, Check, Filter, Grid2X2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { getSortLabels, type SortOption } from '../constants'
import { SearchBar } from './search-bar'
import type { PricingModel, PricingVendor, TokenUnit } from '../types'
import { PricingSidebar } from './pricing-sidebar'

export interface PricingToolbarProps {
  filteredCount: number
  totalCount?: number
  searchQuery: string
  onSearchChange: (value: string) => void
  onSearchClear: () => void
  sortBy: string
  onSortChange: (value: string) => void
  tokenUnit: TokenUnit
  onTokenUnitChange: (value: TokenUnit) => void
  showRechargePrice: boolean
  onRechargePriceChange: (value: boolean) => void
  quotaTypeFilter: string[]
  modelTypeFilter: string[]
  inputTypeFilter: string[]
  contextFilter: string[]
  priceTierFilter: string[]
  vendorFilter: string[]
  groupFilter: string[]
  onQuotaTypeChange: (value: string) => void
  onModelTypeChange: (value: string) => void
  onInputTypeChange: (value: string) => void
  onContextChange: (value: string) => void
  onPriceTierChange: (value: string) => void
  onVendorChange: (value: string) => void
  onGroupChange: (value: string) => void
  vendors: PricingVendor[]
  groups: string[]
  groupRatios?: Record<string, number>
  models: PricingModel[]
  hasActiveFilters: boolean
  activeFilterCount: number
  onClearFilters: () => void
}

export function PricingToolbar(props: PricingToolbarProps) {
  const { t } = useTranslation()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const sortLabels = getSortLabels(t)

  return (
    <div>
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setMobileFiltersOpen(true)}
            className='h-8 gap-1.5 xl:hidden'
          >
            <Filter className='size-4' />
            {t('Filter')}
            {props.activeFilterCount > 0 && (
              <Badge className='ml-0.5 size-5 justify-center p-0 text-[10px]'>
                {props.activeFilterCount}
              </Badge>
            )}
          </Button>

          <SearchBar
            value={props.searchQuery}
            onChange={props.onSearchChange}
            onClear={props.onSearchClear}
            placeholder={t('Search model name, provider, endpoint, or tag...')}
            className='min-w-0 flex-1 max-w-none [&_input]:pl-9 [&_input]:text-sm [&_input]:h-8'
          />

        <div className='flex shrink-0 items-center gap-2'>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-8 gap-1.5 px-2.5 text-sm'
                />
              }
            >
              <ArrowUpDown className='size-3.5' />
              <span>{sortLabels[props.sortBy as SortOption] || t('Sort')}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-44'>
              <DropdownMenuGroup>
                {Object.entries(sortLabels).map(([value, label]) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => props.onSortChange(value)}
                    className='gap-2'
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0',
                        props.sortBy === value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 仅作装饰：模型广场只提供卡片视图 */}
          <div
            aria-hidden='true'
            className='bg-muted/60 inline-flex h-8 items-center rounded-lg border p-0.5'
          >
            <span className='bg-primary text-primary-foreground inline-flex h-full w-7 items-center justify-center rounded-md'>
              <Grid2X2 className='size-3.5' />
            </span>
          </div>
        </div>
      </div>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent
          side='left'
          className={sideDrawerContentClassName('sm:max-w-md')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{t('Filter')}</SheetTitle>
            <SheetDescription>
              {t('Filter models by type, input, context length and price.')}
            </SheetDescription>
          </SheetHeader>
          <div className={sideDrawerFormClassName('gap-0')}>
            <PricingSidebar
              quotaTypeFilter={props.quotaTypeFilter}
              modelTypeFilter={props.modelTypeFilter}
              inputTypeFilter={props.inputTypeFilter}
              contextFilter={props.contextFilter}
              priceTierFilter={props.priceTierFilter}
              vendorFilter={props.vendorFilter}
              groupFilter={props.groupFilter}
              onQuotaTypeChange={props.onQuotaTypeChange}
              onModelTypeChange={props.onModelTypeChange}
              onInputTypeChange={props.onInputTypeChange}
              onContextChange={props.onContextChange}
              onPriceTierChange={props.onPriceTierChange}
              onVendorChange={props.onVendorChange}
              onGroupChange={props.onGroupChange}
              vendors={props.vendors}
              groups={props.groups}
              groupRatios={props.groupRatios}
              models={props.models}
              hasActiveFilters={props.hasActiveFilters}
              onClearFilters={props.onClearFilters}
              className='border-0 bg-transparent p-0 shadow-none'
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
