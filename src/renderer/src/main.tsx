import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import { App } from './App'
import { PrintView } from './doc/PrintView'
import { useApp } from './store'
import './styles.css'
import './doc/doc.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 }
  }
})

// A window opened by the PDF export renders its pages only.
const printToken = new URLSearchParams(window.location.search).get('print')
if (!printToken) document.documentElement.classList.toggle('light', useApp.getState().theme === 'light')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {printToken ? (
      <PrintView token={printToken} />
    ) : (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )}
  </StrictMode>
)
