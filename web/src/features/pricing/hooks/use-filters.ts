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
import { useSearch } from '@tanstack/react-router'
import { useMemo, useCallback, useState } from 'react'

import { useDebounce } from '@/hooks/use-debounce'

import {
  SORT_OPTIONS,
  DEFAULT_TOKEN_UNIT,
  VIEW_MODES,
  type ViewMode,
} from '../constants'
import { filterAndSortModels } from '../lib/filters'
import type { PricingModel, TokenUnit } from '../types'

type FilterState = {
  search?: string
  sort?: string
  vendor?: string[]
  group?: string[]
  quotaType?: string[]
  modelType?: string[]
  inputType?: string[]
  context?: string[]
  priceTier?: string[]
  tokenUnit?: TokenUnit
  view?: ViewMode
  rechargePrice?: boolean
}

/** URL filters may be `a` or `a,b`; `all` and empties mean "no restriction". */
function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean)
  }
  if (typeof value === 'string') {
    if (!value || value === 'all') return []
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value]
}

function normalizeViewMode(value: unknown): ViewMode {
  if (value === VIEW_MODES.TABLE) {
    return VIEW_MODES.TABLE
  }
  return VIEW_MODES.CARD
}

export function useFilters(models: PricingModel[]) {
  const search = useSearch({ from: '/pricing/' })
  const [filterState, setFilterState] = useState<FilterState>(() => ({
    search: search.search,
    sort: search.sort,
    vendor: parseList(search.vendor),
    group: parseList(search.group),
    quotaType: parseList(search.quotaType),
    modelType: parseList(search.modelType),
    inputType: parseList(search.inputType),
    context: parseList(search.context),
    priceTier: parseList(search.priceTier),
    tokenUnit: search.tokenUnit,
    view: search.view,
    rechargePrice: search.rechargePrice,
  }))

  const searchInput = filterState.search || ''
  const debouncedSearchInput = useDebounce(searchInput, 200)
  const sortBy = filterState.sort || SORT_OPTIONS.INPUT_PRICE_LOW
  const vendorFilter = filterState.vendor ?? []
  const groupFilter = filterState.group ?? []
  const quotaTypeFilter = filterState.quotaType ?? []
  const modelTypeFilter = filterState.modelType ?? []
  const inputTypeFilter = filterState.inputType ?? []
  const contextFilter = filterState.context ?? []
  const priceTierFilter = filterState.priceTier ?? []
  const tokenUnit: TokenUnit =
    filterState.tokenUnit === 'K' ? 'K' : DEFAULT_TOKEN_UNIT
  const viewMode = normalizeViewMode(filterState.view)
  const showRechargePrice = filterState.rechargePrice === true

  const updateFilters = useCallback((updates: Record<string, unknown>) => {
    setFilterState((prev) => {
      const next: Record<string, unknown> = { ...prev, ...updates }
      for (const key of Object.keys(next)) {
        const value = next[key]
        if (
          value === undefined ||
          value === null ||
          (Array.isArray(value) && value.length === 0)
        ) {
          delete next[key]
        }
      }
      return next as FilterState
    })
  }, [])

  const setSearchInput = useCallback(
    (v: string) => updateFilters({ search: v || undefined }),
    [updateFilters]
  )
  const setSortBy = useCallback(
    (v: string) =>
      updateFilters({ sort: v === SORT_OPTIONS.NAME ? undefined : v }),
    [updateFilters]
  )
  const setTokenUnit = useCallback(
    (v: TokenUnit) =>
      updateFilters({ tokenUnit: v === DEFAULT_TOKEN_UNIT ? undefined : v }),
    [updateFilters]
  )
  const setViewMode = useCallback(
    (v: ViewMode) =>
      updateFilters({ view: v === VIEW_MODES.CARD ? undefined : v }),
    [updateFilters]
  )
  const setShowRechargePrice = useCallback(
    (v: boolean) => updateFilters({ rechargePrice: v || undefined }),
    [updateFilters]
  )

  const setVendorFilter = useCallback(
    (v: string) =>
      updateFilters({ vendor: v === 'all' ? [] : toggleValue(vendorFilter, v) }),
    [vendorFilter, updateFilters]
  )
  const setGroupFilter = useCallback(
    (v: string) =>
      updateFilters({ group: v === 'all' ? [] : toggleValue(groupFilter, v) }),
    [groupFilter, updateFilters]
  )
  const setQuotaTypeFilter = useCallback(
    (v: string) =>
      updateFilters({
        quotaType: v === 'all' ? [] : toggleValue(quotaTypeFilter, v),
      }),
    [quotaTypeFilter, updateFilters]
  )
  const setModelTypeFilter = useCallback(
    (v: string) =>
      updateFilters({
        modelType: v === 'all' ? [] : toggleValue(modelTypeFilter, v),
      }),
    [modelTypeFilter, updateFilters]
  )
  const setInputTypeFilter = useCallback(
    (v: string) =>
      updateFilters({
        inputType: v === 'all' ? [] : toggleValue(inputTypeFilter, v),
      }),
    [inputTypeFilter, updateFilters]
  )
  const setContextFilter = useCallback(
    (v: string) =>
      updateFilters({
        context: v === 'all' ? [] : toggleValue(contextFilter, v),
      }),
    [contextFilter, updateFilters]
  )
  const setPriceTierFilter = useCallback(
    (v: string) =>
      updateFilters({
        priceTier: v === 'all' ? [] : toggleValue(priceTierFilter, v),
      }),
    [priceTierFilter, updateFilters]
  )

  const filteredModels = useMemo(() => {
    if (!models || models.length === 0) return []

    return filterAndSortModels(models, {
      search: debouncedSearchInput,
      vendor: vendorFilter,
      group: groupFilter,
      quotaType: quotaTypeFilter,
      modelType: modelTypeFilter,
      inputType: inputTypeFilter,
      context: contextFilter,
      priceTier: priceTierFilter,
      sortBy,
    })
  }, [
    models,
    debouncedSearchInput,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    modelTypeFilter,
    inputTypeFilter,
    contextFilter,
    priceTierFilter,
    sortBy,
  ])

  const activeFilters = useMemo(
    () => [
      vendorFilter.length > 0,
      groupFilter.length > 0,
      quotaTypeFilter.length > 0,
      modelTypeFilter.length > 0,
      inputTypeFilter.length > 0,
      contextFilter.length > 0,
      priceTierFilter.length > 0,
    ],
    [
      vendorFilter,
      groupFilter,
      quotaTypeFilter,
      modelTypeFilter,
      inputTypeFilter,
      contextFilter,
      priceTierFilter,
    ]
  )

  const hasActiveFilters = useMemo(
    () => activeFilters.some(Boolean),
    [activeFilters]
  )
  const activeFilterCount = useMemo(
    () => activeFilters.filter(Boolean).length,
    [activeFilters]
  )

  const clearFilters = useCallback(() => {
    updateFilters({
      vendor: [],
      group: [],
      quotaType: [],
      modelType: [],
      inputType: [],
      context: [],
      priceTier: [],
    })
  }, [updateFilters])

  const clearSearch = useCallback(() => {
    updateFilters({ search: undefined })
  }, [updateFilters])

  return {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    modelTypeFilter,
    inputTypeFilter,
    contextFilter,
    priceTierFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setModelTypeFilter,
    setInputTypeFilter,
    setContextFilter,
    setPriceTierFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    clearFilters,
    clearSearch,
  }
}
