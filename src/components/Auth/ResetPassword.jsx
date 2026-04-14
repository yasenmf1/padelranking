import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../context/LanguageContext'

export default function ResetPassword() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const [checking, setChecking] = useState(true)

  // Supabase appends #access_token=...&type=recovery to the URL.
  // onAuthStateChange fires with event 'PASSWORD_RECOVERY' once the token is exchanged.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidSession(true)
        setChecking(false)
      } else if (event === 'SIGNED_IN') {
        // Could also be a normal sign-in — only treat as valid if URL has type=recovery
        const hash = window.location.hash
        if (hash.includes('type=recovery')) {
          setValidSession(true)
        }
        setChecking(false)
      } else {
        setChecking(false)
      }
    })

    // If already signed in and URL has recovery token
    const hash = window.location.hash
    if (hash.includes('access_token') && hash.includes('type=recovery')) {
      setValidSession(true)
      setChecking(false)
    } else {
      // Give the auth change event 1.5s to fire
      const timer = setTimeout(() => setChecking(false), 1500)
      return () => {
        clearTimeout(timer)
        subscription.unsubscribe()
      }
    }

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError(t('register.errorPasswordShort')); return }
    if (password !== confirm) { setError(t('register.errorPasswordMatch')); return }

    setLoading(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr
      setSuccess(true)
      setTimeout(() => navigate('/login', { state: { message: t('resetPassword.successMsg') } }), 2500)
    } catch (err) {
      setError(err.message || t('resetPassword.errorGeneral'))
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!validSession) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center card">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">{t('resetPassword.invalidLink')}</h2>
          <p className="text-gray-400 text-sm mb-6">{t('resetPassword.invalidLinkHint')}</p>
          <button onClick={() => navigate('/login')} className="btn-neon w-full">
            {t('resetPassword.backToLogin')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-3xl font-bold text-[#CCFF00]">Padel Ranking</h1>
          <p className="text-gray-400 mt-1">{t('resetPassword.subtitle')}</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-white mb-6">{t('resetPassword.title')}</h2>

          {success ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-[#CCFF00] font-semibold">{t('resetPassword.successMsg')}</p>
              <p className="text-gray-500 text-sm mt-2">{t('resetPassword.redirecting')}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    {t('resetPassword.newPassword')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-dark"
                    placeholder={t('register.passwordMin')}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    {t('resetPassword.confirmPassword')}
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="input-dark"
                    placeholder={t('register.repeatPassword')}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-neon w-full mt-2 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />{t('resetPassword.saving')}</>
                  ) : t('resetPassword.saveBtn')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
