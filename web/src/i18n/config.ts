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
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { convertDetectedLanguage } from './languages'

// 语言包按需加载：只在需要时下载当前语言（+ 英文兜底），
// 避免把 7 份 JSON（约 4.5 MB）全部塞进首屏主 chunk。
const localeLoaders = {
  en: () => import('./locales/en.json'),
  zhCN: () => import('./locales/zh.json'),
  zhTW: () => import('./locales/zh-TW.json'),
  ja: () => import('./locales/ja.json'),
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  vi: () => import('./locales/vi.json'),
}

type LocaleLoader = () => Promise<{ default: Record<string, unknown> }>

const lazyJSONBackend = {
  type: 'backend' as const,
  init: () => undefined,
  read: (
    language: string,
    _namespace: string,
    callback: (error: unknown, data: Record<string, unknown> | null) => void
  ) => {
    const loader =
      (localeLoaders as Record<string, LocaleLoader>)[language] ??
      localeLoaders.en
    loader()
      .then((module) => callback(null, module.default))
      .catch((error) => callback(error, null))
  },
}

/** i18n 初始化完成（含当前语言包加载）后再渲染，避免首帧出现 key。 */
export const i18nReady = i18n
  .use(LanguageDetector)
  .use(lazyJSONBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN', 'fr', 'ru', 'ja', 'vi', 'zhTW'],
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
      // codes (non-Chinese codes pass through for normal supportedLngs matching).
      convertDetectedLanguage,
    },
  })

export default i18n
