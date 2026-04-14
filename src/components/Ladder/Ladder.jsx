import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getLeagueIcon, getLeagueColor } from '../../lib/elo'
import { transliteratedMatch } from '../../lib/transliterate'

export default function Ladder() {
  const { profile } = useAuth()
  const { t } = useLanguage()

  function leagueName(league) {
    if (!league) return ''
    const key = `leagues.${league}`
    const translated = t(key)
    return translated === key ? league : translated
  }

  const [rankingType, setRankingType] = useState('official') // 'official' | 'provisional'
  const [players, setPlayers] = useState([])
  const [clubs, setClubs] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('all')
  const [selectedClub, setSelectedClub] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Player modal
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [playerMatches, setPlayerMatches] = useState([])
  const [playerMatchesLoading, setPlayerMatchesLoading] = useState(false)

  // Top 10 movement
  const [top10Movement, setTop10Movement] = useState([])
  const [top10Loading, setTop10Loading] = useState(false)

  const LEAGUE_TABS = [
    { key: 'all', label: t('ladder.tabs.all') },
    { key: 'Начинаещи', label: t('leagues.Начинаещи') },
    { key: 'Бронз', label: t('leagues.Бронз') },
    { key: 'Сребър', label: t('leagues.Сребър') },
    { key: 'Злато', label: t('leagues.Злато') },
  ]

  useEffect(() => { fetchClubs(); fetchPlayers() }, [])

  async function fetchClubs() {
    const { data } = await supabase.from('clubs').select('*').order('city')
    if (data) setClubs(data)
  }

  async function fetchPlayers() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*, clubs(id, name, city)')
        .order('rating', { ascending: false })
      if (data) {
        setPlayers(data)
        // Default to provisional if no official players
        const hasOfficial = data.some(p => p.approved_matches >= 5 && p.is_ranked)
        if (!hasOfficial) setRankingType('provisional')
      }
    } catch (err) {
      console.error('Error fetching ladder:', err)
    } finally {
      setLoading(false)
    }
  }

  // Split by ranking type
  const officialPlayers = players.filter(p => p.approved_matches >= 5 && p.is_ranked)
  const provisionalPlayers = players.filter(p => (p.approved_matches || 0) < 5)
  const rankPool = rankingType === 'official' ? officialPlayers : provisionalPlayers

  const filtered = rankPool.filter(p => {
    const leagueMatch = selectedLeague === 'all' || p.league === selectedLeague
    const clubMatch = !selectedClub || p.club_id === parseInt(selectedClub)
    const searchMatch = !searchQuery ||
      transliteratedMatch(p.full_name, searchQuery) ||
      transliteratedMatch(p.username, searchQuery)
    return leagueMatch && clubMatch && searchMatch
  })

  // ── Top 10 movement ────────────────────────────────────────────────────────
  const fetchTop10Movement = useCallback(async (top10Players) => {
    if (!top10Players.length) { setTop10Movement([]); return }
    setTop10Loading(true)
    const ids = top10Players.map(p => p.id)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: history } = await supabase
      .from('rankings_history')
      .select('player_id, rating, created_at')
      .in('player_id', ids)
      .lt('created_at', yesterday)
      .order('created_at', { ascending: false })

    // For each player take their most recent entry before 24h ago
    const latestByPlayer = {}
    for (const h of history || []) {
      if (!latestByPlayer[h.player_id]) {
        latestByPlayer[h.player_id] = h.rating
      }
    }

    setTop10Movement(
      top10Players.map(p => ({
        player: p,
        delta: latestByPlayer[p.id] != null ? p.rating - latestByPlayer[p.id] : null,
      }))
    )
    setTop10Loading(false)
  }, [])

  useEffect(() => {
    const top10 = filtered.slice(0, 10)
    fetchTop10Movement(top10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, selectedLeague, selectedClub, searchQuery])

  // ── Player modal ───────────────────────────────────────────────────────────
  async function handlePlayerClick(player) {
    setSelectedPlayer(player)
    setPlayerMatchesLoading(true)
    setPlayerMatches([])

    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, played_at, sets_data, match_type,
        player1_id, player2_id, player3_id, player4_id,
        player1_rating_before, player1_rating_after,
        player2_rating_before, player2_rating_after,
        player3_rating_before, player3_rating_after,
        player4_rating_before, player4_rating_after
      `)
      .eq('status', 'approved')
      .or(`player1_id.eq.${player.id},player2_id.eq.${player.id},player3_id.eq.${player.id},player4_id.eq.${player.id}`)
      .order('played_at', { ascending: false })
      .limit(5)

    if (matches?.length) {
      const allIds = [...new Set(
        matches.flatMap(m => [m.player1_id, m.player2_id, m.player3_id, m.player4_id].filter(Boolean))
      )]
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name, username').in('id', allIds)
      const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]))

      const enriched = matches.map(m => {
        const slot =
          m.player1_id === player.id ? 1 :
          m.player2_id === player.id ? 2 :
          m.player3_id === player.id ? 3 : 4
        const isTeam1 = slot === 1 || slot === 2

        const partnerId = slot === 1 ? m.player2_id : slot === 2 ? m.player1_id :
                          slot === 3 ? m.player4_id : m.player3_id
        const opp1Id = isTeam1 ? m.player3_id : m.player1_id
        const opp2Id = isTeam1 ? m.player4_id : m.player2_id

        const sets = m.sets_data || []
        let t1Sets = 0, t2Sets = 0
        for (const s of sets) {
          if (s.p1 > s.p2) t1Sets++
          else if (s.p2 > s.p1) t2Sets++
        }
        const myTeamWon = isTeam1 ? t1Sets > t2Sets : t2Sets > t1Sets
        const myScore = isTeam1 ? t1Sets : t2Sets
        const oppScore = isTeam1 ? t2Sets : t1Sets

        const rBefore = m[`player${slot}_rating_before`]
        const rAfter  = m[`player${slot}_rating_after`]
        const eloDelta = rBefore != null && rAfter != null ? rAfter - rBefore : null

        const setsStr = sets.map(s => isTeam1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`).join(', ')

        return {
          id: m.id,
          playedAt: m.played_at,
          partner: pm[partnerId],
          opp1: pm[opp1Id],
          opp2: pm[opp2Id],
          won: myTeamWon,
          score: `${myScore}-${oppScore}`,
          setsStr,
          eloDelta,
        }
      })
      setPlayerMatches(enriched)
    }
    setPlayerMatchesLoading(false)
  }

  function closeModal() {
    setSelectedPlayer(null)
    setPlayerMatches([])
  }

  function getRankColor(rank) {
    if (rank === 1) return 'text-[#ffd700]'
    if (rank === 2) return 'text-[#c0c0c0]'
    if (rank === 3) return 'text-[#cd7f32]'
    return 'text-gray-400'
  }

  function getRankBg(rank) {
    if (rank === 1) return 'bg-[#ffd700]/10'
    if (rank === 2) return 'bg-[#c0c0c0]/10'
    if (rank === 3) return 'bg-[#cd7f32]/10'
    return ''
  }

  const hasFilters = selectedLeague !== 'all' || selectedClub || searchQuery

  const todayStr = new Date().toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('ladder.title')}</h1>
        <p className="text-gray-400 mt-0.5">{t('ladder.subtitle')}</p>
      </div>

      {/* Official / Provisional tabs */}
      <div className="flex gap-2 bg-[#111111] p-1 rounded-xl border border-[#2a2a2a]">
        <button
          onClick={() => setRankingType('official')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
            rankingType === 'official'
              ? 'bg-[#CCFF00] text-black'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🏆 {t('ladder.tabOfficial')}
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${rankingType === 'official' ? 'bg-black/20 text-black' : 'bg-[#2a2a2a] text-gray-500'}`}>
            {officialPlayers.length}
          </span>
        </button>
        <button
          onClick={() => setRankingType('provisional')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
            rankingType === 'provisional'
              ? 'bg-[#CCFF00] text-black'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🌱 {t('ladder.tabProvisional')}
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${rankingType === 'provisional' ? 'bg-black/20 text-black' : 'bg-[#2a2a2a] text-gray-500'}`}>
            {provisionalPlayers.length}
          </span>
        </button>
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-600 -mt-1">
        {rankingType === 'official' ? t('ladder.officialHint') : t('ladder.provisionalHint')}
      </p>

      {/* League tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {LEAGUE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSelectedLeague(tab.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedLeague === tab.key
                ? 'bg-[#CCFF00] text-black'
                : 'bg-[#1e1e1e] text-gray-400 hover:text-white'
            }`}
          >
            {tab.key !== 'all' && getLeagueIcon(tab.key)} {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input-dark sm:max-w-xs"
          placeholder={t('ladder.searchPlaceholder')}
        />
        <select
          value={selectedClub}
          onChange={e => setSelectedClub(e.target.value)}
          className="input-dark sm:max-w-xs"
        >
          <option value="">{t('common.allClubs')}</option>
          {clubs.map(club => (
            <option key={club.id} value={club.id}>{club.name} ({club.city})</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSelectedLeague('all'); setSelectedClub(''); setSearchQuery('') }}
            className="text-sm text-gray-400 hover:text-[#CCFF00] transition-colors"
          >
            {t('common.clearFilters')}
          </button>
        )}
      </div>

      {/* Top 10 movement */}
      {!loading && filtered.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">{t('ladder.top10Title')}</h2>
            <span className="text-xs text-gray-500">{t('ladder.top10AsOf', { date: todayStr })}</span>
          </div>
          {top10Loading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {top10Movement.map(({ player, delta }, i) => {
                const globalRank = players.indexOf(player) + 1
                return (
                  <button
                    key={player.id}
                    onClick={() => handlePlayerClick(player)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a] hover:bg-[#222] transition-colors text-left"
                  >
                    <span className={`text-xs font-bold w-6 flex-shrink-0 ${getRankColor(globalRank)}`}>
                      #{globalRank}
                    </span>
                    <span className="text-sm text-white truncate flex-1">{player.full_name}</span>
                    <span className="text-sm font-bold text-[#CCFF00] flex-shrink-0">{player.rating}</span>
                    {delta === null || delta === 0 ? (
                      <span className="text-xs text-gray-500 w-12 text-right flex-shrink-0">—</span>
                    ) : delta > 0 ? (
                      <span className="text-xs font-semibold text-green-400 w-12 text-right flex-shrink-0">↑+{delta}</span>
                    ) : (
                      <span className="text-xs font-semibold text-red-400 w-12 text-right flex-shrink-0">↓{delta}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500">
            <div className="w-10 h-10 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            {t('common.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <div className="text-5xl mb-3">🏆</div>
            {rankingType === 'official' && officialPlayers.length === 0 ? (
              <>
                <p className="text-lg font-medium text-white">{t('ladder.noOfficial')}</p>
                <p className="text-sm mt-1">{t('ladder.noOfficialHint')}</p>
                <button
                  onClick={() => setRankingType('provisional')}
                  className="mt-4 px-4 py-2 bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/30 rounded-lg text-sm font-medium hover:bg-[#CCFF00]/20 transition-colors"
                >
                  🌱 {t('ladder.tabProvisional')} →
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-white">{t('ladder.noPlayers')}</p>
                <p className="text-sm mt-1">{t('ladder.noPlayersHint')}</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 w-14">{t('ladder.columns.rank')}</th>
                  <th className="text-left text-xs text-gray-500 uppercase px-4 py-3">{t('ladder.columns.player')}</th>
                  <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 hidden sm:table-cell">{t('ladder.columns.club')}</th>
                  <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">{t('ladder.columns.rating')}</th>
                  <th className="text-center text-xs text-gray-500 uppercase px-4 py-3 hidden md:table-cell">{t('ladder.columns.league')}</th>
                  <th className="text-center text-xs text-gray-500 uppercase px-4 py-3 hidden lg:table-cell">{t('ladder.columns.matches')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((player) => {
                  const globalRank = players.indexOf(player) + 1
                  const isCurrentUser = player.id === profile?.id
                  return (
                    <tr
                      key={player.id}
                      onClick={() => handlePlayerClick(player)}
                      className={`border-b border-[#1a1a1a] transition-colors cursor-pointer ${
                        isCurrentUser
                          ? 'bg-[#CCFF00]/5 border-[#CCFF00]/20 hover:bg-[#CCFF00]/10'
                          : `hover:bg-[#222] ${getRankBg(globalRank)}`
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className={`font-bold text-lg ${isCurrentUser ? 'text-[#CCFF00]' : getRankColor(globalRank)}`}>
                          {globalRank === 1 ? '🥇' : globalRank === 2 ? '🥈' : globalRank === 3 ? '🥉' : `#${globalRank}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-black font-bold text-xs flex-shrink-0 ${isCurrentUser ? 'bg-[#CCFF00]' : 'bg-[#444]'}`}>
                            {player.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className={`font-medium text-sm ${isCurrentUser ? 'text-[#CCFF00]' : 'text-white'}`}>
                              {player.full_name}
                              {isCurrentUser && <span className="ml-1 text-xs text-gray-500">{t('ladder.you')}</span>}
                            </p>
                            <p className="text-xs text-gray-500">@{player.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-gray-400">{player.clubs?.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-[#CCFF00]">{player.rating}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-center">
                        <span className="league-badge" style={{
                          backgroundColor: getLeagueColor(player.league) + '22',
                          color: getLeagueColor(player.league),
                          border: `1px solid ${getLeagueColor(player.league)}44`
                        }}>
                          {getLeagueIcon(player.league)} {leagueName(player.league)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-center">
                        <span className="text-sm text-gray-400">{player.approved_matches || 0}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-600 text-center">
        {t('ladder.showing', { filtered: filtered.length, total: rankPool.length })}
      </p>

      {/* Player modal */}
      {selectedPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#CCFF00] flex items-center justify-center text-black font-bold text-sm">
                  {selectedPlayer.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-white">{selectedPlayer.full_name}</p>
                  <p className="text-xs text-gray-500">
                    <span className="text-[#CCFF00] font-bold">{selectedPlayer.rating}</span>
                    {' '}·{' '}
                    {leagueName(selectedPlayer.league)}
                    {' '}·{' '}
                    {selectedPlayer.approved_matches || 0} {t('ladder.columns.matches').toLowerCase()}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-500 hover:text-white transition-colors text-xl leading-none p-1"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-3">{t('ladder.playerModal.title')}</p>

              {playerMatchesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : playerMatches.length === 0 ? (
                <p className="text-center text-gray-500 py-8">{t('ladder.playerModal.noMatches')}</p>
              ) : (
                <div className="space-y-3">
                  {playerMatches.map(m => (
                    <div
                      key={m.id}
                      className={`rounded-xl p-3.5 border ${
                        m.won
                          ? 'bg-green-500/5 border-green-500/20'
                          : 'bg-red-500/5 border-red-500/20'
                      }`}
                    >
                      {/* Top row: date + win/loss badge + elo */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">
                          {new Date(m.playedAt).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        <div className="flex items-center gap-2">
                          {m.eloDelta !== null && (
                            <span className={`text-xs font-semibold ${m.eloDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {m.eloDelta >= 0 ? `↑+${m.eloDelta}` : `↓${m.eloDelta}`}
                            </span>
                          )}
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            m.won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {m.won ? t('ladder.playerModal.win') : t('ladder.playerModal.loss')}
                          </span>
                        </div>
                      </div>

                      {/* Score */}
                      <div className="flex items-baseline gap-2 mb-1.5">
                        <span className={`text-2xl font-bold ${m.won ? 'text-green-400' : 'text-red-400'}`}>
                          {m.score}
                        </span>
                        {m.setsStr && (
                          <span className="text-xs text-gray-500">({m.setsStr})</span>
                        )}
                      </div>

                      {/* Players */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-gray-500 w-16 flex-shrink-0">{t('ladder.playerModal.partner')}:</span>
                          <span className="text-white">{m.partner?.full_name || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-gray-500 w-16 flex-shrink-0">{t('ladder.playerModal.vs')}:</span>
                          <span className="text-gray-300">
                            {m.opp1?.full_name || '—'} &amp; {m.opp2?.full_name || '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
