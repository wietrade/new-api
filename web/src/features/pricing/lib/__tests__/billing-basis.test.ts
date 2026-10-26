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
import { describe, expect, test } from 'vitest'

import type { PricingModel } from '../../types'
import {
  getBillingBasisBadgeLabelKey,
  getModelBillingBasis,
  summarizeFixedUnitPricing,
} from '../billing-basis'
import { getDynamicPricingSummary } from '../dynamic-price'

function model(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'pricing-model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

describe('getModelBillingBasis', () => {
  test('token expressions stay token-based', () => {
    const basis = getModelBillingBasis(
      model({
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("standard", p * 2 + c * 8 + cr * 0.2)',
      })
    )
    expect(basis).toBe('token')
  })

  test('image_count marks image billing', () => {
    const basis = getModelBillingBasis(
      model({
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("image", fixed(0.017647)) * image_count',
      })
    )
    expect(basis).toBe('image')
  })

  test('usage fields drive the metering unit', () => {
    const basis = getModelBillingBasis(
      model({
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", u("seconds") * 0.4)',
      })
    )
    expect(basis).toBe('second')
  })

  test('fixed-only pricing is per request', () => {
    const basis = getModelBillingBasis(
      model({
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("request", fixed(0.01))',
      })
    )
    expect(basis).toBe('request')
  })

  test('usage schema wins over the expression', () => {
    const basis = getModelBillingBasis(
      model({
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", u("credits") * 1)',
        billing_usage_schema: {
          credits: { type: 'number', unit: 'credit' },
        },
      })
    )
    expect(basis).toBe('credit')
  })

  test('badge keys name the basis', () => {
    expect(getBillingBasisBadgeLabelKey('image')).toBe('Billed per image')
    expect(getBillingBasisBadgeLabelKey('second')).toBe('Billed per second')
    expect(getBillingBasisBadgeLabelKey('video')).toBe('Billed per video')
    expect(getBillingBasisBadgeLabelKey('request')).toBe('Per Request')
  })
})

describe('summarizeFixedUnitPricing', () => {
  test('collapses size-conditioned image prices into a range', () => {
    const summary = summarizeFixedUnitPricing(
      model({
        billing_mode: 'tiered_expr',
        billing_expr:
          'param("size") == "1024x1024" ? tier("image_2", fixed(0.073529)) * image_count : tier("image", fixed(0.101103)) * image_count',
      })
    )
    expect(summary).toEqual({
      basis: 'image',
      min: 0.073529,
      max: 0.101103,
    })
  })

  test('refuses token pricing', () => {
    expect(
      summarizeFixedUnitPricing(
        model({
          billing_mode: 'tiered_expr',
          billing_expr: 'len <= 1000 ? tier("a", fixed(0.01)) : tier("b", p * 2)',
        })
      )
    ).toBeNull()
  })

  test('reads u(field) coefficients as per-unit prices', () => {
    expect(
      summarizeFixedUnitPricing(
        model({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", u("seconds") * 0.4)',
        })
      )
    ).toEqual({ basis: 'second', min: 0.4, max: 0.4 })
    expect(
      summarizeFixedUnitPricing(
        model({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("images", u("images") * 0.25)',
        })
      )
    ).toEqual({ basis: 'image', min: 0.25, max: 0.25 })
  })

  test('applies request multipliers to the per-image price', () => {
    // 引擎只允许 tier(...) 乘以 image_count 或请求级倍率
    expect(
      summarizeFixedUnitPricing(
        model({
          billing_mode: 'tiered_expr',
          billing_expr:
            'tier("image", fixed(0.02)) * (header("x-fast") == "true" ? 2 : 1) * image_count',
        })
      )
    ).toEqual({ basis: 'image', min: 0.02, max: 0.04 })
  })

  test('plain fixed pricing is per request', () => {
    expect(
      summarizeFixedUnitPricing(
        model({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("request", fixed(0.01))',
        })
      )
    ).toEqual({ basis: 'request', min: 0.01, max: 0.01 })
  })

  test('renders the size-conditioned image price as a per-image range', () => {
    const summary = getDynamicPricingSummary(
      model({
        billing_mode: 'tiered_expr',
        billing_expr:
          'param("size") == "1024x1024" ? tier("image_2", fixed(0.073529)) * image_count : tier("image", fixed(0.101103)) * image_count',
      }),
      { tokenUnit: 'M' }
    )
    expect(summary).not.toBeNull()
    expect(summary?.isSpecialExpression).toBe(false)
    expect(summary?.rawExpression).toContain('image_count')
    expect(summary?.primaryEntries).toHaveLength(1)
    const entry = summary?.primaryEntries[0]
    expect(entry?.unit).toBe('image')
    expect(entry?.shortLabel).toBe('Per image')
    // 只展示最低档单价，区间留在 maxValue 里
    expect(entry?.formatted).toMatch(/0\.0735/)
    expect(entry?.maxValue).toBe(0.101103)
  })
})
