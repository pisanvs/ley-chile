import { createRootRoute, Outlet } from '@tanstack/react-router'
import { CmdKProvider } from '@/components/CmdK'
import { TopBar } from '@/components/TopBar'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <CmdKProvider>
      <div className="min-h-screen flex flex-col bg-paper">
        <TopBar />
        <main className="flex-1 flex flex-col"><Outlet /></main>
      </div>
    </CmdKProvider>
  )
}
