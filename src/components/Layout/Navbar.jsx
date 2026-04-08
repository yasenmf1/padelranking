import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function Navbar() {
  const { profile, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    { to: '/', label: 'Начало' },
    { to: '/ladder', label: 'Класация' },
    { to: '/matches', label: 'Мачове' },
  ]

  async function handleLogout() {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  function getInitials(name) {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <nav className="bg-[#111111] border-b border-[#2a2a2a] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🎾</span>
            <span className="text-[#CCFF00] font-bold text-lg tracking-tight">Padel Ranking</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  location.pathname === link.to
                    ? 'text-[#CCFF00] bg-[#CCFF00]/10'
                    : 'text-gray-400 hover:text-white hover:bg-[#1e1e1e]'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {profile?.is_admin && (
              <Link
                to="/admin"
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  location.pathname === '/admin'
                    ? 'text-[#CCFF00] bg-[#CCFF00]/10'
                    : 'text-red-400 hover:text-red-300 hover:bg-[#1e1e1e]'
                }`}
              >
                Admin
              </Link>
            )}
          </div>

          {/* User section desktop */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-[#CCFF00] flex items-center justify-center text-black font-bold text-sm">
                {getInitials(profile?.full_name)}
              </div>
              <span className="text-sm text-gray-300">{profile?.username || profile?.full_name}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-[#1e1e1e]"
            >
              Изход
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1e1e1e] transition-colors"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-[#2a2a2a] py-3 space-y-1">
            <Link
              to="/profile"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#1e1e1e] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#CCFF00] flex items-center justify-center text-black font-bold text-sm">
                {getInitials(profile?.full_name)}
              </div>
              <div>
                <div className="text-white text-sm font-medium">{profile?.full_name}</div>
                <div className="text-gray-500 text-xs">@{profile?.username}</div>
              </div>
            </Link>
            <div className="border-t border-[#2a2a2a] my-2"></div>
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                  location.pathname === link.to
                    ? 'text-[#CCFF00] bg-[#CCFF00]/10'
                    : 'text-gray-400 hover:text-white hover:bg-[#1e1e1e]'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {profile?.is_admin && (
              <Link
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-lg font-medium text-sm text-red-400 hover:text-red-300 hover:bg-[#1e1e1e] transition-colors"
              >
                Admin Panel
              </Link>
            )}
            <div className="border-t border-[#2a2a2a] my-2"></div>
            <button
              onClick={() => { setMenuOpen(false); handleLogout() }}
              className="block w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-[#1e1e1e] transition-colors"
            >
              Изход
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
