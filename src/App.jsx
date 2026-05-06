import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ToastHost from './components/ToastHost'
import AppLayout from './components/layout/AppLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'

// Lazy-load the heavy editor (R3F + atmosphere + clouds + post-processing
// + all clusters + queue + gallery modal + lightbox + the AI render sheet).
// Eager-loading it meant visitors to /login, /signup, the landing page,
// /community etc. all paid the editor's JS cost upfront — the editor is by
// far the heaviest surface in the app. Lazy() splits it into its own
// chunk; visitors that never open /app never download it.
const MockEditorPage = lazy(() => import('./pages/mock/MockEditorPage'))
// Same shape for the secondary in-app routes — they're not in the
// auth/landing critical path so paying their JS upfront is wasted.
const GalleryPage = lazy(() => import('./pages/GalleryPage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

// /dof-lab is the internal DoF-tuning sandbox — its own copies of every
// cluster + an aperture-coc dof variant. Not customer-facing. We keep it
// in the codebase for ongoing tuning work but lazy-import it so it doesn't
// bloat the main app chunk, and dev-gate the route so prod doesn't surface
// it at all.
const DofLabPage = lazy(() => import('./pages/dof-lab/DofLabPage'))

// Editor's loading state matches its dark glass aesthetic — a black
// viewport with a faint cream pulse. Anything brighter is jarring on a
// route the user took to land on a 3D scene.
function EditorLoading() {
  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#09090b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: '#c8b897', opacity: 0.6,
        animation: 'vd-pulse 1.4s ease-in-out infinite',
      }} />
      <style>{`@keyframes vd-pulse {
        0%, 100% { opacity: 0.2; transform: scale(0.8); }
        50%      { opacity: 0.8; transform: scale(1.3); }
      }`}</style>
    </div>
  )
}

// In-AppLayout pages share a simpler loading state — the navbar already
// renders eagerly, so just an empty body suffices while the page chunk
// downloads.
function PageLoading() {
  return <div style={{ minHeight: 'calc(100vh - 56px)' }} />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* App-wide toast host. Single mount so /profile, /community,
         *  and the editor all share one renderer. */}
        <ToastHost />
        <Routes>
          {/* Auth pages — no navbar */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Full-screen editor — no navbar; owns the whole viewport.
           * /app          → Vedute editor (the only editor as of Phase 1.2)
           * /app-classic  → 301 to /app (sidebar editor was removed)
           * /mock         → historical alias, also redirects to /app */}
          <Route
            path="/app"
            element={
              <ProtectedRoute guestAllowed>
                <Suspense fallback={<EditorLoading />}><MockEditorPage /></Suspense>
              </ProtectedRoute>
            }
          />
          {import.meta.env.DEV && (
            <Route
              path="/dof-lab"
              element={
                <ProtectedRoute guestAllowed>
                  <Suspense fallback={<EditorLoading />}><DofLabPage /></Suspense>
                </ProtectedRoute>
              }
            />
          )}
          <Route path="/app-classic" element={<Navigate to="/app" replace />} />
          <Route path="/mock" element={<Navigate to="/app" replace />} />

          {/* Pages with navbar */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/community"
              element={<Suspense fallback={<PageLoading />}><CommunityPage /></Suspense>}
            />
            <Route
              path="/gallery"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoading />}><GalleryPage /></Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoading />}><ProfilePage /></Suspense>
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
