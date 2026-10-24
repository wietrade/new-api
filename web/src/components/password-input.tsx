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
import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

import { Button } from './ui/button'
import { Input } from './ui/input'

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> & {
  ref?: React.Ref<HTMLInputElement>
  /** Extra classes for the inner input (the wrapper keeps `className`). */
  inputClassName?: string
  /** Extra classes for the show/hide button. */
  buttonClassName?: string
  /** `state` shows the current visibility, `action` shows what clicking does. */
  visibilityIcon?: 'state' | 'action'
}

export function PasswordInput({
  className,
  inputClassName,
  buttonClassName,
  visibilityIcon = 'action',
  disabled,
  ref,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  // action 模式：隐藏时显示 Eye（点一下就看）；state 模式：直接反映当前可见状态。
  const openEye =
    visibilityIcon === 'action' ? !showPassword : showPassword
  const toggleLabel = showPassword ? 'Hide password' : 'Show password'

  return (
    <div className={cn('relative rounded-md', className)}>
      <Input
        type={showPassword ? 'text' : 'password'}
        ref={ref}
        disabled={disabled}
        className={inputClassName}
        {...props}
      />
      <Button
        type='button'
        size='icon'
        variant='ghost'
        disabled={disabled}
        className={cn(
          'text-muted-foreground hover:text-foreground absolute end-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md',
          buttonClassName
        )}
        aria-label={toggleLabel}
        aria-pressed={showPassword}
        title={toggleLabel}
        // 阻止默认行为，避免点击时输入框失焦、光标跳到开头
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setShowPassword((prev) => !prev)}
      >
        {openEye ? (
          <Eye size={16} aria-hidden='true' />
        ) : (
          <EyeOff size={16} aria-hidden='true' />
        )}
      </Button>
    </div>
  )
}
