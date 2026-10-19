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
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthLayout } from '../auth-layout'
import { AuthFooterLinks } from '../components/auth-footer-links'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout>
      {/* [改造-仿bifrost] 标题区：居中、18px 标题 + 13.2px 副标题 */}
      <div className='space-y-2 text-center'>
        <h1 className='text-foreground text-lg font-semibold'>
          {t('Welcome back')}
        </h1>
        <p className='text-muted-foreground text-[0.825rem] leading-5'>
          {t('Sign in to your account to continue')}
        </p>
        <p className='text-muted-foreground text-[0.825rem] leading-5'>
          {t("Don't have an account?")}{' '}
          <Link
            to='/sign-up'
            className='hover:text-primary font-medium underline underline-offset-4'
          >
            {t('Sign up')}
          </Link>
          .
        </p>
      </div>

      <UserAuthForm redirectTo={redirect} />

      <AuthFooterLinks />
    </AuthLayout>
  )
}
