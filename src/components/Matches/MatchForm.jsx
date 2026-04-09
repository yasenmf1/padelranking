import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function PlayerCard({ player, onRemove, dimmed }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
      dimmed ? 'bg-[#1a1a1a] border-[#2a2a2a]' : 'bg-[#CCFF00]/10 border-[#CCFF00]/30'
    }`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
        dimmed ? 'bg-[#2a2a2a] text-gray-400' : 'bg-[#CCFF00]/20 text-[#CCFF00]'
      }`}>
        {getInitials(player.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm truncate ${dimmed ? 'text-gray-300' : 'text-[#CCFF00]'}`}>
          {player.full_name}
        </p>
        <p className="text-gray-500 text-xs">@{player.username} · {player.rating} ELO · {player.league}</p>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove}
          className="text-gray-600 hover:text-red-400 text-xl leading-none flex-shrink-0 transition-colors">×</button>
      )}
    </div>
  )
}

function PlayerSearch({ selected, onSelect, onClear, excludeIds, placeholder }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const { t } = useLanguage()
  const searchRef = useRef(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        searchRef.current && !searchRef.current.contains(e.target)
      ) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function search(q) {
    setQuery(q)
    if (q.length < 2) { setResults([]); setShowDropdown(false); return }
    const { data } = await supabase
      .from('profiles').select('id, full_name, username, rating, league')
      .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`).limit(10)
    if (data) {
      setResults(data.filter(p => !excludeIds.includes(p.id)))
      setShowDropdown(true)
    }
  }

  function handleSelect(p) { onSelect(p); setQuery(''); setResults([]); setShowDropdown(false) }
  function handleClear() { onClear(); setQuery(''); setResults([]) }

  if (selected) return <PlayerCard player={selected} onRemove={handleClear} />

  return (
    <div className="relative">
      <input ref={searchRef} type="text" value={query} onChange={e => search(e.target.value)}
        className="input-dark" placeholder={placeholder || t('matchForm.searchPlaceholder')} autoComplete="off" />
      {showDropdown && results.length > 0 && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg overflow-hidden shadow-xl">
          {results.map(p => (
            <button key={p.id} type="button" onClick={() => handleSelect(p)}
              className="w-full text-left px-4 py-3 hover:bg-[#2a2a2a] transition-colors flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0">
                <span className="text-gray-300 font-bold text-xs">{getInitials(p.full_name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{p.full_name}</p>
                <p className="text-gray-500 text-xs">@{p.username}</p>
              </div>
              <span className="text-[#CCFF00] text-sm font-bold flex-shrink-0">{p.rating} ELO</span>
            </button>
          ))}
        </div>
      )}
      {showDropdown && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg p-4 text-center text-gray-500 text-sm shadow-xl">
          {t('matchForm.noPlayers')}
        </div>
      )}
    </div>
  )
}

export default function MatchForm({ onSubmitted }) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [clubs, setClubs] = useState([])
  const [partner, setPartner] = useState(null)
  const [opponent1, setOpponent1] = useState(null)
  const [opponent2, setOpponent2] = useState(null)
  const [matchType, setMatchType] = useState('bo3')
  const [sets, setSets] = useState([{ p1: '', p2: '' }, { p1: '', p2: '' }, { p1: '', p2: '' }])
  const [clubId, setClubId] = useState('')
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const allPlayersSelected = !!partner && !!opponent1 && !!opponent2

  useEffect(() => { supabase.from('clubs').select('*').order('city').then(({ data }) => { if (data) setClubs(data) }) }, [])

  useEffect(() => {
    const totalSets = matchType === 'bo5' ? 5 : 3
    setSets(prev => {
      const newSets = [...prev]
      while (newSets.length < totalSets) newSets.push({ p1: '', p2: '' })
      return newSets.slice(0, totalSets)
    })
  }, [matchType])

  function computeVisibleSets(currentSets, type) {
    const needed = type === 'bo5' ? 3 : 2
    let p1Wins = 0, p2Wins = 0
    return currentSets.map((set) => {
      const visible = p1Wins < needed && p2Wins < needed
      if (set.p1 !== '' && set.p2 !== '') {
        const p1 = parseInt(set.p1), p2 = parseInt(set.p2)
        if (!isNaN(p1) && !isNaN(p2) && p1 !== p2) { if (p1 > p2) p1Wins++; else p2Wins++ }
      }
      return visible
    })
  }

  function updateSet(idx, field, value) {
    setSets(prev => {
      const updated = prev.map((s, i) => i === idx ? { ...s, [field]: value } : s)
      const visible = computeVisibleSets(updated, matchType)
      return updated.map((s, i) => visible[i] ? s : { p1: '', p2: '' })
    })
  }

  function determineWinner() {
    let p1Wins = 0, p2Wins = 0
    for (const set of sets) {
      if (set.p1 === '' || set.p2 === '') continue
      const p1 = parseInt(set.p1), p2 = parseInt(set.p2)
      if (p1 > p2) p1Wins++; else if (p2 > p1) p2Wins++
    }
    const needed = matchType === 'bo5' ? 3 : 2
    if (p1Wins >= needed) return 'team1'
    if (p2Wins >= needed) return 'team2'
    return null
  }

  function validateSets() {
    const validSets = sets.filter(s => s.p1 !== '' && s.p2 !== '')
    if (validSets.length < 2) return t('matchForm.errorSetsMin')
    for (const s of validSets) {
      const p1 = parseInt(s.p1), p2 = parseInt(s.p2)
      if (isNaN(p1) || isNaN(p2) || p1 < 0 || p2 < 0) return t('matchForm.errorSetsInvalid')
      if (p1 === p2) return t('matchForm.errorSetsTie')
    }
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!allPlayersSelected) { setError(t('matchForm.errorPlayers')); return }
    const setsErr = validateSets()
    if (setsErr) { setError(setsErr); return }
    const winner = determineWinner()
    if (!winner) { setError(t('matchForm.errorNoWinner')); return }
    setSubmitting(true)
    try {
      const setsData = sets.filter(s => s.p1 !== '' && s.p2 !== '').map(s => ({ p1: parseInt(s.p1), p2: parseInt(s.p2) }))
      const winnerId = winner === 'team1' ? profile.id : opponent1.id
      const { error: insertError } = await supabase.from('matches').insert({
        player1_id: profile.id, player2_id: partner.id,
        player3_id: opponent1.id, player4_id: opponent2.id,
        winner_id: winnerId, match_type: matchType, sets_data: setsData,
        player1_rating_before: profile.rating, player2_rating_before: partner.rating,
        player3_rating_before: opponent1.rating, player4_rating_before: opponent2.rating,
        status: 'pending',
        expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        club_id: clubId ? parseInt(clubId) : null,
        played_at: new Date(playedAt).toISOString(), submitted_by: profile.id,
        admin_note: notes || null
      })
      if (insertError) throw insertError
      setSuccess(true)
      setPartner(null); setOpponent1(null); setOpponent2(null)
      setSets([{ p1: '', p2: '' }, { p1: '', p2: '' }, { p1: '', p2: '' }])
      setMatchType('bo3'); setClubId(''); setNotes('')
      setPlayedAt(new Date().toISOString().split('T')[0])
      if (onSubmitted) onSubmitted()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || t('matchForm.errorGeneral'))
    } finally { setSubmitting(false) }
  }

  const winnerPreview = allPlayersSelected ? determineWinner() : null
  const visibleSets = computeVisibleSets(sets, matchType)
  const usedIds = [profile?.id, partner?.id, opponent1?.id, opponent2?.id].filter(Boolean)

  return (
    <form onSubmit={handleSubmit} className="card space-y-6">
      <h2 className="text-lg font-bold text-white">{t('matchForm.title')}</h2>

      {success && (
        <div className="p-3 bg-[#CCFF00]/10 border border-[#CCFF00]/30 rounded-lg text-[#CCFF00] text-sm font-medium">
          {t('matchForm.success')}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      {/* Team 1 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#CCFF00]"></div>
          <span className="text-sm font-semibold text-white">{t('matchForm.yourTeam')}</span>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">{t('matchForm.player1Label')}</p>
          {profile && <PlayerCard player={profile} dimmed />}
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">{t('matchForm.partnerLabel')}</p>
          <PlayerSearch selected={partner} onSelect={setPartner} onClear={() => setPartner(null)}
            excludeIds={usedIds.filter(id => id !== partner?.id)}
            placeholder={t('matchForm.partnerPlaceholder')} />
        </div>
      </div>

      <div className="relative">
        <div className="border-t border-[#2a2a2a]"></div>
        <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-[#111] px-3 text-xs text-gray-600 font-semibold uppercase tracking-widest">
          {t('matchForm.versus')}
        </span>
      </div>

      {/* Team 2 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400"></div>
          <span className="text-sm font-semibold text-white">{t('matchForm.opponentTeam')}</span>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">{t('matchForm.opponent1Label')}</p>
          <PlayerSearch selected={opponent1} onSelect={setOpponent1} onClear={() => setOpponent1(null)}
            excludeIds={usedIds.filter(id => id !== opponent1?.id)}
            placeholder={t('matchForm.opponentPlaceholder')} />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">{t('matchForm.opponent2Label')}</p>
          <PlayerSearch selected={opponent2} onSelect={setOpponent2} onClear={() => setOpponent2(null)}
            excludeIds={usedIds.filter(id => id !== opponent2?.id)}
            placeholder={t('matchForm.opponentPlaceholder')} />
        </div>
      </div>

      {/* Format */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('matchForm.formatLabel')}</label>
        <div className="flex gap-3">
          {['bo3', 'bo5'].map(type => (
            <button key={type} type="button" onClick={() => setMatchType(type)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                matchType === type ? 'bg-[#CCFF00] text-black border-[#CCFF00]' : 'bg-[#111111] text-gray-400 border-[#2a2a2a] hover:border-[#CCFF00]/50'
              }`}>
              {type === 'bo3' ? 'Best of 3' : 'Best of 5'}
            </button>
          ))}
        </div>
      </div>

      {/* Sets */}
      <div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <label className="text-sm font-medium text-gray-300">{t('matchForm.setsLabel')}</label>
          {!allPlayersSelected ? (
            <span className="text-xs text-gray-600 italic">{t('matchForm.setsHint')}</span>
          ) : winnerPreview ? (
            <span className={`text-sm font-semibold ${winnerPreview === 'team1' ? 'text-[#CCFF00]' : 'text-red-400'}`}>
              {t('matchForm.winnerPreview', { team: winnerPreview === 'team1' ? t('matchForm.yourTeamWinner') : t('matchForm.opponentWinner') })}
            </span>
          ) : null}
        </div>
        <div className={`space-y-2 transition-opacity ${!allPlayersSelected ? 'opacity-30 pointer-events-none select-none' : ''}`}>
          <div className="flex items-center gap-3 text-xs mb-1">
            <span className="w-16 flex-shrink-0"></span>
            <span className="w-16 text-center text-[#CCFF00] font-medium">{t('matchForm.yourScore')}</span>
            <span className="w-5 text-center text-gray-600">:</span>
            <span className="w-16 text-center text-red-400 font-medium">{t('matchForm.oppScore')}</span>
          </div>
          {sets.map((set, idx) => {
            if (!visibleSets[idx]) return null
            return (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-gray-500 text-sm w-16 flex-shrink-0">{t('matchForm.setLabel', { n: idx + 1 })}</span>
                <input type="number" value={set.p1} onChange={e => updateSet(idx, 'p1', e.target.value)}
                  className="input-dark text-center w-16" placeholder="0" min="0" max="99" disabled={!allPlayersSelected} />
                <span className="text-gray-400 w-5 text-center">:</span>
                <input type="number" value={set.p2} onChange={e => updateSet(idx, 'p2', e.target.value)}
                  className="input-dark text-center w-16" placeholder="0" min="0" max="99" disabled={!allPlayersSelected} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Club */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('matchForm.clubLabel')}</label>
        <select value={clubId} onChange={e => setClubId(e.target.value)} className="input-dark">
          <option value="">{t('matchForm.clubPlaceholder')}</option>
          {clubs.map(c => <option key={c.id} value={c.id}>{c.name} ({c.city})</option>)}
        </select>
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('matchForm.dateLabel')}</label>
        <input type="date" value={playedAt} onChange={e => setPlayedAt(e.target.value)}
          max={new Date().toISOString().split('T')[0]} className="input-dark" required />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('matchForm.notesLabel')}</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          className="input-dark resize-none" rows={2} placeholder={t('matchForm.notesPlaceholder')} />
      </div>

      <button type="submit" disabled={submitting || !allPlayersSelected}
        className="btn-neon w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
        {submitting ? (
          <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>{t('matchForm.submitting')}</>
        ) : t('matchForm.submitBtn')}
      </button>
    </form>
  )
}
