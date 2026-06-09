import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink/10 px-6 py-3 flex items-center gap-4">
        <a href="/ley-chile/" className="font-display text-lg tracking-tight">
          ley<span className="text-ruby">·</span>chile
        </a>
        <span className="text-xs uppercase tracking-widest opacity-50">
          corpus jurídico en vivo
        </span>
      </header>
      <main className="flex-1"><Outlet /></main>
    </div>
  ),
})
