import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLeagueIcon, getLeagueColor } from '../../lib/elo'

const LEAGUE_TABS = ['Всички', 'Начинаещи', 'Бронз', 'Сребър', 'Злато']

export default function Ladder() {
  const { profile } = useAuth()
  const [players, setPlayers] = useState([])
  const [clubs, setClubs] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('Всички')
  const [selectedClub, setSelectedClub] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchClubs()
    fetchPlayers()
  }, [])

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
        .eq('is_ranked', true)
        .not('self_assessment_score', 'is', null)
        .order('rating', { ascending: false })

      if (data) setPlayers(data)
    } catch (err) {
      console.error('Error fetching ladder:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = players.filter(p => {
    const leagueMatch = selectedLeague === 'Всички' || p.league === selectedLeague
    const clubMatch = !selectedClub || p.club_id === parseInt(selectedClub)
    const searchMatch = !searchQuery ||
      p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.username?.toLowerCase().includes(searchQuery.toLowerCase())
    return leagueMatch && clubMatch && searchMatch
  })

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

  function getWinRate(p) {
    if (!p.approved_matches || p.approved_matches === 0) return '0%'
    return '—'
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Класация</h1>
        <p className="text-gray-400 mt-0.5">Ranked играчи с минимум 5 одобрени мача</p>
      </div>

      {/* League tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {LEAGUE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedLeague(tab)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedLeague === tab
                ? 'bg-[#CCFF00] text-black'
                : 'bg-[#1e1e1e] text-gray-400 hover:text-white'
            }`}
          >
            {tab !== 'Всички' && getLeagueIcon(tab)} {tab}
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
          placeholder="Търсене по име..."
        />
        <select
          value={selectedClub}
          onChange={e => setSelectedClub(e.target.value)}
          className="input-dark sm:max-w-xs"
        >
          <option value="">Всички клубове</option>
          {clubs.map(club => (
            <option key={club.id} value={club.id}>
              {club.name} ({club.city})
            </option>
          ))}
        </select>
        {(selectedLeague !== 'Всички' || selectedClub || searchQuery) && (
          <button
            onClick={() => { setSelectedLeague('Всички'); setSelectedClub(''); setSearchQuery('') }}
            className="text-sm text-gray-400 hover:text-[#CCFF00] transition-colors"
          >
            Изчисти филтри
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500">
            <div className="w-10 h-10 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Зареждане на класацията...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <div className="text-5xl mb-3">🏆</div>
            <p className="text-lg font-medium text-white">Няма играчи в тази категория</p>
            <p className="text-sm mt-1">Опитайте с различни филтри</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 w-14">#</th>
                  <th className="text-left text-xs text-gray-500 uppercase px-4 py-3">Играч</th>
                  <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 hidden sm:table-cell">Клуб</th>
                  <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">Рейтинг</th>
                  <th className="text-center text-xs text-gray-500 uppercase px-4 py-3 hidden md:table-cell">Лига</th>
                  <th className="text-center text-xs text-gray-500 uppercase px-4 py-3 hidden lg:table-cell">Мачове</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((player, idx) => {
                  const globalRank = players.indexOf(player) + 1
                  const isCurrentUser = player.id === profile?.id
                  return (
                    <tr
                      key={player.id}
                      className={`border-b border-[#1a1a1a] transition-colors ${
                        isCurrentUser
                          ? 'bg-[#CCFF00]/5 border-[#CCFF00]/20'
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
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-black font-bold text-xs flex-shrink-0 ${
                            isCurrentUser ? 'bg-[#CCFF00]' : 'bg-[#444]'
                          }`}>
                            {player.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className={`font-medium text-sm ${isCurrentUser ? 'text-[#CCFF00]' : 'text-white'}`}>
                              {player.full_name}
                              {isCurrentUser && <span className="ml-1 text-xs text-gray-500">(Вие)</span>}
                            </p>
                            <p className="text-xs text-gray-500">@{player.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-gray-400">
                          {player.clubs?.name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-[#CCFF00]">{player.rating}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-center">
                        <span
                          className="league-badge"
                          style={{
                            backgroundColor: getLeagueColor(player.league) + '22',
                            color: getLeagueColor(player.league),
                            border: `1px solid ${getLeagueColor(player.league)}44`
                          }}
                        >
                          {getLeagueIcon(player.league)} {player.league}
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
        Показани {filtered.length} от {players.length} ranked играчи
      </p>
    </div>
  )
}
