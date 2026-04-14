import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getInitialRating, getLeague } from '../../lib/elo'

// Points per option: А=1, Б=4, В=10 — max 100 points
const OPTION_POINTS = [1, 4, 10]
const OPTION_LABELS = ['А', 'Б', 'В']

// score = raw points (10-100)
function getTacticalLevel(score) {
  if (score >= 86) return { key: 'Злато', emoji: '🥇', color: '#ffd700', border: '#ffd70044', bg: '#ffd70015' }
  if (score >= 61) return { key: 'Сребър', emoji: '🥈', color: '#c0c0c0', border: '#c0c0c044', bg: '#c0c0c015' }
  if (score >= 26) return { key: 'Бронз', emoji: '🥉', color: '#cd7f32', border: '#cd7f3244', bg: '#cd7f3215' }
  return { key: 'Начинаещи', emoji: '🎾', color: '#9ca3af', border: '#9ca3af44', bg: '#9ca3af15' }
}

export default function SelfAssessment() {
  const { profile, refreshProfile } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const questions = t('selfAssessment.questions')

  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({})
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [finalScore, setFinalScore] = useState(null)
  const [finalRating, setFinalRating] = useState(null)

  const question = questions[currentQ]
  const isLast = currentQ === questions.length - 1
  const progress = Math.round(((currentQ + (selected !== null ? 1 : 0)) / questions.length) * 100)

  function handleNext() {
    if (selected === null) return
    const newAnswers = {
      ...answers,
      [`q${currentQ + 1}`]: OPTION_LABELS[selected]
    }
    setAnswers(newAnswers)

    if (isLast) {
      handleSubmit(newAnswers)
    } else {
      setCurrentQ(q => q + 1)
      setSelected(null)
    }
  }

  async function handleSubmit(finalAnswers) {
    setSubmitting(true)
    setError('')
    try {
      let score = 0
      for (let i = 0; i < questions.length; i++) {
        const chosenLabel = finalAnswers[`q${i + 1}`]
        const optIdx = OPTION_LABELS.indexOf(chosenLabel)
        if (optIdx !== -1) score += OPTION_POINTS[optIdx]
      }

      const newRating = getInitialRating(score)
      const newLeague = getLeague(newRating)

      console.log('[SelfAssessment] saving for user', profile.id, { score, newRating, newLeague })

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          self_assessment_score: score,
          self_assessment_data: finalAnswers,
          rating: newRating,
          league: newLeague,
          questionnaire_done: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (updateError) {
        console.error('[SelfAssessment] save error:', updateError)
        throw updateError
      }

      console.log('[SelfAssessment] saved successfully')

      // Show results first — refreshProfile triggers ProtectedRoute re-evaluation
      // which would redirect away before the user sees the result screen
      setFinalScore(score)
      setFinalRating(newRating)
      setDone(true)
    } catch (err) {
      console.error('SelfAssessment submit failed:', err)
      setError(err.message || t('selfAssessment.error'))
      setSubmitting(false)
    }
  }

  if (submitting && !done) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold text-lg">{t('selfAssessment.recordingTitle')}</p>
        </div>
      </div>
    )
  }

  if (done && finalScore !== null) {
    const level = getTacticalLevel(finalScore)
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md text-center space-y-6">
          <div>
            <div className="text-7xl mb-4">{level.emoji}</div>
            <h1 className="text-2xl font-bold text-white">{t('selfAssessment.doneTitle')}</h1>
          </div>

          <div className="card space-y-5">
            {/* Points */}
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{t('selfAssessment.resultLabel')}</p>
              <p className="text-5xl font-black text-white">
                {finalScore} <span className="text-2xl text-gray-500 font-semibold">{t('selfAssessment.outOf')}</span>
              </p>
            </div>

            {/* Level badge */}
            <span
              className="inline-block px-5 py-2 rounded-full text-sm font-bold border"
              style={{ color: level.color, borderColor: level.border, backgroundColor: level.bg }}
            >
              {level.emoji} {t(`leagues.${level.key}`)}
            </span>

            {/* Score bar */}
            <div className="h-2.5 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${finalScore}%`, backgroundColor: level.color }}
              ></div>
            </div>

            {/* New ELO */}
            {finalRating !== null && (
              <div className="pt-3 border-t border-[#2a2a2a]">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{t('selfAssessment.newRating')}</p>
                <p className="text-4xl font-black text-[#CCFF00]">{finalRating} <span className="text-lg font-semibold text-gray-400">ELO</span></p>
              </div>
            )}
          </div>

          <button
            onClick={async () => {
              await refreshProfile()
              navigate('/profile')
            }}
            className="btn-neon w-full text-base py-3"
          >
            {t('selfAssessment.toProfile')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏓</div>
          <h1 className="text-2xl font-bold text-white">{t('selfAssessment.title')}</h1>
          <p className="text-gray-400 mt-1 text-sm">{t('selfAssessment.subtitle')}</p>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>{t('selfAssessment.questionOf', { current: currentQ + 1, total: questions.length })}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#CCFF00] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-white mb-5 leading-snug">{question.question}</h2>

          <div className="space-y-3">
            {question.options.map((optText, idx) => (
              <button
                key={idx}
                onClick={() => setSelected(idx)}
                className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
                  selected === idx
                    ? 'border-[#CCFF00] bg-[#CCFF00]/10'
                    : 'border-[#2a2a2a] bg-[#111111] hover:border-[#CCFF00]/40 hover:bg-[#1a1a1a]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors mt-0.5 ${
                    selected === idx
                      ? 'bg-[#CCFF00] text-black'
                      : 'bg-[#2a2a2a] text-gray-400'
                  }`}>
                    {OPTION_LABELS[idx]}
                  </div>
                  <span className={`text-sm leading-relaxed ${selected === idx ? 'text-white' : 'text-gray-300'}`}>
                    {optText}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {currentQ > 0 && (
              <button
                onClick={() => { setCurrentQ(q => q - 1); setSelected(null) }}
                className="btn-outline px-5"
              >
                {t('selfAssessment.backBtn')}
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={selected === null}
              className="btn-neon flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLast ? t('selfAssessment.finishBtn') : t('selfAssessment.nextBtn')}
            </button>
          </div>
        </div>

        <button
          onClick={() => navigate('/profile')}
          className="mt-4 w-full text-center text-gray-600 hover:text-gray-400 text-sm transition-colors"
        >
          {t('selfAssessment.cancelLink')}
        </button>
      </div>
    </div>
  )
}
