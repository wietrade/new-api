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

// ----------------------------------------------------------------------------
// Billing direction (输入侧 / 输出侧)
//
// 同一个计量单位既可能算输入也可能算输出：输入 token、输入图片、输入音频
// 都是输入侧；生成出来的 token / 图片 / 视频 / 音频时长算输出侧。
// 模型广场据此给单价打上「输入 · / 输出 ·」前缀。
// ----------------------------------------------------------------------------

export type BillingDirection = 'input' | 'output'

/** billing_expr 里按输入侧计量的 token 类变量。 */
const INPUT_VARIABLES = new Set([
  'p',
  'cr',
  'cc',
  'cc1h',
  'cc12h',
  'img',
  'img_cr',
  'ai',
])

/** billing_expr 里按输出侧计量的 token 类变量。 */
const OUTPUT_VARIABLES = new Set(['c', 'ao', 'img_o'])

export function variableDirection(
  variable: string
): BillingDirection | undefined {
  if (INPUT_VARIABLES.has(variable)) return 'input'
  if (OUTPUT_VARIABLES.has(variable)) return 'output'
  return undefined
}

/**
 * 用量字段 → 计量方向。优先看显式前缀（input_/prompt_/output_/…），
 * 其次把生成类产物（图片、视频、音频、时长）当作输出侧。
 */
export function usageFieldDirection(
  field: string
): BillingDirection | undefined {
  const name = field.trim().toLowerCase()
  if (!name) return undefined
  if (/^(input|prompt|in)[_-]/.test(name) || name === 'input_tokens') {
    return 'input'
  }
  if (
    /^(output|completion|generated|out)[_-]/.test(name) ||
    name === 'output_tokens'
  ) {
    return 'output'
  }
  if (/^output/.test(name)) return 'output'
  if (/(image|video|audio|second|clip|frame|duration)/.test(name)) {
    return 'output'
  }
  return undefined
}

/** i18n key for the direction prefix, or null when it is not meaningful. */
export function getEntryDirectionLabelKey(
  direction: BillingDirection | undefined
): string | null {
  if (direction === 'input') return 'Input'
  if (direction === 'output') return 'Output'
  return null
}

/** 标签本身就是「输入/输出」时不再重复打方向徽标。 */
export function isDirectionLabel(label: string | undefined): boolean {
  return label === 'Input' || label === 'Output'
}
