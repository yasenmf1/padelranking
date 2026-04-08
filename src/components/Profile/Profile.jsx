import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getLeagueIcon, getLeagueColor, getLeagueProgress } from '../../lib/elo'

// score = raw points (10-100)
function getSALevel(score) {
  if (score >= 86) return { label: 'Злато', color: '#ffd700', barColor: 'bg-[#ffd700]' }
  if (score >= 61) return { label: 'Сребър', color: '#c0c0c0', barColor: 'bg-[#c0c0c0]' }
  if (score >= 26) return { label: 'Бронз', color: '#cd7f32', barColor: 'bg-[#cd7f32]' }
  return { label: 'Начинаещи', color: '#9ca3af', barColor: 'bg-gray-500' }
}

export default function Profile() {
  const { profile, refreshProfile } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [clubs, setClubs] = useState([])
  const [editing, setEditing] = useState(false)
  const [showSADetails, setShowSADetails] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', club_id: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [ratingHistory, setRatingHistory] = useState([])
  const [matchStats, setMatchStats] = useState({ total: 0, wins: 0, losses: 0 })

  useEffect(() => {
    fetchClubs()
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        club_id: profile.club_id || ''
      })
      fetchRatingHistory()
      fetchMatchStats()
    }
  }, [profile])

  async function fetchClubs() {
    const { data } = await supabase.from('clubs').select('*').order('city')
    if (data) setClubs(data)
  }

  async function fetchRatingHistory() {
    const { data } = await supabase
      .from('rankings_history')
      .select('rating, league, created_at')
      .eq('player_id', profile.id)
      .order('created_at', { ascending: true })
      .limit(20)
    if (data) setRatingHistory(data)
  }

  async function fetchMatchStats() {
    const { data } = await supabase
      .from('matches')
      .select('winner_id, status')
      .or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`)
      .eq('status', 'approved')

    if (data) {
      const wins = data.filter(m => m.winner_id === profile.id).length
      setMatchStats({ total: data.length, wins, losses: data.length - wins })
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaveError('')
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name,
          phone: form.phone,
          club_id: form.club_id ? parseInt(form.club_id) : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (error) throw error
      await refreshProfile()
      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err.message || t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  function getInitials(name) {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  if (!profile) return null

  const league = profile.league || 'Начинаещи'
  const rating = profile.rating || 500
  const progress = getLeagueProgress(rating)
  const leagueColor = getLeagueColor(league)
  const winRate = matchStats.total > 0 ? Math.round((matchStats.wins / matchStats.total) * 100) : 0

  const maxRating = ratingHistory.length > 0
    ? Math.max(...ratingHistory.map(h => h.rating), rating)
    : rating + 100
  const minRating = ratingHistory.length > 0
    ? Math.min(...ratingHistory.map(h => h.rating), rating)
    : rating - 100

  const saQuestions = t('profile.saQuestions')

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">{t('profile.title')}</h1>

      {saveSuccess && (
        <div className="p-3 bg-[#CCFF00]/10 border border-[#CCFF00]/30 rounded-lg text-[#CCFF00] text-sm">
          {t('profile.savedSuccess')}
        </div>
      )}

      {profile.self_assessment_score == null && (
        <div className="flex items-center justify-between gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-amber-400 text-sm">⚠️ {t('profile.noBanner')}</p>
          <Link to="/self-assessment" className="text-amber-400 font-semibold text-sm whitespace-nowrap hover:text-amber-300 transition-colors">
            {t('profile.fillNow')}
          </Link>
        </div>
      )}

      {/* Profile card */}
      <div className="card">
        <div className="flex items-start gap-4 mb-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-black font-black text-xl flex-shrink-0"
            style={{ backgroundColor: '#CCFF00' }}
          >
            {getInitials(profile.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white">{profile.full_name}</h2>
            <p className="text-gray-400">@{profile.username}</p>
            <p className="text-gray-500 text-sm mt-0.5">{profile.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="league-badge"
                style={{ backgroundColor: leagueColor + '22', color: leagueColor, border: `1px solid ${leagueColor}44` }}
              >
                {getLeagueIcon(league)} {t(`leagues.${league}`)}
              </span>
              {profile.is_ranked && (
                <span className="league-badge bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/30">
                  ✓ {t('common.ranked')}
                </span>
              )}
              {profile.is_admin && (
                <span className="league-badge bg-red-500/20 text-red-400 border border-red-500/30">
                  {t('common.admin')}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-[#CCFF00]">{rating}</p>
            <p className="text-xs text-gray-500">ELO</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>{t('dashboard.leagueProgress')}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: leagueColor }}
            ></div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="text-center p-3 bg-[#111111] rounded-lg">
            <p className="text-xl font-bold text-white">{matchStats.total}</p>
            <p className="text-xs text-gray-500">{t('profile.stats.matches')}</p>
          </div>
          <div className="text-center p-3 bg-[#111111] rounded-lg">
            <p className="text-xl font-bold text-[#CCFF00]">{matchStats.wins}</p>
            <p className="text-xs text-gray-500">{t('profile.stats.wins')}</p>
          </div>
          <div className="text-center p-3 bg-[#111111] rounded-lg">
            <p className="text-xl font-bold text-white">{winRate}%</p>
            <p className="text-xs text-gray-500">{t('profile.stats.winRate')}</p>
          </div>
        </div>

        {/* Info */}
        <div className="space-y-2 text-sm">
          {profile.clubs && (
            <div className="flex justify-between">
              <span className="text-gray-400">{t('profile.clubLabel')}</span>
              <span className="text-white">{profile.clubs.name}</span>
            </div>
          )}
          {profile.phone && (
            <div className="flex justify-between">
              <span className="text-gray-400">{t('profile.phoneLabel')}</span>
              <span className="text-white">{profile.phone}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">{t('profile.memberSince')}</span>
            <span className="text-white">{new Date(profile.created_at).toLocaleDateString('bg-BG')}</span>
          </div>
        </div>

        <button
          onClick={() => setEditing(!editing)}
          className="mt-4 btn-outline w-full"
        >
          {editing ? t('profile.cancelBtn') : t('profile.editBtn')}
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="card">
          <h3 className="text-base font-bold text-white mb-4">{t('profile.editTitle')}</h3>
          {saveError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {saveError}
            </div>
          )}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('profile.fullNameLabel')}</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                className="input-dark"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('profile.phoneLabel2')}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="input-dark"
                placeholder="+359 88 888 8888"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('profile.clubLabel2')}</label>
              <select
                value={form.club_id}
                onChange={e => setForm(p => ({ ...p, club_id: e.target.value }))}
                className="input-dark"
              >
                <option value="">{t('common.noClub')}</option>
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.city})</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-neon flex-1 flex items-center justify-center gap-2">
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>{t('profile.saving')}</>
                ) : t('profile.saveBtn')}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-outline flex-1">
                {t('profile.cancelBtn')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rating history chart */}
      {ratingHistory.length > 0 && (
        <div className="card">
          <h3 className="text-base font-bold text-white mb-4">{t('profile.ratingHistory')}</h3>
          <div className="relative">
            <div className="flex items-end gap-1 h-32">
              {ratingHistory.map((entry, idx) => {
                const heightPct = maxRating === minRating
                  ? 50
                  : ((entry.rating - minRating) / (maxRating - minRating)) * 100
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-0.5 group relative">
                    <div
                      className="w-full rounded-t bg-[#CCFF00]/40 hover:bg-[#CCFF00] transition-colors cursor-pointer"
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                    >
                    </div>
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white whitespace-nowrap z-10">
                      {entry.rating} ELO
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-2">
              <span>{new Date(ratingHistory[0].created_at).toLocaleDateString('bg-BG', { month: 'short', day: 'numeric' })}</span>
              <span>{new Date(ratingHistory[ratingHistory.length - 1].created_at).toLocaleDateString('bg-BG', { month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="absolute left-0 top-0 flex flex-col justify-between h-32 pointer-events-none">
              <span className="text-xs text-gray-600">{maxRating}</span>
              <span className="text-xs text-gray-600">{minRating}</span>
            </div>
          </div>
        </div>
      )}

      {/* Self-assessment card */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">{t('profile.saTitle')}</h3>
            <p className="text-gray-500 text-xs mt-0.5">{t('profile.saSubtitle')}</p>
          </div>
          {profile.self_assessment_score != null && (
            <span
              className="text-2xl font-black"
              style={{ color: getSALevel(profile.self_assessment_score).color }}
            >
              {profile.self_assessment_score}/100
            </span>
          )}
        </div>

        {profile.self_assessment_score != null ? (
          <>
            {/* Level badge + bar */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                  style={{
                    color: getSALevel(profile.self_assessment_score).color,
                    borderColor: getSALevel(profile.self_assessment_score).color + '44',
                    backgroundColor: getSALevel(profile.self_assessment_score).color + '15',
                  }}
                >
                  {t(`leagues.${getSALevel(profile.self_assessment_score).label}`)} {t('profile.saTacticalLevel')}
                </span>
              </div>
              <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${getSALevel(profile.self_assessment_score).barColor}`}
                  style={{ width: `${profile.self_assessment_score}%` }}
                ></div>
              </div>
            </div>

            {/* Answers breakdown (collapsible) */}
            {profile.self_assessment_data && Array.isArray(saQuestions) && (
              <div>
                <button
                  onClick={() => setShowSADetails(v => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
                >
                  {showSADetails ? t('profile.saHideAnswers') : t('profile.saShowAnswers')}
                </button>
                {showSADetails && (
                  <div className="mt-3 space-y-2">
                    {saQuestions.map((label, idx) => {
                      const key = `q${idx + 1}`
                      const answer = profile.self_assessment_data[key]
                      const color = answer === 'В' ? '#CCFF00' : answer === 'Б' ? '#f59e0b' : '#9ca3af'
                      return (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 truncate flex-1 mr-3">{idx + 1}. {label}</span>
                          <span
                            className="text-xs font-bold w-5 text-center flex-shrink-0"
                            style={{ color }}
                          >
                            {answer || '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => navigate('/self-assessment')}
              className="btn-outline w-full text-sm"
            >
              {t('profile.saRepeat')}
            </button>
          </>
        ) : (
          <div className="text-center py-4 space-y-3">
            <p className="text-gray-500 text-sm">{t('profile.saEmpty')}</p>
            <button
              onClick={() => navigate('/self-assessment')}
              className="btn-neon w-full"
            >
              {t('profile.saStart')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
