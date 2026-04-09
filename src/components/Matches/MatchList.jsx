import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'

// Statuses where ELO was applied and we can show win/loss
const RESOLVED = ['approved', 'confirmed']

function isExpiredClient(match) {
  if (match.status !== 'pending') return false
  if (!match.expires_at) return false
  return new Date(match.expires_at) < new Date()
}

export default function MatchList({ refresh }) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [matches, setMatches] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)

  const STATUS_TABS = [
    { key: 'all',      label: t('matchList.tabs.all') },
    { key: 'pending',  label: t('matchList.tabs.pending') },
    { key: 'confirmed',label: t('matchList.tabs.confirmed') },
    { key: 'disputed', label: t('matchList.tabs.disputed') },
    { key: 'expired',  label: t('matchList.tabs.expired') },
    { key: 'rejected', label: t('matchList.tabs.rejected') },
  ]

  useEffect(() => { if (profile) fetchMatches() }, [profile, refresh])

  async function fetchMatches() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('matches')
        .select(`*,
          player1:profiles!matches_player1_id_fkey(id, full_name, username),
          player2:profiles!matches_player2_id_fkey(id, full_name, username),
          player3:profiles!matches_player3_id_fkey(id, full_name, username),
          player4:profiles!matches_player4_id_fkey(id, full_name, username),
          clubs(name, city)`)
        .or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id},player3_id.eq.${profile.id},player4_id.eq.${profile.id}`)
        .order('created_at', { ascending: false })
      if (data) setMatches(data)
    } catch (err) { console.error('Error fetching matches:', err) }
    finally { setLoading(false) }
  }

  // Effective status accounts for client-side expiry
  function effectiveStatus(m) {
    if (isExpiredClient(m)) return 'expired'
    return m.status
  }

  const filtered = matches.filter(m => {
    const s = effectiveStatus(m)
    if (activeTab === 'all') return true
    if (activeTab === 'confirmed') return s === 'confirmed' || s === 'approved'
    return s === activeTab
  })

  function getMyTeam(match) {
    if (match.player1_id === profile.id || match.player2_id === profile.id) return 'team1'
    return 'team2'
  }

  function getTeammates(match) {
    if (getMyTeam(match) === 'team1') {
      return match.player1_id === profile.id ? match.player2 : match.player1
    }
    return match.player3_id === profile.id ? match.player4 : match.player3
  }

  function getOpponentTeam(match) {
    if (getMyTeam(match) === 'team1') return [match.player3, match.player4].filter(Boolean)
    return [match.player1, match.player2].filter(Boolean)
  }

  function getResult(match) {
    if (!RESOLVED.includes(match.status)) return null
    const myTeam = getMyTeam(match)
    const team1Won = match.winner_id === match.player1_id || match.winner_id === match.player2_id
    if (myTeam === 'team1') return team1Won ? 'win' : 'loss'
    return team1Won ? 'loss' : 'win'
  }

  function getRatingChange(match) {
    if (!RESOLVED.includes(match.status)) return null
    if (match.player1_id === profile.id) return (match.player1_rating_after || 0) - (match.player1_rating_before || 0)
    if (match.player2_id === profile.id) return (match.player2_rating_after || 0) - (match.player2_rating_before || 0)
    if (match.player3_id === profile.id) return (match.player3_rating_after || 0) - (match.player3_rating_before || 0)
    if (match.player4_id === profile.id) return (match.player4_rating_after || 0) - (match.player4_rating_before || 0)
    return null
  }

  function formatSets(setsData, match) {
    if (!setsData || !Array.isArray(setsData)) return '-'
    const myTeam = getMyTeam(match)
    if (myTeam === 'team1') return setsData.map(s => `${s.p1}-${s.p2}`).join(', ')
    return setsData.map(s => `${s.p2}-${s.p1}`).join(', ')
  }

  function formatDate(str) {
    return new Date(str).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const statusCounts = {
    all:       matches.length,
    pending:   matches.filter(m => m.status === 'pending' && !isExpiredClient(m)).length,
    confirmed: matches.filter(m => m.status === 'confirmed' || m.status === 'approved').length,
    disputed:  matches.filter(m => m.status === 'disputed').length,
    expired:   matches.filter(m => m.status === 'expired' || isExpiredClient(m)).length,
    rejected:  matches.filter(m => m.status === 'rejected').length,
  }

  function getCardStyle(match) {
    const s = effectiveStatus(match)
    const result = getResult(match)
    if (s === 'pending')   return 'border-yellow-500/20 bg-yellow-500/5'
    if (s === 'confirmed' || s === 'approved') {
      return result === 'win'
        ? 'border-[#CCFF00]/20 bg-[#CCFF00]/5'
        : 'border-red-500/20 bg-red-500/5'
    }
    if (s === 'disputed')  return 'border-orange-500/20 bg-orange-500/5'
    if (s === 'expired')   return 'border-[#2a2a2a] bg-[#111111] opacity-50'
    return 'border-[#2a2a2a] bg-[#111111] opacity-60'
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-bold text-white">{t('matchList.title')}</h2>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key ? 'bg-[#CCFF00] text-black' : 'bg-[#111111] text-gray-400 hover:text-white'
            }`}>
            {tab.label}
            {statusCounts[tab.key] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-black/20 text-black' : 'bg-[#2a2a2a] text-gray-300'
              }`}>{statusCounts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-500">
          <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          {t('common.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-gray-500">
          <div className="text-4xl mb-2">📋</div>
          <p>{t('matchList.noMatches')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(match => {
            const s = effectiveStatus(match)
            const result = getResult(match)
            const ratingChange = getRatingChange(match)
            const teammate = getTeammates(match)
            const opponents = getOpponentTeam(match)

            return (
              <div key={match.id} className={`p-4 rounded-xl border transition-colors ${getCardStyle(match)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-0.5">{t('matchList.yourTeam')}</p>
                        <p className="text-white font-semibold text-sm truncate">
                          {t('matchList.you')}{teammate ? ` + ${teammate.full_name}` : ''}
                        </p>
                      </div>
                      <span className="text-gray-500 text-xs mt-3 flex-shrink-0">vs</span>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-xs text-gray-500 mb-0.5">{t('matchList.opponents')}</p>
                        <p className="text-white font-semibold text-sm truncate">
                          {opponents.map(o => o?.full_name?.split(' ')[0]).filter(Boolean).join(' + ')}
                        </p>
                      </div>
                    </div>
                    <p className="text-[#CCFF00] font-mono text-sm font-medium">{formatSets(match.sets_data, match)}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-gray-500">{formatDate(match.played_at)}</span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs text-gray-500">{match.match_type?.toUpperCase()}</span>
                      {match.clubs && <><span className="text-xs text-gray-600">·</span><span className="text-xs text-gray-500">{match.clubs.name}</span></>}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="text-right flex-shrink-0">
                    {s === 'pending' && (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        {t('matchList.statusPending')}
                      </span>
                    )}
                    {(s === 'confirmed' || s === 'approved') && (
                      <>
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                          result === 'win'
                            ? 'bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {result === 'win' ? t('matchList.statusWin') : t('matchList.statusLoss')}
                        </span>
                        {ratingChange !== null && ratingChange !== 0 && (
                          <p className={`text-xs font-semibold mt-1 ${ratingChange >= 0 ? 'text-[#CCFF00]' : 'text-red-400'}`}>
                            {ratingChange >= 0 ? '+' : ''}{ratingChange} ELO
                          </p>
                        )}
                        <p className="text-xs text-gray-600 mt-0.5">
                          {s === 'confirmed' ? t('matchList.statusConfirmed') : '✓ Admin'}
                        </p>
                      </>
                    )}
                    {s === 'disputed' && (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                        {t('matchList.statusDisputed')}
                      </span>
                    )}
                    {s === 'expired' && (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-[#2a2a2a] text-gray-500 border border-[#333]">
                        {t('matchList.statusExpired')}
                      </span>
                    )}
                    {s === 'rejected' && (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-[#2a2a2a] text-gray-500 border border-[#333]">
                        {t('matchList.statusRejected')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Dispute reason */}
                {s === 'disputed' && match.dispute_reason && (
                  <p className="mt-2 text-xs text-orange-400/80 italic">
                    {t('matchList.disputeReason', { reason: match.dispute_reason })}
                  </p>
                )}

                {/* Admin note */}
                {match.admin_note && !['confirmed', 'approved'].includes(s) && (
                  <p className="mt-2 text-xs text-gray-500 italic">{t('matchList.adminNote')} {match.admin_note}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
