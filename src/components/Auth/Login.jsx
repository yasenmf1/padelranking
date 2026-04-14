import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const { login } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'
  const successMsg = location.state?.message || ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    setForgotError('')
    setForgotLoading(true)
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: 'https://padelranking.info/reset-password',
      })
      if (resetErr) throw resetErr
      setForgotSent(true)
    } catch (err) {
      setForgotError(err.message || t('login.forgotError'))
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎾</div>
          <h1 className="text-3xl font-bold text-[#CCFF00]">Padel Ranking</h1>
          <p className="text-gray-400 mt-1">{t('login.subtitle')}</p>
        </div>

        <div className="card">
          {successMsg && (
            <div className="mb-4 p-3 bg-[#CCFF00]/10 border border-[#CCFF00]/30 rounded-lg text-[#CCFF00] text-sm font-medium">
              {successMsg}
            </div>
          )}

          {!showForgot ? (
            <>
              <h2 className="text-xl font-bold text-white mb-6">{t('login.title')}</h2>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('login.email')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-dark"
                    placeholder="your@email.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('login.password')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-dark"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-neon w-full mt-2 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      {t('login.loggingIn')}
                    </>
                  ) : t('login.loginBtn')}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowForgot(true)}
                  className="text-sm text-gray-500 hover:text-[#CCFF00] transition-colors"
                >
                  {t('login.forgotPassword')}
                </button>
              </div>

              <p className="mt-4 text-center text-gray-500 text-sm">
                {t('login.noAccount')}{' '}
                <Link to="/register" className="text-[#CCFF00] hover:underline font-medium">
                  {t('login.registerLink')}
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotError('') }}
                  className="text-gray-500 hover:text-white transition-colors text-sm"
                >
                  ← {t('common.back')}
                </button>
                <h2 className="text-xl font-bold text-white">{t('login.forgotTitle')}</h2>
              </div>

              {forgotSent ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">📧</div>
                  <p className="text-[#CCFF00] font-semibold">{t('login.forgotSent')}</p>
                  <p className="text-gray-500 text-sm mt-2">{t('login.forgotSentHint')}</p>
                  <button
                    onClick={() => setShowForgot(false)}
                    className="mt-5 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    ← {t('login.backToLogin')}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-gray-400 text-sm mb-5">{t('login.forgotHint')}</p>

                  {forgotError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                      {forgotError}
                    </div>
                  )}

                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('login.email')}</label>
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        className="input-dark"
                        placeholder="your@email.com"
                        required
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="btn-neon w-full flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {forgotLoading ? (
                        <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />{t('login.forgotSending')}</>
                      ) : t('login.forgotBtn')}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
