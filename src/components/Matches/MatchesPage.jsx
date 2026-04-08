import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import MatchForm from './MatchForm'
import MatchList from './MatchList'

const TABS = ['Запиши мач', 'История']

export default function MatchesPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Запиши мач')
  const [refreshKey, setRefreshKey] = useState(0)

  function handleSubmitted() {
    setRefreshKey(k => k + 1)
    setActiveTab('История')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Мачове</h1>
        <p className="text-gray-400 mt-0.5">Запишете и следете своите мачове</p>
      </div>

      {profile?.self_assessment_score == null && (
        <div className="flex items-center justify-between gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-amber-400 text-sm">⚠️ Нямаш попълнена самооценка — не участваш в ранглистата.</p>
          <Link to="/self-assessment" className="text-amber-400 font-semibold text-sm whitespace-nowrap hover:text-amber-300 transition-colors">
            Попълни сега →
          </Link>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#2a2a2a]">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[#CCFF00] text-[#CCFF00]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Запиши мач' ? (
        <MatchForm onSubmitted={handleSubmitted} />
      ) : (
        <MatchList refresh={refreshKey} />
      )}
    </div>
  )
}
