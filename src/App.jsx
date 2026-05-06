import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ToastHost from './components/ToastHost'
import AppLayout from './components/layout/AppLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import MockEditorPage from './pages/mock/MockEditorPage'
import DofLabPage from './pages/dof-lab/DofLabPage'
import GalleryPage from './pages/GalleryPage'
import CommunityPage from './pages/CommunityPage'
import ProfilePage from './pages/ProfilePage'

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
          <Route path="/app" element={<ProtectedRoute guestAllowed><MockEditorPage /></ProtectedRoute>} />
          <Route path="/dof-lab" element={<ProtectedRoute guestAllowed><DofLabPage /></ProtectedRoute>} />
          <Route path="/app-classic" element={<Navigate to="/app" replace />} />
          <Route path="/mock" element={<Navigate to="/app" replace />} />

          {/* Pages with navbar */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/gallery" element={<ProtectedRoute><GalleryPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
