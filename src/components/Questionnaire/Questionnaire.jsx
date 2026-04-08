import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getInitialRating, getLeague } from '../../lib/elo'

export default function Questionnaire() {
  const { profile, refreshProfile } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const questions = t('questionnaire.questions')

  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({})
  const [selectedOption, setSelectedOption] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const question = questions[currentQ]
  const isLast = currentQ === questions.length - 1
  const progress = Math.round(((currentQ + (selectedOption !== null ? 1 : 0)) / questions.length) * 100)

  function handleSelect(index) {
    setSelectedOption(index)
  }

  function handleNext() {
    if (selectedOption === null) return
    // points: option index (0,1,2,3)
    const newAnswers = { ...answers, [currentQ]: selectedOption }
    setAnswers(newAnswers)

    if (isLast) {
      handleSubmit(newAnswers)
    } else {
      setCurrentQ(q => q + 1)
      setSelectedOption(null)
    }
  }

  async function handleSubmit(finalAnswers) {
    setSubmitting(true)
    setError('')
    try {
      const totalPoints = Object.values(finalAnswers).reduce((sum, p) => sum + p, 0)
      const maxPoints = questions.length * 3
      const score = Math.round((totalPoints / maxPoints) * 100)
      const rating = getInitialRating(score)
      const league = getLeague(rating)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          questionnaire_done: true,
          questionnaire_score: score,
          rating,
          league,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (updateError) throw updateError

      await refreshProfile()
      navigate('/')
    } catch (err) {
      setError(err.message || t('common.error'))
      setSubmitting(false)
    }
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold text-lg">{t('questionnaire.calculatingTitle')}</p>
          <p className="text-gray-400 mt-1">{t('questionnaire.calculatingSubtitle')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🎾</div>
          <h1 className="text-2xl font-bold text-white">{t('questionnaire.title')}</h1>
          <p className="text-gray-400 mt-1">{t('questionnaire.subtitle')}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>{t('questionnaire.questionOf', { current: currentQ + 1, total: questions.length })}</span>
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
          <h2 className="text-lg font-semibold text-white mb-5">{question.question}</h2>

          <div className="space-y-3">
            {question.options.map((optLabel, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
                  selectedOption === idx
                    ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-white'
                    : 'border-[#2a2a2a] bg-[#111111] text-gray-300 hover:border-[#CCFF00]/50 hover:bg-[#1a1a1a]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
                    selectedOption === idx
                      ? 'border-[#CCFF00] bg-[#CCFF00]'
                      : 'border-[#444]'
                  }`}>
                    {selectedOption === idx && (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-black"></div>
                      </div>
                    )}
                  </div>
                  <span className="text-sm">{optLabel}</span>
                </div>
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleNext}
            disabled={selectedOption === null}
            className="btn-neon w-full mt-6"
          >
            {isLast ? t('questionnaire.finishBtn') : t('questionnaire.nextBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
