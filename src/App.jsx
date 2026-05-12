import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import ToastHost from './components/ToastHost'
import useGalleryData from './pages/editor/hooks/useGalleryData'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

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
// Design-system reference page — visual doc for the editor's vocabulary.
// Loads mock.css + modals.css so the live demos render against the
// source of truth.
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'))

// /dof-lab is the internal DoF-tuning sandbox — its own copies of every
// cluster + an aperture-coc dof variant. Not customer-facing. Wrap the
// lazy() factory in a DEV-only ternary so rolldown's static analysis
// can drop the import.meta.env.DEV branch (and the entire DofLabPage
// chunk + CSS, ~46KB combined) from production builds. Plain
// runtime-gated routes still ship the chunk file because the closure
// keeps the import reference reachable.
const DofLabPage = import.meta.env.DEV ? lazy(() => import('./pages/dof-lab/DofLabPage')) : null

// Editor's loading state matches its dark glass aesthetic — a black
// viewport with a faint cream pulse. Anything brighter is jarring on a
// route the user took to land on a 3D scene.
function EditorLoading() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#09090b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#c8b897',
          opacity: 0.6,
          animation: 'vd-pulse 1.4s ease-in-out infinite',
        }}
      />
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

// Mount useGalleryData app-wide (not inside the editor shell) so the
// gallery-add listener stays registered even when the user navigates
// away from /app. Without this: a user starts an AI render, navigates
// to /community while it's in flight, the render completes after the
// editor unmounts, gallery-add fires into the void, and the entry is
// lost. The cost is one initial IDB read on every page load instead
// of just /app's — negligible.
function GalleryDataMount() {
  useGalleryData()
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          {/* App-wide toast host. Single mount so /profile, /community,
           *  and the editor all share one renderer. */}
          <ToastHost />
          <GalleryDataMount />
          <Routes>
            {/* Auth pages — no navbar */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Full-screen editor — no navbar; owns the whole viewport.
             * Mounted at BOTH `/` and `/app` so vedute.app/ opens the
             * editor directly (no marketing landing page) while every
             * existing /app link / bookmark keeps working unchanged.
             * /app-classic + /mock are 301-style redirects for old URLs. */}
            {[ '/', '/app' ].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <ProtectedRoute guestAllowed>
                    <Suspense fallback={<EditorLoading />}>
                      <MockEditorPage />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
            ))}
            {import.meta.env.DEV && DofLabPage && (
              <Route
                path="/dof-lab"
                element={
                  <ProtectedRoute guestAllowed>
                    <Suspense fallback={<EditorLoading />}>
                      <DofLabPage />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
            )}
            <Route path="/app-classic" element={<Navigate to="/app" replace />} />
            <Route path="/mock" element={<Navigate to="/app" replace />} />

            {/* Design-system reference (no navbar, no auth). Visual doc
             * for everything that ships in /app — tokens, primitives,
             * menus, chrome. Internal but reachable in prod. */}
            <Route
              path="/design-system"
              element={
                <Suspense fallback={<PageLoading />}>
                  <DesignSystemPage />
                </Suspense>
              }
            />

            {/* Pages with navbar */}
            <Route element={<AppLayout />}>
              <Route
                path="/community"
                element={
                  <Suspense fallback={<PageLoading />}>
                    <CommunityPage />
                  </Suspense>
                }
              />
              <Route
                path="/gallery"
                element={
                  <ProtectedRoute>
                    <Suspense fallback={<PageLoading />}>
                      <GalleryPage />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Suspense fallback={<PageLoading />}>
                      <ProfilePage />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
