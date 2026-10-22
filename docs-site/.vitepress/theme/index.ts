import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'

import CopyMarkdown from './components/CopyMarkdown.vue'
import ModelCatalog from './components/ModelCatalog.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-before': () => h(CopyMarkdown),
    })
  },
  enhanceApp({ app }: { app: any }) {
    app.component('ModelCatalog', ModelCatalog)
  },
}
