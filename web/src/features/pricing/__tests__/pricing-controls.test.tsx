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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PricingSidebar } from '../components/pricing-sidebar'
import { filterByQuotaType } from '../lib/filters'
import {
  PricingToolbar,
  type PricingToolbarProps,
} from '../components/pricing-toolbar'
import type { PricingModel } from '../types'

function toolbarProps(): PricingToolbarProps {
  return {
    filteredCount: 3,
    totalCount: 3,
    searchQuery: '',
    onSearchChange: vi.fn(),
    onSearchClear: vi.fn(),
    sortBy: 'name',
    tokenUnit: 'M',
    showRechargePrice: false,
      quotaTypeFilter: [],
    modelTypeFilter: [],
    inputTypeFilter: [],
    contextFilter: [],
    priceTierFilter: [],
    vendorFilter: [],
    groupFilter: [],
    onSortChange: vi.fn(),
    onTokenUnitChange: vi.fn(),
    onRechargePriceChange: vi.fn(),
      onQuotaTypeChange: vi.fn(),
    onModelTypeChange: vi.fn(),
    onInputTypeChange: vi.fn(),
    onContextChange: vi.fn(),
    onPriceTierChange: vi.fn(),
    onVendorChange: vi.fn(),
    onGroupChange: vi.fn(),
    vendors: [],
    groups: ['default', 'premium'],
    groupRatios: { default: 1, premium: 3 },
    models: [],
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: vi.fn(),
  }
}

/** Filter chips are buttons with aria-pressed; section titles are not. */
function chips(name: string | RegExp): HTMLElement[] {
  return screen
    .queryAllByRole('button', { name })
    .filter((button) => button.hasAttribute('aria-pressed'))
}

function chip(name: string | RegExp): HTMLElement {
  const matches = chips(name)
  if (matches.length !== 1) {
    throw new Error(`expected exactly one chip for ${name}, got ${matches.length}`)
  }
  return matches[0]
}

function sampleModels(): PricingModel[] {
  const base: PricingModel = {
    id: 1,
    model_name: 'text-model',
    vendor_name: 'Vendor A',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    capabilities: ['reasoning', 'tools'],
    input_modalities: ['text', 'image', 'file'],
    output_modalities: ['text'],
    context_length: 200_000,
    is_free: false,
    supported_endpoint_types: ['openai'],
  }
  return [
    base,
    {
      ...base,
      id: 2,
      model_name: 'image-model',
      quota_type: 1,
      capabilities: ['tools'],
      input_modalities: ['text'],
      output_modalities: ['image'],
      context_length: 1_000_000,
      is_free: true,
    },
    {
      ...base,
      id: 3,
      model_name: 'video-model',
      vendor_name: 'Vendor B',
      capabilities: [],
      input_modalities: ['text', 'video'],
      output_modalities: ['video'],
      context_length: 20_000,
      billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
    },
  ]
}

describe('pricing controls', () => {
  it('renders filter options without model counts', () => {
    const props = toolbarProps()
    const models = sampleModels()
    const sidebarProps = {
      ...props,
      vendors: [
        { id: 1, name: 'Vendor A' },
        { id: 2, name: 'Vendor B' },
      ],
    }
    const { rerender } = render(
      <PricingSidebar {...sidebarProps} models={models} />
    )

    // Chips show the label only; there is no "all" chip per section.
    expect(chips('All Vendors')).toHaveLength(0)
    expect(chips('All Models')).toHaveLength(0)
    expect(chips('All Groups')).toHaveLength(0)
    expect(chip('Vendor A').textContent).toBe('Vendor A')
    expect(chip('Vendor B').textContent).toBe('Vendor B')
    expect(chip('Files').textContent).toBe('Files')
    expect(chip('Embeddings').textContent).toBe('Embeddings')
    expect(chip('Rerank').textContent).toBe('Rerank')

    // `Text` / `Image` / `Video` / `Audio` exist in both sections, no counts.
    for (const label of ['Text', 'Image', 'Video', 'Audio']) {
      expect(chips(label).length).toBeGreaterThan(0)
      for (const element of chips(label)) {
        expect(element.textContent).toBe(label)
      }
    }

    expect(chip('< 200K').textContent).toBe('< 200K')
    expect(chip('200K - 1M').textContent).toBe('200K - 1M')
    expect(chip('≥ 1M').textContent).toBe('≥ 1M')
    expect(chip('Free of charge').textContent).toBe('Free of charge')
    expect(chip('Paid').textContent).toBe('Paid')
    expect(chip('Token-based').textContent).toBe('Token-based')
    expect(chip('Per Request').textContent).toBe('Per Request')
    expect(chip('Task billing').textContent).toBe('Task billing')

    // Group chips keep their ratio suffix (that is not a model count).
    expect(chip(/premium\s*x3/)).toBeVisible()

    // Zero-count vendors disappear from the option list.
    rerender(<PricingSidebar {...sidebarProps} models={[models[1]]} />)
    expect(chips('Vendor B')).toHaveLength(0)
    expect(chip('Vendor A')).toBeVisible()
  })

  it('keeps several options selected in the same section and highlights them green', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(
      <PricingSidebar {...props} models={[]} modelTypeFilter={[]} />
    )
    const embeddings = chip('Embeddings')
    const rerank = chip('Rerank')
    expect(embeddings).toHaveAttribute('aria-pressed', 'false')
    expect(rerank).toHaveAttribute('aria-pressed', 'false')

    await user.click(embeddings)
    expect(props.onModelTypeChange).toHaveBeenCalledWith('embedding')

    rerender(
      <PricingSidebar
        {...props}
        models={[]}
        modelTypeFilter={['embedding', 'rerank']}
      />
    )
    const activeEmbeddings = chip('Embeddings')
    const activeRerank = chip('Rerank')
    expect(activeEmbeddings).toHaveAttribute('aria-pressed', 'true')
    expect(activeRerank).toHaveAttribute('aria-pressed', 'true')
    expect(activeEmbeddings.className).toContain('emerald')
    for (const element of chips('Text')) {
      expect(element).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('shows a decorative card-view icon without any view switch control', () => {
    const props = toolbarProps()
    render(<PricingToolbar {...props} />)
    expect(
      screen.queryByRole('button', { name: 'Table view' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Card view' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'View mode' })).not.toBeInTheDocument()
  })

  it('selects price sorting from the shared dropdown', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Name' }))
    await user.click(
      screen.getByRole('menuitem', { name: 'Input Price: Low to High' })
    )
    expect(props.onSortChange).toHaveBeenCalledWith('input-price-low')
  })

  it('opens mobile filters from the left, selects a group, and restores focus on close', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filter' })
    expect(dialog).toHaveAttribute('data-side', 'left')
    expect(within(dialog).getByRole('button', { name: 'Reset' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: /premium/ }))
    expect(props.onGroupChange).toHaveBeenCalledWith('premium')
    rerender(
      <PricingToolbar
        {...props}
        groupFilter={['premium']}
        hasActiveFilters
        activeFilterCount={1}
      />
    )
    expect(
      within(dialog).getByRole('button', { name: /premium/ })
    ).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
    expect(props.onClearFilters).toHaveBeenCalledOnce()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', { name: /Filter/ })).toHaveFocus()
  })
})


describe('quota type classification (upstream #8010)', () => {
  const classificationCases: Array<{
    name: string
    pricing: Partial<PricingModel>
    matches: string[]
  }> = [
    { name: 'legacy token pricing', pricing: {}, matches: ['token'] },
    {
      name: 'legacy per-request pricing',
      pricing: { quota_type: 1, model_price: 0.01 },
      matches: ['request'],
    },
    {
      name: 'dynamic fixed pricing with a legacy token quota type',
      pricing: {
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("request", fixed(0.01))',
      },
      matches: ['request'],
    },
    {
      name: 'free dynamic per-request pricing',
      pricing: {
        billing_mode: 'tiered_expr',
        billing_expr: 'v1:tier("free", fixed(0))',
      },
      matches: ['request'],
    },
    {
      name: 'request-dependent fixed tiers with an extra multiplier',
      pricing: {
        billing_mode: 'tiered_expr',
        billing_expr:
          '(param("quality") == "hd" ? tier("hd", fixed(0.02)) : tier("base", fixed(0.01))) * (header("x-fast") == "true" ? 2 : 1)',
      },
      matches: ['request'],
    },
    {
      name: 'mixed pricing across nested time tiers classified only as token-based',
      pricing: {
        billing_mode: 'tiered_expr',
        billing_expr:
          'hour("UTC") < 12 ? (len < 1000 ? tier("short", fixed(0.01)) : tier("long", p * 2 + c * 8)) : tier("night", fixed(0.02))',
      },
      matches: ['token'],
    },
    {
      name: 'mixed pricing overriding a legacy request quota type',
      pricing: {
        quota_type: 1,
        billing_mode: 'tiered_expr',
        billing_expr:
          'len < 1000 ? tier("short", fixed(0.01)) : tier("long", p * 2 + c * 8)',
      },
      matches: ['token'],
    },
    {
      name: 'dynamic token pricing overriding a legacy request quota type',
      pricing: {
        quota_type: 1,
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", p * 2 + c * 8)',
      },
      matches: ['token'],
    },
    {
      name: 'token pricing with fixed syntax only in its tier label',
      pricing: {
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("fixed(0.01)", p * 2)',
      },
      matches: ['token'],
    },
    {
      name: 'task usage retaining its separate category',
      pricing: {
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", u("seconds") * 0.4)',
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      },
      matches: ['task'],
    },
    {
      name: 'unparseable dynamic pricing retaining its legacy category',
      pricing: {
        quota_type: 1,
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("request", fixed(',
      },
      matches: ['request'],
    },
  ]

  it.each(classificationCases)('classifies $name', ({ pricing, matches }) => {
    const model: PricingModel = {
      id: 1,
      model_name: 'pricing-model',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      ...pricing,
    }
    const models = [model]
    expect(filterByQuotaType(models, ['all'])).toEqual([model])
    for (const quotaType of ['token', 'request', 'task']) {
      expect(filterByQuotaType(models, [quotaType])).toEqual(
        matches.includes(quotaType) ? [model] : []
      )
    }
  })
})
