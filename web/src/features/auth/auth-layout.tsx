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
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { systemName, logo, loading } = useSystemConfig()

  return (
    /* [改造-仿bifrost] 居中卡片：448px、space-y-6、p-8，圆角跟随主题 --radius */
    <div className='bg-background flex min-h-svh items-center justify-center p-4'>
      <div className='w-full max-w-md'>
        <div className='border-border bg-card space-y-6 rounded-lg border p-8'>
          <div className='flex items-center justify-center'>
            {loading ? (
              <Skeleton className='h-10 w-40' />
            ) : (
              <img
                src={logo}
                alt={systemName}
                className='max-h-[40px] w-auto max-w-[220px] object-contain'
              />
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
