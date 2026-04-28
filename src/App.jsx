import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import EditorPage from './pages/editor/EditorPage'
import MockEditorPage from './pages/mock/MockEditorPage'
import DofLabPage from './pages/dof-lab/DofLabPage'
import GalleryPage from './pages/GalleryPage'
import CommunityPage from './pages/CommunityPage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Auth pages — no navbar */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Full-screen editor — no navbar; owns the whole viewport.
           * /app  → the floating-pills editor (current default)
           * /app-classic → the legacy sidebar editor, preserved
           * /mock → historical alias, redirects to /app */}
          <Route path="/app" element={<ProtectedRoute guestAllowed><MockEditorPage /></ProtectedRoute>} />
          <Route path="/app-classic" element={<ProtectedRoute guestAllowed><EditorPage /></ProtectedRoute>} />
          <Route path="/dof-lab" element={<ProtectedRoute guestAllowed><DofLabPage /></ProtectedRoute>} />
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
