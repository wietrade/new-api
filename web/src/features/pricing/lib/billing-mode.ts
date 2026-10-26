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
import { getBillingBasisBadgeLabelKey, getModelBillingBasis } from './billing-basis'
import { hasTaskUsageSchema, isDynamicPricingModel } from './dynamic-price'
import { isTokenBasedModel } from './model-helpers'

export type BillingModeLabelKey =
  | 'Per Request'
  | 'Dynamic Pricing'
  | 'Token-based'
  | 'Task billing'
  | 'Billed per image'
  | 'Billed per second'
  | 'Billed per video'
  | 'Billed per credit'

export function getBillingModeLabelKey(
  model: PricingModel
): BillingModeLabelKey {
  // 非 token 计费的模型直接标明口径（按图片 / 按时间 / 按视频 / 按次），
  // 而不是统一徽标成「动态计费」。
  const basis = getModelBillingBasis(model)
  if (basis !== 'token') {
    return getBillingBasisBadgeLabelKey(basis) as BillingModeLabelKey
  }
  // Task-usage models badge as one business category; the metering unit
  // ($/1M token, $/credit, $/second) is already carried by the price line.
  if (hasTaskUsageSchema(model)) return 'Task billing'
  if (isDynamicPricingModel(model)) return 'Dynamic Pricing'
  if (isTokenBasedModel(model)) return 'Token-based'
  return 'Per Request'
}
