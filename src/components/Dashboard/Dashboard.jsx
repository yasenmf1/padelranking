import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLeagueIcon, getLeagueColor, getLeagueProgress, getLeague } from '../../lib/elo'

export default function Dashboard() {
  const { profile } = useAuth()
  const [recentMatches, setRecentMatches] = useState([])
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) {
      fetchData()
    }
  }, [profile])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: matchData } = await supabase
        .from('matches')
        .select(`
          *,
          player1:profiles!matches_player1_id_fkey(id, full_name, username),
          player2:profiles!matches_player2_id_fkey(id, full_name, username),
          clubs(name, city)
        `)
        .or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`)
        .eq('status', 'approved')
        .order('played_at', { ascending: false })
        .limit(5)

      if (matchData) {
        setRecentMatches(matchData)
        const wins = matchData.filter(m => m.winner_id === profile.id).length
        setStats({
          total: profile.approved_matches || 0,
          wins,
          losses: (profile.approved_matches || 0) - wins
        })
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!profile) return null

  const league = profile.league || getLeague(profile.rating || 500)
  const rating = profile.rating || 500
  const progress = getLeagueProgress(rating)
  const leagueColor = getLeagueColor(league)
  const leagueIcon = getLeagueIcon(league)
  const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0

  const leagueNextMap = {
    'Начинаещи': { next: 'Бронз', target: 700 },
    'Бронз': { next: 'Сребър', target: 1000 },
    'Сребър': { next: 'Злато', target: 1300 },
    'Злато': { next: null, target: null }
  }
  const nextLeague = leagueNextMap[league]

  function getOpponent(match) {
    return match.player1_id === profile.id ? match.player2 : match.player1
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })
  }

  function getMatchResult(match) {
    if (match.winner_id === profile.id) return { label: 'Победа', cls: 'text-[#CCFF00]' }
    return { label: 'Загуба', cls: 'text-red-400' }
  }

  function formatSets(setsData) {
    if (!setsData || !Array.isArray(setsData)) return '-'
    return setsData.map(s => `${s.p1}-${s.p2}`).join(', ')
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Здравей, <span className="text-[#CCFF00]">{profile.full_name?.split(' ')[0]}</span>! 👋
          </h1>
          <p className="text-gray-400 mt-0.5">@{profile.username}</p>
        </div>
        <Link to="/matches" className="btn-neon hidden sm:flex items-center gap-2">
          <span>+</span> Запиши мач
        </Link>
      </div>

      {/* Rating + League card */}
      <div className="card neon-glow">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-gray-400 text-sm mb-1">Текущ рейтинг</p>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-black text-[#CCFF00] neon-text">{rating}</span>
              <span className="text-gray-400 text-sm">ELO</span>
            </div>
          </div>
          <div className="text-right">
            <div
              className="league-badge text-lg px-4 py-2"
              style={{ backgroundColor: leagueColor + '22', color: leagueColor, border: `1px solid ${leagueColor}55` }}
            >
              {leagueIcon} {league}
            </div>
            {profile.is_ranked && (
              <p className="text-xs text-gray-500 mt-2">Ranked Player</p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {nextLeague.next && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>{league}</span>
              <span>{nextLeague.next} ({nextLeague.target} ELO)</span>
            </div>
            <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, backgroundColor: leagueColor }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              {nextLeague.target - rating} точки до {nextLeague.next}
            </p>
          </div>
        )}
        {!nextLeague.next && (
          <div className="mt-4 p-3 bg-[#ffd700]/10 border border-[#ffd700]/30 rounded-lg text-center">
            <p className="text-[#ffd700] font-semibold text-sm">🏆 Достигнахте максималната лига!</p>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Общо мачове', value: stats.total, icon: '🎾' },
          { label: 'Победи', value: stats.wins, icon: '🏆' },
          { label: 'Загуби', value: stats.losses, icon: '❌' },
          { label: 'Win Rate', value: `${winRate}%`, icon: '📊' },
        ].map(stat => (
          <div key={stat.label} className="card text-center">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Ranked info */}
      {!profile.is_ranked && (
        <div className="card border-[#CCFF00]/30 bg-[#CCFF00]/5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <p className="text-white font-semibold">Как да влезете в класацията?</p>
              <p className="text-gray-400 text-sm mt-1">
                Трябват ви минимум <span className="text-[#CCFF00] font-semibold">5 одобрени мача</span>, за да се появите в официалната класация.
                Имате <span className="text-white font-semibold">{profile.approved_matches || 0}</span> от 5 необходими.
              </p>
              <Link to="/matches" className="mt-3 inline-block text-sm text-[#CCFF00] hover:underline">
                Запишете мач →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Recent matches */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Последни мачове</h2>
          <Link to="/matches" className="text-sm text-[#CCFF00] hover:underline">Виж всички</Link>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-500">
            <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Зареждане...
          </div>
        ) : recentMatches.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <div className="text-4xl mb-2">🎾</div>
            <p>Нямате одобрени мачове все още.</p>
            <Link to="/matches" className="mt-3 inline-block btn-neon text-sm">
              Запишете първия си мач
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentMatches.map(match => {
              const opponent = getOpponent(match)
              const result = getMatchResult(match)
              return (
                <div key={match.id} className="flex items-center justify-between p-3 bg-[#111111] rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-8 rounded-full ${match.winner_id === profile.id ? 'bg-[#CCFF00]' : 'bg-red-500'}`}></div>
                    <div>
                      <p className="text-white text-sm font-medium">{opponent?.full_name || 'Непознат'}</p>
                      <p className="text-gray-500 text-xs">{formatSets(match.sets_data)} · {formatDate(match.played_at)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${result.cls}`}>{result.label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{match.match_type?.toUpperCase()}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Mobile CTA */}
      <div className="sm:hidden">
        <Link to="/matches" className="btn-neon w-full flex items-center justify-center gap-2 text-base py-3">
          <span>+</span> Запиши мач
        </Link>
      </div>
    </div>
  )
}
