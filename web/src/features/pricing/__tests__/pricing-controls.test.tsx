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
    viewMode: 'card',
    quotaTypeFilter: 'all',
    modelTypeFilter: 'all',
    inputTypeFilter: 'all',
    contextFilter: 'all',
    priceTierFilter: 'all',
    vendorFilter: 'all',
    groupFilter: 'all',
    onSortChange: vi.fn(),
    onTokenUnitChange: vi.fn(),
    onRechargePriceChange: vi.fn(),
    onViewModeChange: vi.fn(),
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

describe('pricing controls', () => {
  it('derives model types, input types, context buckets and price tiers from structured data', () => {
    const props = toolbarProps()
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
    const models: PricingModel[] = [
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

    expect(
      screen.getByRole('button', { name: /^All Vendors\s*3$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor A\s*2$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor B\s*1$/ })).toBeVisible()

    // `Text` / `Image` / `Video` labels exist in both the model-type and the
    // input-type section, so each count is asserted as "at least one chip".
    const chip = (name: RegExp) =>
      screen.getAllByRole('button', { name }).length
    expect(chip(/^Text\s*1$/)).toBeGreaterThan(0)
    expect(chip(/^Image\s*1$/)).toBeGreaterThan(0)
    expect(chip(/^Video\s*1$/)).toBeGreaterThan(0)
    expect(chip(/^Audio\s*0$/)).toBeGreaterThan(0)
    expect(chip(/^Embeddings\s*0$/)).toBe(1)
    expect(chip(/^Rerank\s*0$/)).toBe(1)
    expect(chip(/^Files\s*1$/)).toBe(1)

    // Context buckets.
    expect(
      screen.getByRole('button', { name: /^200K - 1M\s*1$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^≥ 1M\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^< 200K\s*1$/ })).toBeVisible()

    // Price tiers.
    expect(
      screen.getByRole('button', { name: /^Free of charge\s*1$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Paid\s*2$/ })).toBeVisible()

    expect(
      screen.getByRole('button', { name: /^Token-based\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Per Request\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Task billing\s*1$/ })
    ).toBeVisible()

    rerender(<PricingSidebar {...sidebarProps} models={[models[1]]} />)
    expect(
      screen.getByRole('button', { name: /^All Vendors\s*1$/ })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Vendor B\s*1$/ })
    ).toBeNull()
    expect(
      screen.getAllByRole('button', { name: /^Image\s*1$/ }).length
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /^Text\s*0$/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Free of charge\s*1$/ })
    ).toBeVisible()
  })

  it('switches to table view with the keyboard and exposes the selected view', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    const tableButton = screen.getByRole('button', { name: 'Table view' })
    tableButton.focus()
    await user.keyboard('{Enter}')
    expect(props.onViewModeChange).toHaveBeenCalledWith('table')
    rerender(<PricingToolbar {...props} viewMode='table' />)
    expect(tableButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
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
        groupFilter='premium'
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
