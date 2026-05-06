import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { runLocalStorageMigrations } from './lib/migrations'

// Rewrite legacy mapposter3d_* / mapposter_* localStorage keys onto the new
// vedute_* prefix before any hook reads from storage. Idempotent.
runLocalStorageMigrations()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
