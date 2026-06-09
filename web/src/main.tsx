import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 60 * 24, gcTime: 1000 * 60 * 60 * 24 },
  },
})

const rawBase = import.meta.env.BASE_URL || '/'
const basepath = rawBase.endsWith('/') && rawBase !== '/' ? rawBase.slice(0, -1) : rawBase
const router = createRouter({ routeTree, context: { queryClient }, basepath })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
