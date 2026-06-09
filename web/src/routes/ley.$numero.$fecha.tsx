import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/ley/$numero/$fecha')({
  component: () => <div className="p-8">IDE shell coming in Task 7.</div>,
})
