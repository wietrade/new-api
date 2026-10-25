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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { useMediaQuery } from '@/hooks'

import {
  LoadingSkeleton,
  EmptyState,
  PricingFilterBar,
  ModelCardGrid,
  ModelTable,
  ModelDetailsDrawer,
} from './components'
import { EXCLUDED_GROUPS } from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'
import './pricing.css'

export function Pricing() {
  const { t } = useTranslation()
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )
  // 窄屏用卡片（七列表格在 400px 内无法阅读），宽屏保留表格
  const isCompact = useMediaQuery('(max-width: 767px)')

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    modelTypeFilter,
    inputTypeFilter,
    contextFilter,
    priceTierFilter,
    tokenUnit,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    selectVendorFilter,
    selectModelTypeFilter,
    selectInputTypeFilter,
    selectContextFilter,
    selectPriceTierFilter,
    filteredModels,
    hasActiveFilters,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  // 只统计真正有可用模型的供应商（后台存在但无渠道的供应商不计入）
  const vendorCount = useMemo(
    () =>
      new Set(
        (models || []).map((m) => m.vendor_name).filter((v): v is string => !!v)
      ).size,
    [models]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    if (isCompact) {
      return (
        <ModelCardGrid
          models={filteredModels}
          onModelClick={handleModelClick}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          selectedGroup={groupFilter[0]}
        />
      )
    }

    return (
      <ModelTable
        models={filteredModels}
        onModelClick={handleModelClick}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        selectedGroup={groupFilter[0]}
      />
    )
  }

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-6xl px-5 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10'>
          <LoadingSkeleton />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='pricing-page relative'>
        <PageTransition className='relative mx-auto w-full max-w-6xl px-5 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10'>
          <header className='pricing-hero'>
            <p className='pricing-breadcrumb'>
              NowHub <em>/</em> 模型广场 <em>/</em> Live catalog
            </p>
            <h1 className='pricing-title'>{t('Model Square')}</h1>
            <p className='pricing-subtitle'>
              一个 API 接入主流大模型，价格透明、开箱可用。所有价格均为本站实际结算价，
              按分组倍率实时换算。
            </p>
            <dl className='pricing-stats'>
              <div>
                <dt>01 · 模型</dt>
                <dd>{models?.length ?? 0}</dd>
              </div>
              <div>
                <dt>02 · 供应商</dt>
                <dd>{vendorCount}</dd>
              </div>
              <div>
                <dt>03 · 可用分组</dt>
                <dd>{availableGroups?.length ?? 0}</dd>
              </div>
            </dl>
          </header>

          <PricingFilterBar
            searchQuery={searchInput}
            onSearchChange={setSearchInput}
            onSearchClear={clearSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            vendors={vendors || []}
            vendorFilter={vendorFilter}
            onVendorChange={selectVendorFilter}
            modelTypeFilter={modelTypeFilter}
            onModelTypeChange={selectModelTypeFilter}
            inputTypeFilter={inputTypeFilter}
            onInputTypeChange={selectInputTypeFilter}
            contextFilter={contextFilter}
            onContextChange={selectContextFilter}
            priceTierFilter={priceTierFilter}
            onPriceTierChange={selectPriceTierFilter}
            filteredCount={filteredModels.length}
            totalCount={models?.length}
            models={models || []}
          />

          <main className='mt-4 min-w-0'>{renderPricingContent()}</main>

          {selectedModel && (
            <ModelDetailsDrawer
              open={Boolean(selectedModel)}
              onOpenChange={(open) => {
                if (!open) setSelectedModelName(null)
              }}
              model={selectedModel}
              groupRatio={groupRatio || {}}
              usableGroup={usableGroup || {}}
              endpointMap={
                (endpointMap as Record<
                  string,
                  { path?: string; method?: string }
                >) || {}
              }
              autoGroups={autoGroups || []}
              priceRate={priceRate ?? 1}
              usdExchangeRate={usdExchangeRate ?? 1}
              tokenUnit={tokenUnit}
              showRechargePrice={showRechargePrice}
            />
          )}
        </PageTransition>
      </div>
    </PublicLayout>
  )
}
