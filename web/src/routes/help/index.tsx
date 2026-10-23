import { createFileRoute } from '@tanstack/react-router'

import { DocsEmbed } from '@/features/docs-embed'

export const Route = createFileRoute('/help/')({
  component: DocsEmbed,
})
