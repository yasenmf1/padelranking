import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

const STATUS_TABS = ['Всички', 'Изчакващи', 'Одобрени', 'Отхвърлени']
const STATUS_MAP = {
  'Изчакващи': 'pending',
  'Одобрени': 'approved',
  'Отхвърлени': 'rejected'
}

export default function MatchList({ refresh }) {
  const { profile } = useAuth()
  const [matches, setMatches] = useState([])
  const [activeTab, setActiveTab] = useState('Всички')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) fetchMatches()
  }, [profile, refresh])

  async function fetchMatches() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('matches')
        .select(`
          *,
          player1:profiles!matches_player1_id_fkey(id, full_name, username),
          player2:profiles!matches_player2_id_fkey(id, full_name, username),
          player3:profiles!matches_player3_id_fkey(id, full_name, username),
          player4:profiles!matches_player4_id_fkey(id, full_name, username),
          clubs(name, city)
        `)
        .or(
          `player1_id.eq.${profile.id},player2_id.eq.${profile.id},player3_id.eq.${profile.id},player4_id.eq.${profile.id}`
        )
        .order('created_at', { ascending: false })

      if (data) setMatches(data)
    } catch (err) {
      console.error('Error fetching matches:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = matches.filter(m => {
    if (activeTab === 'Всички') return true
    return m.status === STATUS_MAP[activeTab]
  })

  // Determine which team the current user is on
  function getMyTeam(match) {
    if (match.player1_id === profile.id || match.player2_id === profile.id) return 'team1'
    return 'team2'
  }

  // Team 1 = player1 + player2, Team 2 = player3 + player4
  function getTeammates(match) {
    if (getMyTeam(match) === 'team1') {
      const teammate = match.player1_id === profile.id ? match.player2 : match.player1
      return teammate
    }
    const teammate = match.player3_id === profile.id ? match.player4 : match.player3
    return teammate
  }

  function getOpponentTeam(match) {
    if (getMyTeam(match) === 'team1') {
      return [match.player3, match.player4].filter(Boolean)
    }
    return [match.player1, match.player2].filter(Boolean)
  }

  function getResult(match) {
    if (match.status !== 'approved') return null
    const myTeam = getMyTeam(match)
    // winner_id = team1 captain (player1) if team1 won, team2 captain (player3) if team2 won
    const team1Won = match.winner_id === match.player1_id
    if (myTeam === 'team1') return team1Won ? 'win' : 'loss'
    return team1Won ? 'loss' : 'win'
  }

  function getRatingChange(match) {
    if (match.status !== 'approved') return null
    if (match.player1_id === profile.id) return (match.player1_rating_after || 0) - (match.player1_rating_before || 0)
    if (match.player2_id === profile.id) return (match.player2_rating_after || 0) - (match.player2_rating_before || 0)
    if (match.player3_id === profile.id) return (match.player3_rating_after || 0) - (match.player3_rating_before || 0)
    if (match.player4_id === profile.id) return (match.player4_rating_after || 0) - (match.player4_rating_before || 0)
    return null
  }

  // Sets formatted from my team's perspective
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
    'Всички': matches.length,
    'Изчакващи': matches.filter(m => m.status === 'pending').length,
    'Одобрени': matches.filter(m => m.status === 'approved').length,
    'Отхвърлени': matches.filter(m => m.status === 'rejected').length,
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-bold text-white">Моите мачове</h2>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === tab
                ? 'bg-[#CCFF00] text-black'
                : 'bg-[#111111] text-gray-400 hover:text-white'
            }`}
          >
            {tab}
            {statusCounts[tab] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab ? 'bg-black/20 text-black' : 'bg-[#2a2a2a] text-gray-300'
              }`}>
                {statusCounts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-10 text-center text-gray-500">
          <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          Зареждане...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-gray-500">
          <div className="text-4xl mb-2">📋</div>
          <p>Няма мачове в тази категория</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(match => {
            const result = getResult(match)
            const ratingChange = getRatingChange(match)
            const teammate = getTeammates(match)
            const opponents = getOpponentTeam(match)

            return (
              <div
                key={match.id}
                className={`p-4 rounded-xl border transition-colors ${
                  match.status === 'pending'
                    ? 'border-yellow-500/20 bg-yellow-500/5'
                    : match.status === 'approved'
                    ? result === 'win'
                      ? 'border-[#CCFF00]/20 bg-[#CCFF00]/5'
                      : 'border-red-500/20 bg-red-500/5'
                    : 'border-[#2a2a2a] bg-[#111111] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Teams summary */}
                    <div className="flex items-start gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-0.5">Твоят отбор</p>
                        <p className="text-white font-semibold text-sm truncate">Ти{teammate ? ` + ${teammate.full_name}` : ''}</p>
                      </div>
                      <span className="text-gray-500 text-xs mt-3 flex-shrink-0">vs</span>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-xs text-gray-500 mb-0.5">Противници</p>
                        <p className="text-white font-semibold text-sm truncate">
                          {opponents.map(o => o?.full_name?.split(' ')[0]).filter(Boolean).join(' + ')}
                        </p>
                      </div>
                    </div>

                    {/* Score */}
                    <p className="text-[#CCFF00] font-mono text-sm font-medium">
                      {formatSets(match.sets_data, match)}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-gray-500">{formatDate(match.played_at)}</span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs text-gray-500">{match.match_type?.toUpperCase()}</span>
                      {match.clubs && (
                        <>
                          <span className="text-xs text-gray-600">·</span>
                          <span className="text-xs text-gray-500">{match.clubs.name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status & result */}
                  <div className="text-right flex-shrink-0">
                    {match.status === 'pending' && (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        ⏳ Изчаква
                      </span>
                    )}
                    {match.status === 'approved' && (
                      <>
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                          result === 'win'
                            ? 'bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {result === 'win' ? '🏆 Победа' : '❌ Загуба'}
                        </span>
                        {ratingChange !== null && ratingChange !== 0 && (
                          <p className={`text-xs font-semibold mt-1 ${ratingChange >= 0 ? 'text-[#CCFF00]' : 'text-red-400'}`}>
                            {ratingChange >= 0 ? '+' : ''}{ratingChange} ELO
                          </p>
                        )}
                      </>
                    )}
                    {match.status === 'rejected' && (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-[#2a2a2a] text-gray-500 border border-[#333]">
                        ✗ Отхвърлен
                      </span>
                    )}
                  </div>
                </div>

                {match.admin_note && match.status !== 'approved' && (
                  <p className="mt-2 text-xs text-gray-500 italic">Бележка: {match.admin_note}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
