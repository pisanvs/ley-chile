import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink/10 px-6 py-3 flex items-center gap-4">
        <Link to="/" className="font-display text-lg tracking-tight">
          ley<span className="text-ruby">·</span>chile
        </Link>
        <span className="text-xs uppercase tracking-widest opacity-50">
          corpus jurídico en vivo
        </span>
      </header>
      <main className="flex-1"><Outlet /></main>
    </div>
  ),
})
