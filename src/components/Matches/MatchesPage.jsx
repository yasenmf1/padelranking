import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import MatchForm from './MatchForm'
import MatchList from './MatchList'
import ConfirmationSection from './ConfirmationSection'

export default function MatchesPage() {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('record')
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  function handleSubmitted() {
    setRefreshKey(k => k + 1)
    setActiveTab('history')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('matchesPage.title')}</h1>
        <p className="text-gray-400 mt-0.5">{t('matchesPage.subtitle')}</p>
      </div>

      {profile?.self_assessment_score == null && (
        <div className="flex items-center justify-between gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-amber-400 text-sm">⚠️ {t('matchesPage.noBanner')}</p>
          <Link to="/self-assessment" className="text-amber-400 font-semibold text-sm whitespace-nowrap hover:text-amber-300 transition-colors">
            {t('matchesPage.fillNow')}
          </Link>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#2a2a2a]">
        {[
          { key: 'record', label: t('matchesPage.tabRecord') },
          { key: 'history', label: t('matchesPage.tabHistory') },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.key
                ? 'border-[#CCFF00] text-[#CCFF00]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
            {tab.key === 'history' && pendingCount > 0 && (
              <span className="bg-yellow-400 text-black text-xs font-black rounded-full w-5 h-5 flex items-center justify-center leading-none animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'record' ? (
        <MatchForm onSubmitted={handleSubmitted} />
      ) : (
        <div className="space-y-5">
          <ConfirmationSection
            onCountChange={setPendingCount}
          />
          <MatchList refresh={refreshKey} />
        </div>
      )}
    </div>
  )
}
