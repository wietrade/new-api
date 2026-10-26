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

type PriceInterval = { min: number; max: number }

/**
 * 把表达式按「1 张图 / 1 个单位用量」求值，得到单价区间。
 *
 * `fixed(0.07) * image_count` 在语义上就是「每张 0.07」——把 image_count 取 1
 * 即可得到单价；`* 2` 这种系数会自然乘进去，`u("seconds") * 0.4` 则是每秒 0.4。
 * 条件（param/header/len/时段）不参与求值，各分支的单价取并集得到区间。
 */
function evaluatePriceInterval(
  node: ExpressionNode,
  ctx: { usageBasis?: BillingBasis }
): PriceInterval | null {
  switch (node.kind) {
    case 'literal':
      return typeof node.value === 'number'
        ? { min: node.value, max: node.value }
        : null
    case 'variable':
      // image_count 就是「按张」的用量变量，按 1 张折算单价
      if (node.name === 'image_count') return { min: 1, max: 1 }
      return null
    case 'unary': {
      const value = evaluatePriceInterval(node.operand, ctx)
      if (!value) return null
      if (node.operator === '-') return { min: -value.max, max: -value.min }
      if (node.operator === '+') return value
      return null
    }
    case 'call': {
      if (node.name === 'tier') {
        return node.args.length === 2
          ? evaluatePriceInterval(node.args[1], ctx)
          : null
      }
      if (node.name === 'fixed') {
        return node.args.length === 1
          ? evaluatePriceInterval(node.args[0], ctx)
          : null
      }
      if (node.name === 'u') {
        const field = literalString(node.args[0])
        const basis = field ? normalizeUsageField(field) : null
        if (!basis || basis === 'token') return null
        if (ctx.usageBasis && ctx.usageBasis !== basis) return null
        ctx.usageBasis = basis
        return { min: 1, max: 1 }
      }
      if (node.name === 'min' || node.name === 'max') {
        const values = node.args.map((arg) => evaluatePriceInterval(arg, ctx))
        if (values.some((value) => value === null)) return null
        const list = values as PriceInterval[]
        if (node.name === 'min') {
          return {
            min: Math.min(...list.map((v) => v.min)),
            max: Math.min(...list.map((v) => v.max)),
          }
        }
        return {
          min: Math.max(...list.map((v) => v.min)),
          max: Math.max(...list.map((v) => v.max)),
        }
      }
      if (node.name === 'abs') {
        const value = evaluatePriceInterval(node.args[0], ctx)
        if (!value) return null
        const candidates = [Math.abs(value.min), Math.abs(value.max)]
        return { min: Math.min(...candidates), max: Math.max(...candidates) }
      }
      // param/header/has/hour/... 只用于条件，不参与单价
      return null
    }
    case 'binary': {
      const left = evaluatePriceInterval(node.left, ctx)
      const right = evaluatePriceInterval(node.right, ctx)
      if (!left || !right) return null
      if (node.operator === '+') {
        return { min: left.min + right.min, max: left.max + right.max }
      }
      if (node.operator === '-') {
        return { min: left.min - right.max, max: left.max - right.min }
      }
      if (node.operator === '*') {
        const products = [
          left.min * right.min,
          left.min * right.max,
          left.max * right.min,
          left.max * right.max,
        ]
        return { min: Math.min(...products), max: Math.max(...products) }
      }
      return null
    }
    case 'conditional': {
      // 条件本身不能当单价求值；两个分支都必须能算出单价
      if (evaluatePriceInterval(node.condition, {}) !== null) return null
      const yes = evaluatePriceInterval(node.yes, ctx)
      const no = evaluatePriceInterval(node.no, ctx)
      if (!yes || !no) return null
      return { min: Math.min(yes.min, no.min), max: Math.max(yes.max, no.max) }
    }
  }
}

/**
 * 解析器认不出来的「按单位计价」表达式（典型：按 size 分支的图片价、
 * 按秒计费的任务价），退化成「每单位多少钱」。算不出单价时返回 null。
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

  const ctx: { usageBasis?: BillingBasis } = {}
  const interval = evaluatePriceInterval(compiled.ast, ctx)
  if (!interval || !Number.isFinite(interval.min) || interval.min < 0) {
    return null
  }

  const basis: FixedUnitPricing['basis'] =
    ctx.usageBasis && ctx.usageBasis !== 'token'
      ? ctx.usageBasis
      : compiled.variables.has('image_count')
        ? 'image'
        : 'request'
  return { basis, min: interval.min, max: interval.max }
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
