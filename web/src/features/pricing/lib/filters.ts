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
import {
  SORT_OPTIONS,
  FILTER_ALL,
  QUOTA_TYPES,
  QUOTA_TYPE_VALUES,
  ENDPOINT_TYPES,
  CONTEXT_RANGES,
  CONTEXT_RANGE_BOUNDS,
  MODEL_TYPES,
  PRICE_TIERS,
  type ContextRange,
  type QuotaTypeOption,
  type SortOption,
} from '../constants'
import type { PricingModel } from '../types'
import { compileBillingExpression } from './billing-expression/parser'
import { visitExpression } from './billing-expression/types'
import {
  getCardExamplePrice,
  getDynamicPricingSummary,
  hasTaskUsageSchema,
  isUnconfiguredTaskUsageModel,
} from './dynamic-price'
import { getDisplayGroupRatio, isTokenBasedModel } from './model-helpers'
import { calculateTokenPrice } from './price'

// ----------------------------------------------------------------------------
// Filter Utilities
// ----------------------------------------------------------------------------

/**
 * Filter models by search query
 */
export function filterBySearch(
  models: PricingModel[],
  query: string
): PricingModel[] {
  if (!query) return models

  const lowerQuery = query.toLowerCase()
  return models.filter(
    (m) =>
      m.model_name?.toLowerCase().includes(lowerQuery) ||
      m.description?.toLowerCase().includes(lowerQuery) ||
      m.tags?.toLowerCase().includes(lowerQuery) ||
      m.vendor_name?.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Filter models by vendor
 */
export function filterByVendor(
  models: PricingModel[],
  vendors: string[]
): PricingModel[] {
  if (vendors.length === 0) return models
  return models.filter(
    (m) => m.vendor_name != null && vendors.includes(m.vendor_name)
  )
}

/**
 * Filter models by group
 */
export function filterByGroup(
  models: PricingModel[],
  groups: string[]
): PricingModel[] {
  if (groups.length === 0) return models
  return models.filter((m) => groups.some((g) => m.enable_groups?.includes(g)))
}

/** Pricing category of the active configuration, shared by filters and counts. */
export function getModelQuotaType(
  model: PricingModel
): Exclude<QuotaTypeOption, 'all'> | undefined {
  // Task-usage models retain their own category.
  if (hasTaskUsageSchema(model)) return QUOTA_TYPES.TASK

  if (model.billing_mode === 'tiered_expr' && model.billing_expr) {
    const compiled = compileBillingExpression(model.billing_expr)
    if (compiled.status === 'ready') {
      if (!compiled.functions.has('fixed')) return QUOTA_TYPES.TOKEN

      // Only models whose pricing leaves are all fixed count as per-request.
      let hasTokenPricing = false
      visitExpression(compiled.ast, (node) => {
        if (node.kind !== 'call' || node.name !== 'tier') return
        const price = node.args[1]
        if (price.kind !== 'call' || price.name !== 'fixed') {
          hasTokenPricing = true
        }
      })
      return hasTokenPricing ? QUOTA_TYPES.TOKEN : QUOTA_TYPES.REQUEST
    }
  }

  // Preserve legacy classification when the expression cannot be parsed.
  if (model.quota_type === QUOTA_TYPE_VALUES.TOKEN) return QUOTA_TYPES.TOKEN
  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
    return QUOTA_TYPES.REQUEST
  }
  return undefined
}

/**
 * Filter models by quota type
 */
/** Bucket a model by how it is billed. */
export function getQuotaTypeOf(model: PricingModel): string {
  // Task-usage models form their own bucket, disjoint from token/request.
  if (hasTaskUsageSchema(model)) return QUOTA_TYPES.TASK
  if (model.quota_type === QUOTA_TYPE_VALUES.TOKEN) return QUOTA_TYPES.TOKEN
  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) return QUOTA_TYPES.REQUEST
  return QUOTA_TYPES.ALL
}

export function filterByQuotaType(
  models: PricingModel[],
  quotaTypes: string[]
): PricingModel[] {
  if (quotaTypes.length === 0 || quotaTypes.includes(QUOTA_TYPES.ALL)) {
    return models
  }
  return models.filter((model) => {
    const type = getModelQuotaType(model)
    return type != null && quotaTypes.includes(type)
  })
}

/**
 * Filter models by endpoint type
 */
export function filterByEndpointType(
  models: PricingModel[],
  endpointType: string
): PricingModel[] {
  if (endpointType === ENDPOINT_TYPES.ALL) return models
  return models.filter((m) =>
    m.supported_endpoint_types?.includes(endpointType)
  )
}

/**
 * Task-level types a model belongs to. A model can belong to several
 * (e.g. Claude is both Text and Image because it understands images).
 */
export function getModelTypes(model: PricingModel): string[] {
  const input = new Set((model.input_modalities ?? []).map((v) => v.toLowerCase()))
  const output = new Set(
    (model.output_modalities ?? []).map((v) => v.toLowerCase())
  )
  const capabilities = new Set(
    (model.capabilities ?? []).map((v) => v.toLowerCase())
  )
  const types: string[] = []
  if (capabilities.has('embedding')) types.push(MODEL_TYPES.EMBEDDING)
  if (capabilities.has('rerank')) types.push(MODEL_TYPES.RERANK)
  if (output.has('image')) types.push(MODEL_TYPES.IMAGE)
  if (output.has('video')) types.push(MODEL_TYPES.VIDEO)
  if (output.has('audio') || input.has('audio')) types.push(MODEL_TYPES.AUDIO)
  if (
    output.has('text') &&
    !capabilities.has('embedding') &&
    !capabilities.has('rerank')
  ) {
    types.push(MODEL_TYPES.TEXT)
  }
  return types
}

/** Filter models by task-level type. */
export function filterByModelType(
  models: PricingModel[],
  modelTypes: string[]
): PricingModel[] {
  if (modelTypes.length === 0) return models
  return models.filter((m) => {
    const types = getModelTypes(m)
    return modelTypes.some((type) => types.includes(type))
  })
}

/** Filter models by accepted input modality. */
export function filterByInputType(
  models: PricingModel[],
  inputTypes: string[]
): PricingModel[] {
  if (inputTypes.length === 0) return models
  const wanted = inputTypes.map((v) => v.toLowerCase())
  return models.filter((m) =>
    (m.input_modalities ?? []).some((v) => wanted.includes(v.toLowerCase()))
  )
}

/** Filter models by free / paid tier. */
export function filterByPriceTier(
  models: PricingModel[],
  tiers: string[]
): PricingModel[] {
  if (tiers.length === 0) return models
  return models.filter((m) =>
    tiers.includes(m.is_free === true ? PRICE_TIERS.FREE : PRICE_TIERS.PAID)
  )
}

/** Bucket a model by its declared context window; undefined when unknown. */
export function getContextRangeOf(
  model: PricingModel
): ContextRange | undefined {
  const value = model.context_length ?? 0
  if (value <= 0) return undefined
  if (value < CONTEXT_RANGE_BOUNDS[CONTEXT_RANGES.SMALL].max) {
    return CONTEXT_RANGES.SMALL
  }
  if (value < CONTEXT_RANGE_BOUNDS[CONTEXT_RANGES.MEDIUM].max) {
    return CONTEXT_RANGES.MEDIUM
  }
  return CONTEXT_RANGES.LARGE
}

/** Filter models by context window bucket. */
export function filterByContextRange(
  models: PricingModel[],
  ranges: string[]
): PricingModel[] {
  if (ranges.length === 0) return models
  return models.filter((m) => {
    const range = getContextRangeOf(m)
    return range != null && ranges.includes(range)
  })
}

type SortPriceKind = 'input' | 'output' | 'request'

const PRICE_SORTS: Partial<
  Record<SortOption, { kind: SortPriceKind; dir: 1 | -1 }>
> = {
  [SORT_OPTIONS.INPUT_PRICE_LOW]: { kind: 'input', dir: 1 },
  [SORT_OPTIONS.INPUT_PRICE_HIGH]: { kind: 'input', dir: -1 },
  [SORT_OPTIONS.OUTPUT_PRICE_LOW]: { kind: 'output', dir: 1 },
  [SORT_OPTIONS.OUTPUT_PRICE_HIGH]: { kind: 'output', dir: -1 },
  [SORT_OPTIONS.REQUEST_PRICE_LOW]: { kind: 'request', dir: 1 },
  [SORT_OPTIONS.REQUEST_PRICE_HIGH]: { kind: 'request', dir: -1 },
}

/**
 * Base USD price shown on the model card: input/output per 1M tokens, request
 * per call (task models use their first usage example). Undefined when the
 * model has no price of that kind.
 */
function getSortPrice(
  model: PricingModel,
  kind: SortPriceKind,
  group?: string
): number | undefined {
  // Sort by the price the card actually displays (base price x group ratio)
  const ratio = getDisplayGroupRatio(model, group)
  const raw = getSortBasePrice(model, kind)
  return raw === undefined ? undefined : raw * ratio
}

function getSortBasePrice(
  model: PricingModel,
  kind: SortPriceKind
): number | undefined {
  if (kind === 'request') {
    const example = getCardExamplePrice(model, { tokenUnit: 'M' })
    if (example) return example.total
  }
  const summary = getDynamicPricingSummary(model, { tokenUnit: 'M' })
  if (kind === 'request') {
    if (summary) {
      return summary.entries.find(
        (entry) => entry.field === 'fixedPrice' || entry.field === 'modelPrice'
      )?.value
    }
    return isTokenBasedModel(model) ? undefined : model.model_price
  }
  if (summary) {
    const field = kind === 'input' ? 'inputPrice' : 'outputPrice'
    return summary.entries.find(
      (entry) => entry.field === field && entry.unit === 'token'
    )?.value
  }
  if (!isTokenBasedModel(model) || isUnconfiguredTaskUsageModel(model)) {
    return undefined
  }
  return calculateTokenPrice(model, kind, 1)
}

/**
 * Sort models by specified option
 */
export function sortModels(
  models: PricingModel[],
  sortBy: string,
  group?: string
): PricingModel[] {
  const sorted = [...models]

  const priceSort = PRICE_SORTS[sortBy as SortOption]
  if (priceSort) {
    // Extracting the price parses the billing expression, so compute once
    const price = new Map(
      sorted.map((m) => [m, getSortPrice(m, priceSort.kind, group)])
    )
    // Models without this kind of price stay last in both directions
    sorted.sort((a, b) => {
      const priceA = price.get(a)
      const priceB = price.get(b)
      if (priceA === undefined || priceB === undefined) {
        return Number(priceA === undefined) - Number(priceB === undefined)
      }
      return priceSort.dir * (priceA - priceB)
    })
    return sorted
  }

  switch (sortBy) {
    case SORT_OPTIONS.NAME:
      sorted.sort((a, b) =>
        (a.model_name || '').localeCompare(b.model_name || '')
      )
      break
  }

  return sorted
}

/**
 * Apply all filters and sorting to models
 */
export function filterAndSortModels(
  models: PricingModel[],
  filters: {
    search: string
    vendor: string[]
    group: string[]
    quotaType: string[]
    modelType: string[]
    inputType: string[]
    context: string[]
    priceTier: string[]
    sortBy: string
  }
): PricingModel[] {
  let result = filterBySearch(models, filters.search)
  result = filterByVendor(result, filters.vendor)
  result = filterByGroup(result, filters.group)
  result = filterByQuotaType(result, filters.quotaType)
  result = filterByModelType(result, filters.modelType)
  result = filterByInputType(result, filters.inputType)
  result = filterByContextRange(result, filters.context)
  result = filterByPriceTier(result, filters.priceTier)
  result = sortModels(result, filters.sortBy, filters.group[0])

  return result
}

/**
 * Parse tags from comma-separated string
 */
export function parseTags(tagsString?: string): string[] {
  if (!tagsString) return []
  return tagsString
    .split(/[,;|\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Extract all unique tags from models
 */
export function extractAllTags(models: PricingModel[]): string[] {
  const tagSet = new Set<string>()

  models.forEach((model) => {
    if (model.tags) {
      const tags = parseTags(model.tags)
      tags.forEach((tag) => {
        tagSet.add(tag.toLowerCase())
      })
    }
  })

  return [...tagSet].sort((a, b) => a.localeCompare(b))
}

/**
 * Filter models by tag
 */
export function filterByTag(
  models: PricingModel[],
  tag: string
): PricingModel[] {
  if (tag === FILTER_ALL) return models

  const tagLower = tag.toLowerCase()
  return models.filter((m) => {
    if (!m.tags) return false
    const modelTags = parseTags(m.tags).map((t) => t.toLowerCase())
    return modelTags.includes(tagLower)
  })
}
