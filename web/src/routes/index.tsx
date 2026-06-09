import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-12 max-w-3xl mx-auto">
      <h1 className="font-display text-5xl mb-4">El corpus jurídico chileno, en vivo.</h1>
      <p className="opacity-70">Time Machine landing arrives in Plan 4. Try a law directly:</p>
      <ul className="list-disc list-inside mt-4 space-y-1">
        <li><a className="text-indigo underline" href="/ley-chile/ley/20330">Ley 20.330 (latest)</a></li>
      </ul>
    </div>
  ),
})
