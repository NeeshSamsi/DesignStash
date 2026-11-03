import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './screens/errors'
import { installOverlayScrollbars } from './lib/overlay-scrollbars'
import './assets/main.css'
import './styles/loading-grace.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

installOverlayScrollbars()

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
