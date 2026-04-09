import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import MatchConfirmCard from './MatchConfirmCard'

export default function ConfirmationSection({ onCountChange }) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPending = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('matches')
        .select(`*,
          player1:profiles!matches_player1_id_fkey(id, full_name, username, rating, approved_matches),
          player2:profiles!matches_player2_id_fkey(id, full_name, username, rating, approved_matches),
          player3:profiles!matches_player3_id_fkey(id, full_name, username, rating, approved_matches),
          player4:profiles!matches_player4_id_fkey(id, full_name, username, rating, approved_matches),
          clubs(name, city)`)
        // I am an opponent (team 2)
        .or(`player3_id.eq.${profile.id},player4_id.eq.${profile.id}`)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (data) {
        // Client-side: filter out expired matches and lazily update their DB status
        const now = new Date()
        const active = []
        const expiredIds = []

        for (const m of data) {
          if (m.expires_at && new Date(m.expires_at) < now) {
            expiredIds.push(m.id)
          } else {
            active.push(m)
          }
        }

        // Lazily mark expired matches in DB
        if (expiredIds.length > 0) {
          supabase.from('matches')
            .update({ status: 'expired' })
            .in('id', expiredIds)
            .then(() => {}) // fire and forget
        }

        setMatches(active)
        onCountChange?.(active.length)
      }
    } catch (err) {
      console.error('Error fetching pending confirmations:', err)
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { fetchPending() }, [fetchPending])

  function handleDone() {
    fetchPending()
  }

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
          <h2 className="text-base font-bold text-white">{t('confirmSection.title')}</h2>
        </div>
        <div className="py-4 text-center">
          <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    )
  }

  if (matches.length === 0) return null

  return (
    <div className="card space-y-4 border-yellow-500/20 bg-yellow-500/5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0"></span>
          <h2 className="text-base font-bold text-white">{t('confirmSection.title')}</h2>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
          {t('confirmSection.pendingCount', { n: matches.length })}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {matches.map(match => (
          <MatchConfirmCard
            key={match.id}
            match={match}
            profile={profile}
            onDone={handleDone}
          />
        ))}
      </div>
    </div>
  )
}
