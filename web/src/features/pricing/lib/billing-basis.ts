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
import type { PricingModel } from '../types'
import { compileBillingExpression } from './billing-expression/parser'
import type { ExpressionNode } from './billing-expression/types'
import { QUOTA_TYPE_VALUES } from '../constants'

// ----------------------------------------------------------------------------
// Billing basis (计费口径)
//
// 模型广场除了按 token 计费，还有按图片 / 按时长 / 按视频 / 按次等口径。
// 这里把「模型到底按什么计量」收敛成一个枚举，供徽标、单价后缀与
// 表达式兜底展示共用。
// ----------------------------------------------------------------------------

export type BillingBasis =
  | 'token'
  | 'image'
  | 'second'
  | 'video'
  | 'audio'
  | 'text'
  | 'count'
  | 'credit'
  | 'request'

export type { BillingDirection } from './billing-direction'
export { getEntryDirectionLabelKey, usageFieldDirection } from './billing-direction'

/** 只要出现这些变量，就说明用量本身是按 token 计的。 */
const TOKEN_VARIABLES = new Set([
  'p',
  'c',
  'cr',
  'cc',
  'cc1h',
  'cc12h',
  'img',
  'img_cr',
  'img_o',
  'ai',
  'ao',
])

/** `u("...")` 的字段名 → 计费口径。 */
const USAGE_FIELD_BASIS: Readonly<Record<string, BillingBasis>> = {
  second: 'second',
  seconds: 'second',
  duration: 'second',
  duration_seconds: 'second',
  video_seconds: 'second',
  video: 'video',
  videos: 'video',
  video_count: 'video',
  clips: 'video',
  image: 'image',
  images: 'image',
  image_count: 'image',
  pictures: 'image',
  audio: 'audio',
  audios: 'audio',
  audio_count: 'audio',
  clips_audio: 'audio',
  text: 'text',
  texts: 'text',
  text_count: 'text',
  count: 'count',
  counts: 'count',
  units: 'count',
  credit: 'credit',
  credits: 'credit',
}

function normalizeUsageField(name: string): BillingBasis | null {
  return USAGE_FIELD_BASIS[name.trim().toLowerCase()] ?? null
}

function firstSchemaUnit(model: PricingModel): BillingBasis | null {
  const schema = model.billing_usage_schema
  if (!schema) return null
  for (const [field, definition] of Object.entries(schema)) {
    if (!definition || definition.type === 'boolean') continue
    const unit = definition.unit
    if (unit === 'second') return 'second'
    if (unit === 'credit') return 'credit'
    if (unit === 'token') return 'token'
    // `count` 只说明“按个”，具体是图/视频/次要看字段名（images、clips…）。
    if (unit === 'count') return normalizeUsageField(field) ?? 'count'
    const named = normalizeUsageField(field)
    if (named) return named
  }
  return null
}

function literalString(node: ExpressionNode): string | null {
  return node.kind === 'literal' && typeof node.value === 'string'
    ? node.value
    : null
}

/**
 * 计费口径。优先看用量 schema（任务型模型），其次解析计费表达式，
 * 最后回落到旧的 quota_type。
 */
export function getModelBillingBasis(model: PricingModel): BillingBasis {
  const variant = model.billing_plugin_variants?.find((item) => item.billing_expr)
  if (variant) {
    return getModelBillingBasis({
      ...model,
      billing_plugin_variants: undefined,
      billing_mode: variant.billing_mode ?? 'tiered_expr',
      billing_expr: variant.billing_expr,
      billing_usage_schema: variant.billing_usage_schema ?? model.billing_usage_schema,
    })
  }

  const schemaBasis = firstSchemaUnit(model)
  if (schemaBasis) return schemaBasis

  if (model.billing_mode === 'tiered_expr' && model.billing_expr) {
    const compiled = compileBillingExpression(model.billing_expr)
    if (compiled.status === 'ready') {
      for (const variable of compiled.variables) {
        if (TOKEN_VARIABLES.has(variable)) return 'token'
      }
      if (compiled.variables.has('image_count')) return 'image'
      if (compiled.functions.has('u')) {
        const basis = usageBasisFromExpression(compiled.ast)
        if (basis) return basis
      }
      if (compiled.functions.has('fixed')) return 'request'
      return 'token'
    }
  }

  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) return 'request'
  return 'token'
}

function usageBasisFromExpression(node: ExpressionNode): BillingBasis | null {
  if (node.kind === 'call') {
    if (node.name === 'u') {
      const field = literalString(node.args[0])
      const basis = field ? normalizeUsageField(field) : null
      if (basis) return basis
    }
    for (const arg of node.args) {
      const nested = usageBasisFromExpression(arg)
      if (nested) return nested
    }
    return null
  }
  if (node.kind === 'binary') {
    return (
      usageBasisFromExpression(node.left) ??
      usageBasisFromExpression(node.right)
    )
  }
  if (node.kind === 'unary') return usageBasisFromExpression(node.operand)
  if (node.kind === 'conditional') {
    return (
      usageBasisFromExpression(node.condition) ??
      usageBasisFromExpression(node.yes) ??
      usageBasisFromExpression(node.no)
    )
  }
  return null
}

export type FixedUnitPricing = {
  basis: Exclude<BillingBasis, 'token'>
  min: number
  max: number
}

/** 条件里只允许这些函数出现，它们不改变单价，只筛选用量。 */
const CONDITION_FUNCTIONS = new Set([
  'param',
  'header',
  'has',
  'hour',
  'minute',
  'weekday',
  'month',
  'day',
])

const COMPARISON_OPERATORS = new Set([
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
])

function isImageCount(node: ExpressionNode): boolean {
  return node.kind === 'variable' && node.name === 'image_count'
}

function numericLiteral(node: ExpressionNode): number | null {
  return node.kind === 'literal' && typeof node.value === 'number'
    ? node.value
    : null
}

/** 条件子树：只允许比较、逻辑与筛选函数，不允许出现单价。 */
function safeCondition(node: ExpressionNode): boolean {
  switch (node.kind) {
    case 'literal':
      return true
    case 'variable':
      return node.name === 'len' || node.name === 'image_count'
    case 'unary':
      return safeCondition(node.operand)
    case 'call':
      return (
        CONDITION_FUNCTIONS.has(node.name) &&
        node.args.every((arg) => safeCondition(arg))
      )
    case 'binary':
      return safeCondition(node.left) && safeCondition(node.right)
    case 'conditional':
      return (
        safeCondition(node.condition) &&
        safeCondition(node.yes) &&
        safeCondition(node.no)
      )
  }
}

/**
 * 收集「每单位固定价」的单价集合。
 *
 * 只接受形如 `tier(name, fixed(0.01))` 或 `tier(name, fixed(0.01)) * image_count`
 * 的结构：任何乘数都必须显式是 image_count，其余算术一律放弃，
 * 免得把 `fixed(0.02) * 2` 之类的表达式报成 0.02。
 */
function collectUnitPrices(
  node: ExpressionNode,
  inCondition: boolean,
  out: number[]
): boolean {
  switch (node.kind) {
    case 'literal':
      return inCondition || numericLiteral(node) !== null
    case 'variable':
      return node.name === 'image_count' || (inCondition && node.name === 'len')
    case 'unary':
      return !inCondition && collectUnitPrices(node.operand, false, out)
    case 'call': {
      if (inCondition) return safeCondition(node)
      if (node.name === 'tier') {
        if (node.args.length !== 2) return false
        const price = node.args[1]
        if (price.kind !== 'call' || price.name !== 'fixed') return false
        const value = numericLiteral(price.args[0])
        if (value === null || value < 0) return false
        out.push(value)
        return true
      }
      if (node.name === 'fixed') {
        const value = numericLiteral(node.args[0])
        if (value === null || value < 0) return false
        out.push(value)
        return true
      }
      return false
    }
    case 'binary': {
      const op = node.operator
      if (COMPARISON_OPERATORS.has(op)) {
        return safeCondition(node.left) && safeCondition(node.right)
      }
      if (op === '*') {
        if (isImageCount(node.left)) {
          return collectUnitPrices(node.right, false, out)
        }
        if (isImageCount(node.right)) {
          return collectUnitPrices(node.left, false, out)
        }
        return false
      }
      if (op === '+' || op === '-') {
        return (
          collectUnitPrices(node.left, false, out) &&
          collectUnitPrices(node.right, false, out)
        )
      }
      return false
    }
    case 'conditional':
      return (
        safeCondition(node.condition) &&
        collectUnitPrices(node.yes, false, out) &&
        collectUnitPrices(node.no, false, out)
      )
  }
}

/**
 * 解析器认不出来的「按单位固定价」表达式（典型：按 size 分支的图片价），
 * 退化成「每单位多少钱」的区间展示。无法保证正确时返回 null，
 * 调用方继续展示原始表达式。
 */
export function summarizeFixedUnitPricing(
  model: PricingModel
): FixedUnitPricing | null {
  if (model.billing_plugin_variants?.length) return null
  if (model.billing_mode !== 'tiered_expr') return null
  const expression = (model.billing_expr || '').trim()
  if (!expression) return null
  const compiled = compileBillingExpression(expression)
  if (compiled.status !== 'ready') return null
  for (const variable of compiled.variables) {
    if (TOKEN_VARIABLES.has(variable)) return null
  }
  // u(...) 计价的用量字段靠 schema 描述，这里不猜。
  if (compiled.functions.has('u')) return null

  const prices: number[] = []
  if (!collectUnitPrices(compiled.ast, false, prices)) return null
  if (prices.length === 0) return null

  const basis: FixedUnitPricing['basis'] = compiled.variables.has('image_count')
    ? 'image'
    : 'request'
  return {
    basis,
    min: Math.min(...prices),
    max: Math.max(...prices),
  }
}

/** 单价后缀 / 条目标签，负责把口径翻译成 i18n key。 */
export function billingBasisEntryLabels(basis: BillingBasis): {
  label: string
  shortLabel: string
  unit:
    | 'token'
    | 'request'
    | 'image'
    | 'second'
    | 'video'
    | 'audio'
    | 'text'
    | 'count'
    | 'credit'
} {
  switch (basis) {
    case 'image':
      return { label: 'Price per image', shortLabel: 'Per image', unit: 'image' }
    case 'second':
      return { label: 'Price per second', shortLabel: 'Per second', unit: 'second' }
    case 'video':
      return { label: 'Price per video', shortLabel: 'Per video', unit: 'video' }
    case 'audio':
      return { label: 'Price per audio', shortLabel: 'Per audio', unit: 'audio' }
    case 'text':
      return { label: 'Price per text', shortLabel: 'Per text', unit: 'text' }
    case 'credit':
      return { label: 'Price per credit', shortLabel: 'Per credit', unit: 'credit' }
    case 'count':
      return { label: 'Price per unit', shortLabel: 'Per unit', unit: 'count' }
    case 'request':
      return { label: 'Price per request', shortLabel: 'Per-call', unit: 'request' }
    case 'token':
      return { label: 'Per 1M tokens', shortLabel: 'Per 1M tokens', unit: 'token' }
  }
}

/** 计费口径徽标（模型卡片 / 详情页顶部）。 */
export function getBillingBasisBadgeLabelKey(basis: BillingBasis): string {
  switch (basis) {
    case 'image':
      return 'Billed per image'
    case 'second':
      return 'Billed per second'
    case 'video':
      return 'Billed per video'
    case 'audio':
    case 'text':
      return 'Billed per unit'
    case 'credit':
      return 'Billed per credit'
    case 'request':
      return 'Per Request'
    case 'count':
      return 'Per Request'
    case 'token':
      return 'Token-based'
  }
}
