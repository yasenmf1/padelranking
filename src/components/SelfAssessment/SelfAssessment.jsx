import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getInitialRating, getLeague } from '../../lib/elo'

// А=1pt · Б=4pt · В=10pt — макс = 10 въпроса × 10 = 100 точки
const QUESTIONS = [
  {
    id: 'q1',
    question: 'Топката пада от висок лоб кратко (въздушна топка) и можеш да я удариш от въздуха. Как действаш?',
    options: [
      { label: 'А', text: 'Опитвам се да я ударя силно (Smash), но често я забивам в мрежата.', points: 1 },
      { label: 'Б', text: 'Правя пласирана Bandeja в диагонала, за да не загубя позицията си на мрежата.', points: 4 },
      { label: 'В', text: 'Мога да избирам между агресивна Bandeja или Vibora с много страничен фалц спрямо ситуацията.', points: 10 },
    ]
  },
  {
    id: 'q2',
    question: 'Ти си на мрежата и противникът изпраща топка ниско към краката ти. Как реагираш?',
    options: [
      { label: 'А', text: 'Опитвам да я ударя директно нагоре — давам лесна атакуваща топка на противника.', points: 1 },
      { label: 'Б', text: 'Правя Chiquita с ниска траектория за да задържа позицията на мрежата.', points: 4 },
      { label: 'В', text: 'Чета ситуацията — при добра топка контра-атакувам по линията, при трудна правя Chiquita към слабата страна за да ги задържам в защита.', points: 10 },
    ]
  },
  {
    id: 'q3',
    question: 'Ти и партньорът сте атакуващо на мрежата. Противниците пращат контра-лоб над вас. Как се справяш?',
    options: [
      { label: 'А', text: 'Изоставам на позиция и позволявам топката да падне в полето ни — губим инициативата.', points: 1 },
      { label: 'Б', text: 'Отстъпвам назад и правя Lob обратно за да сменим позицията.', points: 4 },
      { label: 'В', text: 'Координирам с партньора — кой е по-близо удря Bandeja/Overhead, другият покрива средата и готвим следваща атака.', points: 10 },
    ]
  },
  {
    id: 'q4',
    question: 'Вие двамата сте на задна позиция след защита. Противниците атакуват на мрежата и чакат ваш кратък удар. Как излизаш от защита?',
    options: [
      { label: 'А', text: 'Бия силно директно към тях — давам им атака.', points: 1 },
      { label: 'Б', text: 'Правя висок дълбок Lob за да спечелим позиция и да преминем на мрежата.', points: 4 },
      { label: 'В', text: 'Правя дълбок Lob или Lob по линията спрямо позицията им — с цел да принудим слаб Overhead и да контра-атакуваме.', points: 10 },
    ]
  },
  {
    id: 'q5',
    question: 'Топката е кратък лоб (въздушна, достъпна за теб). Как избираш между Bandeja и Smash?',
    options: [
      { label: 'А', text: 'Правя Smash директно надолу без анализ — понякога грешка.', points: 1 },
      { label: 'Б', text: 'Предпочитам Bandeja за контрол — по-сигурен вариант, не рискувам.', points: 4 },
      { label: 'В', text: 'Анализирам позицията на противниците — при разтворена защита правя Смаш X3, при плътна защита — Bandeja към по-слабия играч.', points: 10 },
    ]
  },
  {
    id: 'q6',
    question: 'Smash X3/X4 (удар в страничното/задното стъкло за финален удар) — колко често успяваш да завършиш точката с него?',
    options: [
      { label: 'А', text: 'Рядко — или греша, или противникът връща лесно от стъклото.', points: 1 },
      { label: 'Б', text: 'Понякога — когато топката е точно в моята зона и имам достатъчно време.', points: 4 },
      { label: 'В', text: 'Редовно — разчитам на X3/X4 като сигурен финален удар, включително X4 от средата на корта.', points: 10 },
    ]
  },
  {
    id: 'q7',
    question: 'Ти и партньорът сте на мрежата. Партньорът тръгва да удари воле вдясно. Ти:',
    options: [
      { label: 'А', text: 'Оставам на позицията си и не се придвижвам — оставям дупка в центъра.', points: 1 },
      { label: 'Б', text: 'Леко се придвижвам към центъра за да покрия средата на корта.', points: 4 },
      { label: 'В', text: '"Затваряме" синхронизирано — движа се в посоката на неговия удар за да покрием всички ъгли и не оставим пространство.', points: 10 },
    ]
  },
  {
    id: 'q8',
    question: 'Chiquita — как и кога я използваш като удар?',
    options: [
      { label: 'А', text: 'Не я използвам или само когато нямам друг вариант — защитно.', points: 1 },
      { label: 'Б', text: 'Използвам я за да изпратя ниска топка при нозете на противника на мрежата.', points: 4 },
      { label: 'В', text: 'Използвам я агресивно и целенасочено — към слабата ръка, по линията или в тялото, за да спечеля директно или да изнудя грешка.', points: 10 },
    ]
  },
  {
    id: 'q9',
    question: 'Втори сервис (нямаш право на грешка) — накъде насочваш и как действаш?',
    options: [
      { label: 'А', text: 'Пускам го бавно в полето без насока — само да не направя двойна грешка.', points: 1 },
      { label: 'Б', text: 'Насочвам го към центъра или слабата страна на приемащия с умерена скорост.', points: 4 },
      { label: 'В', text: 'Слагам ефект (slice/kick) за да направя неудобна топка дори при втори сервис и координирам с партньора позицията ни за отговора.', points: 10 },
    ]
  },
  {
    id: 'q10',
    question: 'Ретур на силен сервис, след като топката удари задното стъкло зад теб. Как посрещаш?',
    options: [
      { label: 'А', text: 'Трудно ми е да чета траекторията — чакам да падне и давам слаба или висока топка.', points: 1 },
      { label: 'Б', text: 'Изчаквам топката след стъклото и правя висок Lob за да се върнем в позиция.', points: 4 },
      { label: 'В', text: 'Чета вида на сервиса предварително, позиционирам се правилно и избирам между Chiquita или контролиран Lob спрямо позицията на противниците.', points: 10 },
    ]
  }
]

// score = raw points (10-100)
function getTacticalLevel(score) {
  if (score >= 86) return { label: 'Злато', emoji: '🥇', color: '#ffd700', border: '#ffd70044', bg: '#ffd70015' }
  if (score >= 61) return { label: 'Сребър', emoji: '🥈', color: '#c0c0c0', border: '#c0c0c044', bg: '#c0c0c015' }
  if (score >= 26) return { label: 'Бронз', emoji: '🥉', color: '#cd7f32', border: '#cd7f3244', bg: '#cd7f3215' }
  return { label: 'Начинаещи', emoji: '🎾', color: '#9ca3af', border: '#9ca3af44', bg: '#9ca3af15' }
}

export default function SelfAssessment() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({}) // { q1: 'А', q2: 'Б', ... }
  const [selected, setSelected] = useState(null) // index 0|1|2
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [finalScore, setFinalScore] = useState(null)
  const [finalRating, setFinalRating] = useState(null)

  const question = QUESTIONS[currentQ]
  const isLast = currentQ === QUESTIONS.length - 1
  const progress = Math.round(((currentQ + (selected !== null ? 1 : 0)) / QUESTIONS.length) * 100)

  function handleNext() {
    if (selected === null) return
    const newAnswers = {
      ...answers,
      [question.id]: question.options[selected].label
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
      // Compute score: А=1, Б=4, В=10 — макс 100 точки
      let score = 0
      for (const q of QUESTIONS) {
        const chosenLabel = finalAnswers[q.id]
        const opt = q.options.find(o => o.label === chosenLabel)
        if (opt) score += opt.points
      }

      const newRating = getInitialRating(score)
      const newLeague = getLeague(newRating)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          self_assessment_score: score,
          self_assessment_data: finalAnswers,
          rating: newRating,
          league: newLeague,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (updateError) throw updateError

      await refreshProfile()
      setFinalScore(score)
      setFinalRating(newRating)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Грешка при запис. Опитайте отново.')
      setSubmitting(false)
    }
  }

  if (submitting && !done) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold text-lg">Записване...</p>
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
            <h1 className="text-2xl font-bold text-white">Самооценката е завършена!</h1>
          </div>

          <div className="card space-y-5">
            {/* Points */}
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Резултат</p>
              <p className="text-5xl font-black text-white">
                {finalScore} <span className="text-2xl text-gray-500 font-semibold">/ 100</span>
              </p>
            </div>

            {/* Level badge */}
            <span
              className="inline-block px-5 py-2 rounded-full text-sm font-bold border"
              style={{ color: level.color, borderColor: level.border, backgroundColor: level.bg }}
            >
              {level.emoji} {level.label}
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
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Нов рейтинг</p>
                <p className="text-4xl font-black text-[#CCFF00]">{finalRating} <span className="text-lg font-semibold text-gray-400">ELO</span></p>
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/profile')}
            className="btn-neon w-full text-base py-3"
          >
            Към профила →
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
          <h1 className="text-2xl font-bold text-white">Тактическа самооценка</h1>
          <p className="text-gray-400 mt-1 text-sm">Оцени тактическото си ниво — 10 ситуационни въпроса</p>
        </div>

        {/* Progress */}
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
          <h2 className="text-base font-semibold text-white mb-5 leading-snug">{question.question}</h2>

          <div className="space-y-3">
            {question.options.map((opt, idx) => (
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
                  {/* Option label badge */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors mt-0.5 ${
                    selected === idx
                      ? 'bg-[#CCFF00] text-black'
                      : 'bg-[#2a2a2a] text-gray-400'
                  }`}>
                    {opt.label}
                  </div>
                  <span className={`text-sm leading-relaxed ${selected === idx ? 'text-white' : 'text-gray-300'}`}>
                    {opt.text}
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
                ←
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={selected === null}
              className="btn-neon flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLast ? 'Завърши' : 'Следващ въпрос'}
            </button>
          </div>
        </div>

        <button
          onClick={() => navigate('/profile')}
          className="mt-4 w-full text-center text-gray-600 hover:text-gray-400 text-sm transition-colors"
        >
          Отказ — върни се към профила
        </button>
      </div>
    </div>
  )
}
