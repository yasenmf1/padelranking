import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

async function findFreeUsername(base) {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'player'
  let username = clean
  let i = 1
  while (i <= 20) {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle()
    if (!data) return username
    username = `${clean}${i++}`
  }
  return `${clean}_${Date.now() % 100000}`
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Влизане...')

  useEffect(() => {
    async function handle() {
      try {
        // Exchange the code in the URL for a session (Supabase PKCE flow)
        const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(window.location.href)

        if (error || !session) {
          console.error('OAuth callback error:', error)
          navigate('/login', { replace: true })
          return
        }

        const user = session.user

        // Check if this user already has a profile row
        const { data: existing } = await supabase
          .from('profiles')
          .select('id, questionnaire_done')
          .eq('id', user.id)
          .maybeSingle()

        if (existing) {
          navigate(existing.questionnaire_done ? '/' : '/questionnaire', { replace: true })
          return
        }

        // New OAuth user — create profile
        setStatus('Създаване на профил...')

        const meta = user.user_metadata || {}
        const fullName = (meta.full_name || meta.name || user.email?.split('@')[0] || 'Играч').trim()
        const emailBase = (user.email || 'player').split('@')[0]
        const username = await findFreeUsername(emailBase)

        const { error: insertErr } = await supabase.from('profiles').insert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          username,
          rating: 500,
          league: 'Начинаещи',
          approved_matches: 0,
          is_ranked: false,
          is_admin: false,
          questionnaire_done: false,
        })

        if (insertErr) {
          // Might have been created by a DB trigger — try fetching again
          console.warn('Profile insert warning:', insertErr.message)
          const { data: retry } = await supabase
            .from('profiles')
            .select('id, questionnaire_done')
            .eq('id', user.id)
            .maybeSingle()
          if (retry) {
            navigate(retry.questionnaire_done ? '/' : '/questionnaire', { replace: true })
            return
          }
          // Real failure
          throw insertErr
        }

        navigate('/questionnaire', { replace: true })
      } catch (err) {
        console.error('AuthCallback error:', err)
        navigate('/login', { replace: true })
      }
    }

    handle()
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-400 text-sm">{status}</p>
      </div>
    </div>
  )
}
