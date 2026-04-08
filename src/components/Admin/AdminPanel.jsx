import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { calculateElo, getLeague } from '../../lib/elo'

const TABS = ['Мачове', 'Играчи', 'Статистика']

const SA_LABELS = [
  'Въздушна топка от лоб',
  'Ниска топка при краката',
  'Контра-лоб над вас',
  'Излизане от защита',
  'Bandeja vs Smash',
  'Smash X3/X4',
  'Позиция при воле',
  'Chiquita',
  'Втори сервис',
  'Ретур в стъклото',
]

function getSAColor(score) {
  if (score >= 70) return '#CCFF00'
  if (score >= 40) return '#f59e0b'
  return '#9ca3af'
}

export default function AdminPanel() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Мачове')
  const [pendingMatches, setPendingMatches] = useState([])
  const [players, setPlayers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (activeTab === 'Мачове') fetchPendingMatches()
    else if (activeTab === 'Играчи') fetchPlayers()
    else if (activeTab === 'Статистика') fetchStats()
  }, [activeTab])

  async function fetchPendingMatches() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('matches')
        .select(`
          *,
          player1:profiles!matches_player1_id_fkey(id, full_name, username, rating, approved_matches),
          player2:profiles!matches_player2_id_fkey(id, full_name, username, rating, approved_matches),
          player3:profiles!matches_player3_id_fkey(id, full_name, username, rating, approved_matches),
          player4:profiles!matches_player4_id_fkey(id, full_name, username, rating, approved_matches),
          clubs(name, city)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (data) setPendingMatches(data)
    } catch (err) {
      setError('Грешка при зареждане.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchPlayers() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*, clubs(name, city)')
        .order('rating', { ascending: false })
      if (data) setPlayers(data)
    } catch (err) {
      setError('Грешка при зареждане.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    setLoading(true)
    try {
      const [{ count: totalPlayers }, { count: totalMatches }, { data: matchesByLeague }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('profiles').select('league')
      ])

      const leagueCounts = {}
      if (matchesByLeague) {
        for (const p of matchesByLeague) {
          leagueCounts[p.league] = (leagueCounts[p.league] || 0) + 1
        }
      }

      const { count: rankedCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_ranked', true)
      const { count: pendingCount } = await supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'pending')

      setStats({ totalPlayers, totalMatches, leagueCounts, rankedCount, pendingCount })
    } catch (err) {
      setError('Грешка при зареждане.')
    } finally {
      setLoading(false)
    }
  }

  async function approveMatch(match) {
    setActionLoading(p => ({ ...p, [match.id]: 'approving' }))
    setError('')
    try {
      const setsData = match.sets_data || []
      let team1Wins = 0, team2Wins = 0
      for (const s of setsData) {
        if (s.p1 > s.p2) team1Wins++
        else if (s.p2 > s.p1) team2Wins++
      }

      // Doubles: ELO calculated using team averages, delta applied to each player
      const team1Avg = Math.round(((match.player1?.rating || 500) + (match.player2?.rating || 500)) / 2)
      const team2Avg = Math.round(((match.player3?.rating || 500) + (match.player4?.rating || 500)) / 2)

      const { newRatingA: newTeam1Avg, newRatingB: newTeam2Avg } = calculateElo(
        team1Avg, team2Avg, team1Wins, team2Wins, match.match_type
      )

      const team1Delta = newTeam1Avg - team1Avg
      const team2Delta = newTeam2Avg - team2Avg

      const newP1Rating = Math.max(0, (match.player1?.rating || 500) + team1Delta)
      const newP2Rating = Math.max(0, (match.player2?.rating || 500) + team1Delta)
      const newP3Rating = Math.max(0, (match.player3?.rating || 500) + team2Delta)
      const newP4Rating = Math.max(0, (match.player4?.rating || 500) + team2Delta)

      const newP1League = getLeague(newP1Rating)
      const newP2League = getLeague(newP2Rating)
      const newP3League = getLeague(newP3Rating)
      const newP4League = getLeague(newP4Rating)

      const newP1Matches = (match.player1?.approved_matches || 0) + 1
      const newP2Matches = (match.player2?.approved_matches || 0) + 1
      const newP3Matches = (match.player3?.approved_matches || 0) + 1
      const newP4Matches = (match.player4?.approved_matches || 0) + 1

      // Update match record
      const { error: matchError } = await supabase
        .from('matches')
        .update({
          status: 'approved',
          player1_rating_after: newP1Rating,
          player2_rating_after: newP2Rating,
          player3_rating_after: newP3Rating,
          player4_rating_after: newP4Rating,
          reviewed_by: profile.id
        })
        .eq('id', match.id)
      if (matchError) throw matchError

      // Update all 4 player profiles
      const updates = [
        { id: match.player1_id, rating: newP1Rating, league: newP1League, approved_matches: newP1Matches },
        { id: match.player2_id, rating: newP2Rating, league: newP2League, approved_matches: newP2Matches },
        { id: match.player3_id, rating: newP3Rating, league: newP3League, approved_matches: newP3Matches },
        { id: match.player4_id, rating: newP4Rating, league: newP4League, approved_matches: newP4Matches },
      ].filter(u => u.id)

      for (const u of updates) {
        const { error: pErr } = await supabase
          .from('profiles')
          .update({
            rating: u.rating,
            league: u.league,
            approved_matches: u.approved_matches,
            is_ranked: u.approved_matches >= 5,
            updated_at: new Date().toISOString()
          })
          .eq('id', u.id)
        if (pErr) throw pErr
      }

      // Save rankings history for all 4 players
      const historyRows = [
        match.player1_id && { player_id: match.player1_id, rating: newP1Rating, league: newP1League, match_id: match.id },
        match.player2_id && { player_id: match.player2_id, rating: newP2Rating, league: newP2League, match_id: match.id },
        match.player3_id && { player_id: match.player3_id, rating: newP3Rating, league: newP3League, match_id: match.id },
        match.player4_id && { player_id: match.player4_id, rating: newP4Rating, league: newP4League, match_id: match.id },
      ].filter(Boolean)
      await supabase.from('rankings_history').insert(historyRows)

      setSuccess(
        `Мачът е одобрен! Отбор 1: ${team1Avg} → ${newTeam1Avg} (${team1Delta >= 0 ? '+' : ''}${team1Delta}) | Отбор 2: ${team2Avg} → ${newTeam2Avg} (${team2Delta >= 0 ? '+' : ''}${team2Delta})`
      )
      setTimeout(() => setSuccess(''), 5000)
      await fetchPendingMatches()
    } catch (err) {
      setError(err.message || 'Грешка при одобряване.')
    } finally {
      setActionLoading(p => ({ ...p, [match.id]: null }))
    }
  }

  async function rejectMatch(match, note = '') {
    setActionLoading(p => ({ ...p, [match.id]: 'rejecting' }))
    setError('')
    try {
      const { error } = await supabase
        .from('matches')
        .update({ status: 'rejected', reviewed_by: profile.id, admin_note: note || null })
        .eq('id', match.id)
      if (error) throw error
      setSuccess('Мачът е отхвърлен.')
      setTimeout(() => setSuccess(''), 3000)
      await fetchPendingMatches()
    } catch (err) {
      setError(err.message || 'Грешка при отхвърляне.')
    } finally {
      setActionLoading(p => ({ ...p, [match.id]: null }))
    }
  }

  async function toggleAdmin(player) {
    try {
      await supabase.from('profiles').update({ is_admin: !player.is_admin }).eq('id', player.id)
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, is_admin: !p.is_admin } : p))
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleRanked(player) {
    try {
      await supabase.from('profiles').update({ is_ranked: !player.is_ranked }).eq('id', player.id)
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, is_ranked: !p.is_ranked } : p))
    } catch (err) {
      setError(err.message)
    }
  }

  function formatDate(str) {
    return new Date(str).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function formatSets(setsData) {
    if (!setsData || !Array.isArray(setsData)) return '-'
    return setsData.map(s => `${s.p1}-${s.p2}`).join(', ')
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <span className="league-badge bg-red-500/20 text-red-400 border border-red-500/30">Admin</span>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-[#CCFF00]/10 border border-[#CCFF00]/30 rounded-lg text-[#CCFF00] text-sm">{success}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#2a2a2a]">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[#CCFF00] text-[#CCFF00]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* --- Tab: Pending Matches --- */}
      {activeTab === 'Мачове' && (
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">{pendingMatches.length} мача чакат одобрение</p>

          {loading ? (
            <div className="py-10 text-center text-gray-500">
              <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              Зареждане...
            </div>
          ) : pendingMatches.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-white font-medium">Няма мачове за одобрение</p>
              <p className="text-gray-400 text-sm mt-1">Всички мачове са прегледани</p>
            </div>
          ) : (
            pendingMatches.map(match => {
              const setsData = match.sets_data || []
              let p1Wins = 0, p2Wins = 0
              for (const s of setsData) {
                if (s.p1 > s.p2) p1Wins++
                else if (s.p2 > s.p1) p2Wins++
              }
              const winnerPlayer = match.winner_id === match.player1_id ? match.player1 : match.player2

              return (
                <div key={match.id} className="card border-yellow-500/20 bg-yellow-500/5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-500">#{match.id}</span>
                        <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-0.5 rounded-full">Изчакващ</span>
                        <span className="text-xs text-gray-500">{match.match_type?.toUpperCase()}</span>
                      </div>

                      {/* Teams */}
                      <div className="flex items-center gap-3 mb-3">
                        {/* Team 1 */}
                        <div className="text-left flex-1">
                          <p className="text-xs text-gray-500 mb-0.5">Отбор 1</p>
                          <p className="text-white font-semibold text-sm leading-tight">{match.player1?.full_name}</p>
                          <p className="text-white font-semibold text-sm leading-tight">{match.player2?.full_name}</p>
                          <p className="text-[#CCFF00] text-xs mt-0.5">
                            ⌀ {Math.round(((match.player1?.rating || 0) + (match.player2?.rating || 0)) / 2)} ELO
                          </p>
                        </div>
                        {/* Score */}
                        <div className="text-center flex-shrink-0">
                          <p className="text-gray-400 font-mono text-lg font-bold">{p1Wins} - {p2Wins}</p>
                          <p className="text-gray-600 text-xs">{formatSets(setsData)}</p>
                        </div>
                        {/* Team 2 */}
                        <div className="text-right flex-1">
                          <p className="text-xs text-gray-500 mb-0.5">Отбор 2</p>
                          <p className="text-white font-semibold text-sm leading-tight">{match.player3?.full_name}</p>
                          <p className="text-white font-semibold text-sm leading-tight">{match.player4?.full_name}</p>
                          <p className="text-[#CCFF00] text-xs mt-0.5">
                            ⌀ {Math.round(((match.player3?.rating || 0) + (match.player4?.rating || 0)) / 2)} ELO
                          </p>
                        </div>
                      </div>

                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p>Победител по данни: <span className="text-white">{winnerPlayer?.full_name}</span></p>
                        {match.clubs && <p>Клуб: {match.clubs.name}</p>}
                        <p>Изиграно: {formatDate(match.played_at)}</p>
                        <p>Записано: {formatDate(match.created_at)}</p>
                        {match.admin_note && <p>Бележка: <span className="text-gray-300">{match.admin_note}</span></p>}
                      </div>
                    </div>

                    <div className="flex sm:flex-col gap-2">
                      <button
                        onClick={() => approveMatch(match)}
                        disabled={!!actionLoading[match.id]}
                        className="flex-1 sm:flex-none px-4 py-2 bg-[#CCFF00] text-black text-sm font-bold rounded-lg hover:bg-[#bbee00] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {actionLoading[match.id] === 'approving' ? (
                          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        ) : '✓ Одобри'}
                      </button>
                      <button
                        onClick={() => rejectMatch(match)}
                        disabled={!!actionLoading[match.id]}
                        className="flex-1 sm:flex-none px-4 py-2 bg-red-500/20 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 border border-red-500/30 flex items-center justify-center gap-1.5"
                      >
                        {actionLoading[match.id] === 'rejecting' ? (
                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                        ) : '✗ Отхвърли'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* --- Tab: Players --- */}
      {activeTab === 'Играчи' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm">{players.length} регистрирани играчи</p>

          {loading ? (
            <div className="py-10 text-center text-gray-500">
              <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              Зареждане...
            </div>
          ) : (
            <div className="overflow-x-auto card p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a]">
                    <th className="text-left text-xs text-gray-500 uppercase px-4 py-3">Играч</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">Рейтинг</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">Лига</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">Мачове</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">Тактика</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">Ranked</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(player => (
                    <>
                      <tr
                        key={player.id}
                        className="border-b border-[#1a1a1a] hover:bg-[#222] transition-colors cursor-pointer"
                        onClick={() => setExpandedPlayer(expandedPlayer === player.id ? null : player.id)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{player.full_name}</p>
                          <p className="text-gray-500 text-xs">@{player.username} · {player.email}</p>
                          {player.clubs && <p className="text-gray-600 text-xs">{player.clubs.name}</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-[#CCFF00] font-bold">{player.rating}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-gray-300">{player.league}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-gray-400">{player.approved_matches || 0}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {player.self_assessment_score != null ? (
                            <span
                              className="font-bold text-sm"
                              style={{ color: getSAColor(player.self_assessment_score) }}
                            >
                              {player.self_assessment_score}%
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => toggleRanked(player)}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                              player.is_ranked
                                ? 'bg-[#CCFF00]/20 text-[#CCFF00] hover:bg-red-500/20 hover:text-red-400'
                                : 'bg-[#2a2a2a] text-gray-500 hover:bg-[#CCFF00]/20 hover:text-[#CCFF00]'
                            }`}
                          >
                            {player.is_ranked ? '✓ Да' : '✗ Не'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => toggleAdmin(player)}
                            disabled={player.id === profile?.id}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                              player.is_admin
                                ? 'bg-red-500/20 text-red-400 hover:bg-[#2a2a2a] hover:text-gray-400'
                                : 'bg-[#2a2a2a] text-gray-500 hover:bg-red-500/20 hover:text-red-400'
                            }`}
                          >
                            {player.is_admin ? '✓ Admin' : '✗ Не'}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable self-assessment details */}
                      {expandedPlayer === player.id && (
                        <tr key={`${player.id}-sa`} className="border-b border-[#1a1a1a] bg-[#0f0f0f]">
                          <td colSpan={7} className="px-4 py-4">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                              Тактическа самооценка
                            </p>
                            {player.self_assessment_data ? (
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {SA_LABELS.map((label, idx) => {
                                  const key = `q${idx + 1}`
                                  const answer = player.self_assessment_data[key]
                                  const color = answer === 'В' ? '#CCFF00' : answer === 'Б' ? '#f59e0b' : '#9ca3af'
                                  return (
                                    <div key={key} className="bg-[#1a1a1a] rounded-lg p-2.5">
                                      <p className="text-gray-600 text-xs mb-1 leading-tight">{idx + 1}. {label}</p>
                                      <span
                                        className="text-lg font-black"
                                        style={{ color }}
                                      >
                                        {answer || '—'}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="text-gray-600 text-sm">Не е попълнена самооценка.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- Tab: Stats --- */}
      {activeTab === 'Статистика' && (
        <div className="space-y-5">
          {loading ? (
            <div className="py-10 text-center text-gray-500">
              <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              Зареждане...
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Общо играчи', value: stats.totalPlayers, icon: '👥' },
                  { label: 'Ranked играчи', value: stats.rankedCount, icon: '🏆' },
                  { label: 'Одобрени мачове', value: stats.totalMatches, icon: '✅' },
                  { label: 'Чакащи мачове', value: stats.pendingCount, icon: '⏳' },
                ].map(s => (
                  <div key={s.label} className="card text-center">
                    <div className="text-3xl mb-1">{s.icon}</div>
                    <div className="text-3xl font-black text-[#CCFF00]">{s.value || 0}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3 className="text-base font-bold text-white mb-4">Играчи по лига</h3>
                {['Начинаещи', 'Бронз', 'Сребър', 'Злато'].map(league => {
                  const count = stats.leagueCounts?.[league] || 0
                  const total = stats.totalPlayers || 1
                  const pct = Math.round((count / total) * 100)
                  const colors = { 'Начинаещи': '#6b7280', 'Бронз': '#cd7f32', 'Сребър': '#c0c0c0', 'Злато': '#ffd700' }
                  return (
                    <div key={league} className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300">{league}</span>
                        <span className="text-gray-400">{count} играчи ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: colors[league] }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-gray-500">Няма данни</p>
          )}
        </div>
      )}
    </div>
  )
}
