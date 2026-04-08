import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Layout/Navbar'
import Login from './components/Auth/Login'
import Register from './components/Auth/Register'
import Questionnaire from './components/Questionnaire/Questionnaire'
import SelfAssessment from './components/SelfAssessment/SelfAssessment'
import Dashboard from './components/Dashboard/Dashboard'
import Ladder from './components/Ladder/Ladder'
import MatchesPage from './components/Matches/MatchesPage'
import Profile from './components/Profile/Profile'
import AdminPanel from './components/Admin/AdminPanel'
import SplashScreen from './components/Onboarding/SplashScreen'

const Spinner = () => (
  <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-400">Зареждане...</p>
    </div>
  </div>
)

function ProtectedRoute({ children, adminOnly = false }) {
  const { session, profile, loading, profileLoading } = useAuth()
  const location = useLocation()

  // Session state not known yet
  if (loading) return <Spinner />

  // No session → login
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Session exists, profile is being fetched
  if (profileLoading) return <Spinner />

  // Profile fetch done but no profile row → redirect to login
  if (!profile) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!profile.questionnaire_done && location.pathname !== '/questionnaire') {
    return <Navigate to="/questionnaire" replace />
  }

  if (adminOnly && profile.email !== 'office@motamo.bg') {
    return <Navigate to="/" replace />
  }

  // Redirect once per session to self-assessment if not completed
  if (
    profile.self_assessment_score == null &&
    location.pathname !== '/self-assessment' &&
    !sessionStorage.getItem('sa_prompted')
  ) {
    sessionStorage.setItem('sa_prompted', '1')
    return <Navigate to="/self-assessment" replace />
  }

  return children
}

function PublicRoute({ children }) {
  const { session, profile, loading, profileLoading } = useAuth()

  // Session state not known yet
  if (loading) return <Spinner />

  // No session → show the page (login/register)
  if (!session) return children

  // Session exists, wait for profile before deciding where to go
  if (profileLoading) return <Spinner />

  if (!profile) return children // profile failed to load, stay on public page

  if (!profile.questionnaire_done) return <Navigate to="/questionnaire" replace />
  return <Navigate to="/" replace />
}

export default function App() {
  const { session, profile } = useAuth()
  const showNavbar = session && profile?.questionnaire_done

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <SplashScreen />
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route
          path="/questionnaire"
          element={
            <ProtectedRoute>
              <Questionnaire />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ladder"
          element={
            <ProtectedRoute>
              <Ladder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matches"
          element={
            <ProtectedRoute>
              <MatchesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly={true}>
              <AdminPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/self-assessment"
          element={
            <ProtectedRoute>
              <SelfAssessment />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
