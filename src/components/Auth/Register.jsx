import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

// Generate candidate alternatives for a taken username
function generateCandidates(base) {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, '')
  return [
    `${clean}1`,
    `${clean}2`,
    `${clean}3`,
    `${clean}_padel`,
    `${clean}_bg`,
  ]
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [clubs, setClubs] = useState([])
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    username: '',
    phone: '',
    club_id: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Username availability
  const [usernameStatus, setUsernameStatus] = useState('idle') // 'idle' | 'checking' | 'available' | 'taken'
  const [suggestions, setSuggestions] = useState([])
  const debounceRef = useRef(null)

  useEffect(() => {
    async function fetchClubs() {
      const { data } = await supabase.from('clubs').select('*').order('city')
      if (data) setClubs(data)
    }
    fetchClubs()
  }, [])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))

    if (name === 'username') {
      checkUsername(value)
    }
  }

  function checkUsername(value) {
    // Reset
    setSuggestions([])
    clearTimeout(debounceRef.current)

    if (value.length < 3) {
      setUsernameStatus('idle')
      return
    }

    setUsernameStatus('checking')

    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', value)
          .maybeSingle()

        if (data) {
          // Taken — find available suggestions
          setUsernameStatus('taken')
          const candidates = generateCandidates(value)
          const { data: takenRows } = await supabase
            .from('profiles')
            .select('username')
            .in('username', candidates)
          const takenSet = new Set((takenRows || []).map(r => r.username))
          setSuggestions(candidates.filter(c => !takenSet.has(c)))
        } else {
          setUsernameStatus('available')
          setSuggestions([])
        }
      } catch {
        setUsernameStatus('idle')
      }
    }, 400)
  }

  function applySuggestion(s) {
    setForm(prev => ({ ...prev, username: s }))
    setUsernameStatus('available')
    setSuggestions([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Паролите не съвпадат.')
      return
    }
    if (form.password.length < 6) {
      setError('Паролата трябва да е поне 6 символа.')
      return
    }
    if (form.username.length < 3) {
      setError('Потребителското име трябва да е поне 3 символа.')
      return
    }
    if (usernameStatus === 'taken') {
      setError('Потребителското име е заето. Изберете друго.')
      return
    }

    setLoading(true)
    try {
      await register(form.email, form.password, {
        full_name: form.full_name,
        username: form.username,
        phone: form.phone,
        club_id: form.club_id ? parseInt(form.club_id) : null
      })
      navigate('/questionnaire')
    } catch (err) {
      if (err.message?.includes('already registered')) {
        setError('Този имейл вече е регистриран.')
      } else if (err.message?.includes('duplicate key') && err.message?.includes('username')) {
        setError('Това потребителско име вече е заето.')
      } else {
        setError(err.message || 'Грешка при регистрация. Опитайте отново.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Dynamic border class for username input
  const usernameBorder =
    usernameStatus === 'available' ? 'border-green-500 focus:border-green-400' :
    usernameStatus === 'taken'     ? 'border-red-500 focus:border-red-400' :
    ''

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎾</div>
          <h1 className="text-3xl font-bold text-[#CCFF00]">Padel Ranking</h1>
          <p className="text-gray-400 mt-1">Присъединете се към класацията</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-white mb-6">Създайте акаунт</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Пълно ime *</label>
              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className="input-dark"
                placeholder="Иван Иванов"
                required
              />
            </div>

            {/* Username with live check */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Потребителско ime *</label>
              <div className="relative">
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className={`input-dark pr-9 ${usernameBorder}`}
                  placeholder="ivan_padel"
                  required
                  pattern="[a-zA-Z0-9_]+"
                  title="Само букви, цифри и долна черта"
                />

                {/* Status icon */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {usernameStatus === 'checking' && (
                    <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {usernameStatus === 'available' && (
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {usernameStatus === 'taken' && (
                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Status message */}
              {usernameStatus === 'available' && (
                <p className="mt-1.5 text-xs text-green-500 font-medium">✓ Потребителското ime е свободно</p>
              )}
              {usernameStatus === 'taken' && (
                <p className="mt-1.5 text-xs text-red-400 font-medium">✗ Потребителското ime е заето</p>
              )}

              {/* Suggestions */}
              {usernameStatus === 'taken' && suggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1.5">Свободни алтернативи:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => applySuggestion(s)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/30 hover:bg-[#CCFF00]/20 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Имейл *</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="input-dark"
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Телефон</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="input-dark"
                placeholder="+359 88 888 8888"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Клуб</label>
              <select
                name="club_id"
                value={form.club_id}
                onChange={handleChange}
                className="input-dark"
              >
                <option value="">Без клуб</option>
                {clubs.map(club => (
                  <option key={club.id} value={club.id}>
                    {club.name} ({club.city})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Парола *</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className="input-dark"
                placeholder="Минимум 6 символа"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Потвърди паролата *</label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                className="input-dark"
                placeholder="Повторете паролата"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || usernameStatus === 'checking' || usernameStatus === 'taken'}
              className="btn-neon w-full mt-2 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  Регистрация...
                </>
              ) : 'Регистрирай се'}
            </button>
          </form>

          <p className="mt-5 text-center text-gray-500 text-sm">
            Вече имате акаунт?{' '}
            <Link to="/login" className="text-[#CCFF00] hover:underline font-medium">
              Влезте тук
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
