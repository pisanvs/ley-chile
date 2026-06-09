import { createFileRoute, Link } from '@tanstack/react-router'

// NOTE: the $numero route param is currently treated as `idNorma` (the BCN internal ID)
// until Plan 2 introduces a numero → idNorma resolution index.
export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-12 max-w-3xl mx-auto">
      <h1 className="font-display text-5xl mb-4">El corpus jurídico chileno, en vivo.</h1>
      <p className="opacity-70">Time Machine landing arrives in Plan 4. Try a law directly:</p>
      <ul className="list-disc list-inside mt-4 space-y-1">
        <li>
          <Link to="/ley/$numero" params={{ numero: '20330' }} className="text-indigo underline">
            idNorma 20330 (latest version)
          </Link>
        </li>
      </ul>
    </div>
  ),
})
