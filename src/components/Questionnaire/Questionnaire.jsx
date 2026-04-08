import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getInitialRating, getLeague } from '../../lib/elo'

const QUESTIONS = [
  {
    id: 1,
    question: 'Колко години играете падел?',
    options: [
      { label: 'Никога не съм играл', points: 0 },
      { label: 'По-малко от 1 година', points: 1 },
      { label: '1-3 години', points: 2 },
      { label: 'Над 3 години', points: 3 },
    ]
  },
  {
    id: 2,
    question: 'Колко пъти седмично играете падел?',
    options: [
      { label: 'Не играя редовно', points: 0 },
      { label: '1 път', points: 1 },
      { label: '2-3 пъти', points: 2 },
      { label: '4 или повече пъти', points: 3 },
    ]
  },
  {
    id: 3,
    question: 'Знаете ли как да сервирате правилно в падел?',
    options: [
      { label: 'Не, не знам', points: 0 },
      { label: 'Знам основите', points: 1 },
      { label: 'Да, сервирам добре', points: 2 },
      { label: 'Да, владея различни сервизи', points: 3 },
    ]
  },
  {
    id: 4,
    question: 'Можете ли да играете воле (volée)?',
    options: [
      { label: 'Не', points: 0 },
      { label: 'Рядко успявам', points: 1 },
      { label: 'Да, играя воле', points: 2 },
      { label: 'Да, играя различни видове воле', points: 3 },
    ]
  },
  {
    id: 5,
    question: 'Знаете ли какво е "бандеха" (bandeja)?',
    options: [
      { label: 'Не съм чувал', points: 0 },
      { label: 'Чувал съм, но не мога да я играя', points: 1 },
      { label: 'Да, мога да изпълня бандеха', points: 2 },
      { label: 'Да, изпълнявам я редовно и добре', points: 3 },
    ]
  },
  {
    id: 6,
    question: 'Участвали ли сте в турнири по падел?',
    options: [
      { label: 'Никога', points: 0 },
      { label: 'В любителски турнири', points: 1 },
      { label: 'В местни/регионални турнири', points: 2 },
      { label: 'В национални или международни турнири', points: 3 },
    ]
  },
  {
    id: 7,
    question: 'Можете ли да изпълните смаш (smash)?',
    options: [
      { label: 'Не', points: 0 },
      { label: 'Понякога успявам', points: 1 },
      { label: 'Да, играя смаш', points: 2 },
      { label: 'Да, включително смаш от стената', points: 3 },
    ]
  },
  {
    id: 8,
    question: 'Играете ли с тактика и стратегия с партньора си?',
    options: [
      { label: 'Не, играем на случаен принцип', points: 0 },
      { label: 'Рядко', points: 1 },
      { label: 'Да, имаме основна тактика', points: 2 },
      { label: 'Да, играем с добре разработена тактика', points: 3 },
    ]
  },
  {
    id: 9,
    question: 'Как оценявате собственото си ниво на игра (1-5)?',
    options: [
      { label: '1-2 (Начинаещ)', points: 0 },
      { label: '3 (Средно ниво)', points: 1 },
      { label: '4 (Напреднал)', points: 2 },
      { label: '5 (Експерт)', points: 3 },
    ]
  },
  {
    id: 10,
    question: 'Играли ли сте други ракетни спортове (тенис, скуош, бадминтон)?',
    options: [
      { label: 'Никога', points: 0 },
      { label: 'Малко опит', points: 1 },
      { label: 'Редовно играя/играх', points: 2 },
      { label: 'На клубно или федерално ниво', points: 3 },
    ]
  }
]

export default function Questionnaire() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({})
  const [selectedOption, setSelectedOption] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const question = QUESTIONS[currentQ]
  const isLast = currentQ === QUESTIONS.length - 1
  const progress = Math.round(((currentQ + (selectedOption !== null ? 1 : 0)) / QUESTIONS.length) * 100)

  function handleSelect(index) {
    setSelectedOption(index)
  }

  function handleNext() {
    if (selectedOption === null) return
    const newAnswers = { ...answers, [question.id]: question.options[selectedOption].points }
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
      const maxPoints = QUESTIONS.length * 3
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
      setError(err.message || 'Грешка при запис. Опитайте отново.')
      setSubmitting(false)
    }
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold text-lg">Изчисляване на ниво...</p>
          <p className="text-gray-400 mt-1">Моля изчакайте</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🎾</div>
          <h1 className="text-2xl font-bold text-white">Определяне на ниво</h1>
          <p className="text-gray-400 mt-1">Отговорете на въпросите, за да определим началния ви рейтинг</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Въпрос {currentQ + 1} от {QUESTIONS.length}</span>
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
            {question.options.map((opt, idx) => (
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
                  <span className="text-sm">{opt.label}</span>
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
            {isLast ? 'Завърши' : 'Следващ въпрос'}
          </button>
        </div>
      </div>
    </div>
  )
}
