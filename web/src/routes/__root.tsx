import { createRootRoute, Outlet } from '@tanstack/react-router'
import { CmdKProvider } from '@/components/CmdK'
import { TopBar } from '@/components/TopBar'
import { TabBar } from '@/components/TabBar'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <CmdKProvider>
      {/* h-screen + overflow-hidden anchors the layout to viewport height so
          the three IDE panes each get their own scroll context instead of
          everything sharing the page scroll. TopBar+TabBar are fixed-height
          siblings; main absorbs whatever's left and hands it to the grid. */}
      <div className="h-screen flex flex-col bg-paper overflow-hidden">
        <TopBar />
        <TabBar />
        <main className="flex-1 flex flex-col min-h-0"><Outlet /></main>
      </div>
    </CmdKProvider>
  )
}
