import { createFileRoute } from '@tanstack/react-router'

import { DocsEmbed } from '@/features/docs-embed'

export const Route = createFileRoute('/help/$')({
  component: HelpSplatRoute,
})

function HelpSplatRoute() {
  const params = Route.useParams() as { _splat?: string }
  return <DocsEmbed path={params._splat ?? ''} />
}
