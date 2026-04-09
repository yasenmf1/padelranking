import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../context/LanguageContext'

function formatSets(setsData, flip = false) {
  if (!setsData || !Array.isArray(setsData)) return '-'
  return setsData.map(s => flip ? `${s.p2}-${s.p1}` : `${s.p1}-${s.p2}`).join(', ')
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })
}

export default function MatchConfirmCard({ match, profile, onDone }) {
  const { t } = useLanguage()
  const [step, setStep] = useState('idle') // idle | disputing | loading | success | error
  const [reason, setReason] = useState('')
  const [successData, setSuccessData] = useState(null)
  const [error, setError] = useState('')

  // player1+player2 = submitter's team, player3+player4 = opponent team (us)
  const submitterTeam = [match.player1, match.player2].filter(Boolean)
  const myTeamPlayers = [match.player3, match.player4].filter(Boolean)

  // Time remaining until expiry
  const expiresAt = match.expires_at ? new Date(match.expires_at) : null
  const msLeft = expiresAt ? expiresAt - Date.now() : null
  const hoursLeft = msLeft !== null ? Math.max(0, Math.floor(msLeft / 3600000)) : null
  const minsLeft = msLeft !== null ? Math.max(0, Math.floor((msLeft % 3600000) / 60000)) : null
  const isUrgent = msLeft !== null && msLeft < 2 * 3600000 && msLeft > 0

  // Sets from my team's perspective (flip: we're team2, sets stored as p1/p2 for team1/team2)
  const setsDisplay = formatSets(match.sets_data, true)

  // Did my team win? winner_id is the submitter's team captain (player1_id) if they won
  const myTeamWon = match.winner_id
    ? (match.winner_id === match.player3_id || match.winner_id === match.player4_id)
    : null

  // ── Confirm via DB function ────────────────────────────────────────────
  async function handleConfirm() {
    setStep('loading')
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('confirm_match', {
        p_match_id: match.id,
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)

      // My ELO change
      const ratingMap = {
        [match.player1_id]: { old: match.player1_rating_before || 500, new: data.p1_new },
        [match.player2_id]: { old: match.player2_rating_before || 500, new: data.p2_new },
        [match.player3_id]: { old: match.player3_rating_before || 500, new: data.p3_new },
        [match.player4_id]: { old: match.player4_rating_before || 500, new: data.p4_new },
      }
      const myRatings = ratingMap[profile.id]
      const newElo = myRatings?.new ?? 500
      const change = myRatings ? myRatings.new - myRatings.old : 0

      setSuccessData({ newElo, change })
      setStep('success')
      setTimeout(() => onDone?.(), 3500)
    } catch (err) {
      setError(err.message || t('common.error'))
      setStep('error')
    }
  }

  // ── Dispute via DB function ────────────────────────────────────────────
  async function handleDispute() {
    if (!reason.trim()) return
    setStep('loading')
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('dispute_match', {
        p_match_id: match.id,
        p_reason:   reason.trim(),
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)
      onDone?.()
    } catch (err) {
      setError(err.message || t('common.error'))
      setStep('error')
    }
  }

  // ── Success state ──────────────────────────────────────────────────────
  if (step === 'success' && successData) {
    return (
      <div className="p-5 rounded-xl border border-[#CCFF00]/50 bg-[#CCFF00]/10 text-center space-y-3">
        <div className="text-5xl">🎉</div>
        <p className="text-[#CCFF00] font-bold text-lg">{t('confirmSection.successTitle')}</p>
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{t('confirmSection.successEloLabel')}</p>
          <p className="text-4xl font-black text-white">{successData.newElo}</p>
          <p className={`text-xl font-bold mt-1 ${successData.change >= 0 ? 'text-[#CCFF00]' : 'text-red-400'}`}>
            {successData.change >= 0 ? '+' : ''}{successData.change} ELO
          </p>
        </div>
      </div>
    )
  }

  // ── Main card ──────────────────────────────────────────────────────────
  return (
    <div className={`rounded-xl border p-4 space-y-4 transition-colors ${
      step === 'loading' ? 'opacity-60' : 'border-yellow-500/30 bg-yellow-500/5'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-yellow-400 bg-yellow-500/20 px-2.5 py-1 rounded-full">
            {t('confirmSection.waitingLabel')}
          </span>
          {hoursLeft !== null && (
            <p className={`text-xs ${isUrgent ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
              {isUrgent
                ? t('confirmSection.urgentExpiry')
                : t('confirmSection.expiresIn', { h: hoursLeft, m: minsLeft })}
            </p>
          )}
          <p className="text-xs text-gray-600">
            {formatDate(match.played_at)} · {match.match_type?.toUpperCase()}
          </p>
          {match.clubs && <p className="text-xs text-gray-600">{match.clubs.name}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`font-mono font-black text-lg ${
            myTeamWon === true ? 'text-[#CCFF00]' : myTeamWon === false ? 'text-red-400' : 'text-white'
          }`}>
            {setsDisplay}
          </p>
          {myTeamWon !== null && (
            <p className={`text-xs font-semibold ${myTeamWon ? 'text-[#CCFF00]' : 'text-red-400'}`}>
              {myTeamWon ? '🏆 Победа' : '❌ Загуба'}
            </p>
          )}
        </div>
      </div>

      {/* Teams */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">{t('confirmSection.submittedBy')}</p>
          <p className="text-white text-sm font-medium truncate">
            {submitterTeam.map(p => p?.full_name?.split(' ')[0]).filter(Boolean).join(' + ')}
          </p>
        </div>
        <span className="text-gray-600 text-xs flex-shrink-0">vs</span>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-xs text-gray-500 mb-0.5">{t('confirmSection.yourTeam')}</p>
          <p className="text-[#CCFF00] text-sm font-medium truncate">
            {myTeamPlayers.map(p => p?.full_name?.split(' ')[0]).filter(Boolean).join(' + ')}
          </p>
        </div>
      </div>

      {/* Error */}
      {step === 'error' && error && (
        <p className="text-red-400 text-xs p-2 bg-red-500/10 rounded-lg border border-red-500/20">{error}</p>
      )}

      {/* Dispute form */}
      {step === 'disputing' ? (
        <div className="space-y-3 pt-1 border-t border-[#2a2a2a]">
          <p className="text-sm font-semibold text-red-400">❌ {t('confirmSection.disputeReasonLabel').replace(' *', '')}</p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="input-dark text-sm resize-none w-full"
            rows={3}
            placeholder={t('confirmSection.disputeReasonPlaceholder')}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleDispute}
              disabled={!reason.trim()}
              className="flex-1 py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {t('confirmSection.disputeSubmit')}
            </button>
            <button
              onClick={() => { setStep('idle'); setReason('') }}
              className="px-4 py-2.5 bg-[#1e1e1e] text-gray-400 border border-[#2a2a2a] rounded-lg text-sm hover:text-white transition-colors"
            >
              {t('confirmSection.disputeCancel')}
            </button>
          </div>
        </div>
      ) : (
        /* Action buttons */
        <div className="flex gap-2 pt-1 border-t border-[#2a2a2a]">
          <button
            onClick={handleConfirm}
            disabled={step === 'loading'}
            className="flex-1 py-3 bg-[#CCFF00] text-black font-bold rounded-xl text-sm hover:bg-[#bbee00] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {step === 'loading'
              ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />{t('confirmSection.confirming')}</>
              : t('confirmSection.confirmBtn')}
          </button>
          <button
            onClick={() => setStep('disputing')}
            disabled={step === 'loading'}
            className="px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-sm font-semibold hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {t('confirmSection.disputeBtn')}
          </button>
        </div>
      )}
    </div>
  )
}
