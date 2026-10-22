import { defineConfig } from 'vitepress'

// 文档站的访问前缀。构建产物会写进 web/dist/docs，由 new-api 的静态服务
// 直接对外提供（同域 https://<你的域名>/docs/）。
export default defineConfig({
  lang: 'zh-CN',
  base: '/docs/',
  title: 'NowHub API 文档',
  description: 'NowHub API 文档：一个 API 接入主流大模型，兼容 OpenAI / Anthropic / Gemini 协议。',
  appearance: 'dark',
  // 静态服务没有 clean-url 重写，保留 .html 后缀
  cleanUrls: false,
  lastUpdated: true,
  srcExclude: ['README.md'],
  head: [['meta', { name: 'theme-color', content: '#0d1117' }]],
  themeConfig: {
    siteTitle: 'NowHub API',
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',
    lastUpdatedText: '最后更新',
    // 指向主站的链接不用 nav：VitePress 会给站内绝对路径自动加 base，
    // 生成 /docs/pricing.html。正文里用原生 <a href="/pricing"> 即可。
    nav: [
      { text: '指南', link: '/guide/introduction', activeMatch: '^/docs/guide/' },
      { text: 'API', link: '/api/chat-completions', activeMatch: '^/docs/api/' },
      { text: '工具', link: '/tools/claude-code', activeMatch: '^/docs/tools/' },
      { text: '排障', link: '/faq/', activeMatch: '^/docs/faq/' },
    ],
    sidebar: [
      {
        text: '开始',
        items: [
          { text: '简介', link: '/guide/introduction' },
          { text: '快速开始', link: '/guide/quick-start' },
        ],
      },
      {
        text: '使用',
        items: [
          { text: '模型与分组', link: '/guide/models-and-groups' },
          { text: '定价与计费', link: '/guide/pricing' },
          { text: '速率限制', link: '/guide/rate-limits' },
          { text: '接口兼容性', link: '/guide/compatibility' },
          { text: '错误码', link: '/guide/errors' },
        ],
      },
      {
        text: 'API 参考',
        items: [
          { text: 'Chat Completions', link: '/api/chat-completions' },
          { text: 'Claude Messages', link: '/api/messages' },
          { text: 'Gemini generateContent', link: '/api/gemini' },
          { text: 'Models', link: '/api/models' },
          { text: 'Embeddings', link: '/api/embeddings' },
          { text: '函数调用', link: '/api/function-calling' },
        ],
      },
      {
        text: '工具接入',
        items: [
          { text: 'Claude Code', link: '/tools/claude-code' },
          { text: 'Codex CLI', link: '/tools/codex-cli' },
          { text: 'Cline / Cherry Studio', link: '/tools/cline' },
          { text: 'LangChain', link: '/tools/langchain' },
        ],
      },
      {
        text: '常见问题',
        items: [
          { text: '按现象查', link: '/faq/' },
          { text: '鉴权与路径', link: '/faq/auth' },
          { text: '余额与额度', link: '/faq/quota' },
          { text: '超时与长请求', link: '/faq/timeout' },
          { text: 'max_tokens', link: '/faq/max-tokens' },
          { text: '缓存与计费', link: '/faq/cache' },
          { text: '使用问答', link: '/guide/faq' },
        ],
      },
      {
        text: '其他',
        items: [
          { text: '关于本站', link: '/about' },
          { text: '文档更新', link: '/changelog' },
        ],
      },
    ],
    search: { provider: 'local' },
    footer: {
      message: '内容以模型广场与后台实际配置为准。',
      copyright: 'Copyright © NowHub API',
    },
  },
})
