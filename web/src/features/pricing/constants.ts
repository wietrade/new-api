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
import { type TFunction } from 'i18next'

import type { TokenUnit } from './types'

// ----------------------------------------------------------------------------
// Pricing Constants
// ----------------------------------------------------------------------------

/** Sort options for pricing models */
export const SORT_OPTIONS = {
  NAME: 'name',
  INPUT_PRICE_LOW: 'input-price-low',
  INPUT_PRICE_HIGH: 'input-price-high',
  OUTPUT_PRICE_LOW: 'output-price-low',
  OUTPUT_PRICE_HIGH: 'output-price-high',
  REQUEST_PRICE_LOW: 'request-price-low',
  REQUEST_PRICE_HIGH: 'request-price-high',
} as const

export type SortOption = (typeof SORT_OPTIONS)[keyof typeof SORT_OPTIONS]

export function getSortLabels(t: TFunction): Record<SortOption, string> {
  return {
    [SORT_OPTIONS.NAME]: t('Name'),
    [SORT_OPTIONS.INPUT_PRICE_LOW]: t('Input Price: Low to High'),
    [SORT_OPTIONS.INPUT_PRICE_HIGH]: t('Input Price: High to Low'),
    [SORT_OPTIONS.OUTPUT_PRICE_LOW]: t('Output Price: Low to High'),
    [SORT_OPTIONS.OUTPUT_PRICE_HIGH]: t('Output Price: High to Low'),
    [SORT_OPTIONS.REQUEST_PRICE_LOW]: t('Per-request Price: Low to High'),
    [SORT_OPTIONS.REQUEST_PRICE_HIGH]: t('Per-request Price: High to Low'),
  }
}

/** Filter values */
export const FILTER_ALL = 'all'

/** Quota type options */
export const QUOTA_TYPES = {
  ALL: 'all',
  TOKEN: 'token',
  REQUEST: 'request',
  TASK: 'task',
} as const

export type QuotaTypeOption = (typeof QUOTA_TYPES)[keyof typeof QUOTA_TYPES]

/** Quota type labels */
export function getQuotaTypeLabels(
  t: TFunction
): Record<QuotaTypeOption, string> {
  return {
    [QUOTA_TYPES.ALL]: t('All Models'),
    [QUOTA_TYPES.TOKEN]: t('Token-based'),
    [QUOTA_TYPES.REQUEST]: t('Per Request'),
    [QUOTA_TYPES.TASK]: t('Task billing'),
  }
}

/** Endpoint type options */
export const ENDPOINT_TYPES = {
  ALL: 'all',
  OPENAI: 'openai',
  OPENAI_RESPONSE: 'openai-response',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  JINA_RERANK: 'jina-rerank',
  IMAGE_GENERATION: 'image-generation',
  EMBEDDINGS: 'embeddings',
  OPENAI_VIDEO: 'openai-video',
} as const

export type EndpointTypeOption =
  (typeof ENDPOINT_TYPES)[keyof typeof ENDPOINT_TYPES]

/** Endpoint type labels */
export function getEndpointTypeLabels(
  t: TFunction
): Record<EndpointTypeOption, string> {
  return {
    [ENDPOINT_TYPES.ALL]: t('All Types'),
    [ENDPOINT_TYPES.OPENAI]: 'Chat',
    [ENDPOINT_TYPES.OPENAI_RESPONSE]: 'Response',
    [ENDPOINT_TYPES.ANTHROPIC]: 'Anthropic',
    [ENDPOINT_TYPES.GEMINI]: 'Gemini',
    [ENDPOINT_TYPES.JINA_RERANK]: 'Rerank',
    [ENDPOINT_TYPES.IMAGE_GENERATION]: t('Image'),
    [ENDPOINT_TYPES.EMBEDDINGS]: t('Embeddings'),
    [ENDPOINT_TYPES.OPENAI_VIDEO]: t('Video'),
  }
}

/** Filter section keys */
export const FILTER_SECTIONS = {
  PRICING_TYPE: 'pricingType',
  CAPABILITY: 'capability',
  CONTEXT: 'context',
  VENDOR: 'vendor',
  GROUP: 'group',
} as const

/** Structured model capabilities (closed set; mirrors the backend vocabulary). */
export const MODEL_CAPABILITIES = {
  CHAT: 'chat',
  REASONING: 'reasoning',
  TOOLS: 'tools',
  VISION: 'vision',
  FILES: 'files',
  AUDIO: 'audio',
  IMAGE_GENERATION: 'image_generation',
  VIDEO_GENERATION: 'video_generation',
  EMBEDDING: 'embedding',
  RERANK: 'rerank',
  WEB_SEARCH: 'web_search',
  CODE_INTERPRETER: 'code_interpreter',
} as const

export type ModelCapabilityKey =
  (typeof MODEL_CAPABILITIES)[keyof typeof MODEL_CAPABILITIES]

/** Stable display order for capability chips and filters. */
export const MODEL_CAPABILITY_ORDER: ModelCapabilityKey[] = [
  MODEL_CAPABILITIES.CHAT,
  MODEL_CAPABILITIES.REASONING,
  MODEL_CAPABILITIES.TOOLS,
  MODEL_CAPABILITIES.VISION,
  MODEL_CAPABILITIES.FILES,
  MODEL_CAPABILITIES.IMAGE_GENERATION,
  MODEL_CAPABILITIES.VIDEO_GENERATION,
  MODEL_CAPABILITIES.EMBEDDING,
  MODEL_CAPABILITIES.RERANK,
  MODEL_CAPABILITIES.AUDIO,
  MODEL_CAPABILITIES.WEB_SEARCH,
  MODEL_CAPABILITIES.CODE_INTERPRETER,
]

const CAPABILITY_LABEL_KEYS: Record<ModelCapabilityKey, string> = {
  [MODEL_CAPABILITIES.CHAT]: 'Chat',
  [MODEL_CAPABILITIES.REASONING]: 'Reasoning',
  [MODEL_CAPABILITIES.TOOLS]: 'Tools',
  [MODEL_CAPABILITIES.VISION]: 'Vision',
  [MODEL_CAPABILITIES.FILES]: 'Files',
  [MODEL_CAPABILITIES.AUDIO]: 'Audio',
  [MODEL_CAPABILITIES.IMAGE_GENERATION]: 'Image Generation',
  [MODEL_CAPABILITIES.VIDEO_GENERATION]: 'Video Generation',
  [MODEL_CAPABILITIES.EMBEDDING]: 'Embeddings',
  [MODEL_CAPABILITIES.RERANK]: 'Rerank',
  [MODEL_CAPABILITIES.WEB_SEARCH]: 'Web Search',
  [MODEL_CAPABILITIES.CODE_INTERPRETER]: 'Code Interpreter',
}

/** Localized label for a capability key; unknown keys pass through unchanged. */
export function getCapabilityLabel(t: TFunction, key: string): string {
  const labelKey = CAPABILITY_LABEL_KEYS[key as ModelCapabilityKey]
  return labelKey ? t(labelKey) : key
}

/** Context window buckets. Upper bounds are exclusive. */
export const CONTEXT_RANGES = {
  ALL: 'all',
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
} as const

export type ContextRange = (typeof CONTEXT_RANGES)[keyof typeof CONTEXT_RANGES]

export const CONTEXT_RANGE_ORDER: Exclude<ContextRange, 'all'>[] = [
  CONTEXT_RANGES.SMALL,
  CONTEXT_RANGES.MEDIUM,
  CONTEXT_RANGES.LARGE,
]

export const CONTEXT_RANGE_BOUNDS: Record<
  Exclude<ContextRange, 'all'>,
  { min: number; max: number }
> = {
  [CONTEXT_RANGES.SMALL]: { min: 0, max: 200_000 },
  [CONTEXT_RANGES.MEDIUM]: { min: 200_000, max: 1_000_000 },
  [CONTEXT_RANGES.LARGE]: { min: 1_000_000, max: Number.POSITIVE_INFINITY },
}

export function getContextRangeLabels(
  t: TFunction
): Record<ContextRange, string> {
  return {
    [CONTEXT_RANGES.ALL]: t('All Context Lengths'),
    [CONTEXT_RANGES.SMALL]: t('< 200K'),
    [CONTEXT_RANGES.MEDIUM]: t('200K - 1M'),
    [CONTEXT_RANGES.LARGE]: t('≥ 1M'),
  }
}

/** Formats a token count as 200K / 1M / 1.1M for compact display. */
export function formatContextLength(tokens?: number | null): string | undefined {
  if (!tokens || tokens <= 0) return undefined
  const format = (value: number, suffix: string) => {
    const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
    return `${rounded}${suffix}`
  }
  if (tokens >= 1_000_000) return format(tokens / 1_000_000, 'M')
  if (tokens >= 1_000) return format(tokens / 1_000, 'K')
  return String(tokens)
}

/** Maximum number of tags to display in model row */
export const MAX_TAGS_DISPLAY = 5

/** Maximum number of filter items to display before showing "More..." */
export const MAX_FILTER_ITEMS = 5

/** Sidebar width */
export const SIDEBAR_WIDTH = 'w-64'

/** Excluded groups */
export const EXCLUDED_GROUPS = ['', 'auto']

/** Quota type values */
export const QUOTA_TYPE_VALUES = {
  TOKEN: 0,
  REQUEST: 1,
} as const

/** Token unit divisors */
export const TOKEN_UNIT_DIVISORS = {
  M: 1,
  K: 1000,
} as const

/** Default token unit for pricing display */
export const DEFAULT_TOKEN_UNIT: TokenUnit = 'M'

/** View mode options */
export const VIEW_MODES = {
  CARD: 'card',
  TABLE: 'table',
} as const

export type ViewMode = (typeof VIEW_MODES)[keyof typeof VIEW_MODES]

/** Default page size for pricing table */
export const DEFAULT_PRICING_PAGE_SIZE = 20
