'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/lib/theme'
import { CmdKProvider } from '@/components/CmdK'
import { TopBar } from '@/components/TopBar'
import { TabBar } from '@/components/TabBar'

/** Root client shell — mirrors web/'s main.tsx providers + __root.tsx layout. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 1000 * 60 * 60 * 24, gcTime: 1000 * 60 * 60 * 24 },
        },
      }),
  )

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <CmdKProvider>
          <div className="flex min-h-screen flex-col bg-paper">
            <TopBar />
            <TabBar />
            <main className="flex flex-1 flex-col">{children}</main>
          </div>
        </CmdKProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
