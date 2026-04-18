import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import Login from './pages/Login'
import Home from './pages/Home'
import Landscape from './pages/Landscape'
import InviteLanding from './pages/InviteLanding'
import InviteJoin from './pages/InviteJoin'
import PalettePreview from './pages/PalettePreview'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/home" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/invite/:token" element={<InviteLanding />} />
          <Route path="/invite/:token/join" element={<InviteJoin />} />
          <Route path="/dev/palettes" element={<PalettePreview />} />
          <Route path="/" element={
            <ProtectedRoute>
              <WorkspaceProvider>
                <Landscape />
              </WorkspaceProvider>
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
