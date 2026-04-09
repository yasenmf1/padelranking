import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot
} from 'recharts'

function fmt(dateStr) {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{d.fullDate}</p>
      <p className="text-[#CCFF00] font-black text-base">{d.rating} ELO</p>
      {d.change !== 0 && (
        <p className={`font-semibold ${d.change > 0 ? 'text-[#CCFF00]' : 'text-red-400'}`}>
          {d.change > 0 ? '+' : ''}{d.change}
        </p>
      )}
      {d.opponent && (
        <p className="text-gray-500 mt-1 max-w-[140px] truncate">vs {d.opponent}</p>
      )}
    </div>
  )
}

function CustomDot(props) {
  const { cx, cy, payload } = props
  const color = payload.change > 0 ? '#CCFF00' : payload.change < 0 ? '#f87171' : '#6b7280'
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#1a1a1a" strokeWidth={2} />
}

export default function EloChart({ history, profileId }) {
  if (!history || history.length === 0) {
    return (
      <div className="card">
        <h3 className="text-base font-bold text-white mb-4">ELO Графика</h3>
        <div className="py-10 text-center">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-gray-500 text-sm">Изиграй първия си мач за да видиш графиката</p>
        </div>
      </div>
    )
  }

  // Build chart data with opponent names and ELO change
  const data = history.map((entry, idx) => {
    const prev = idx > 0 ? history[idx - 1].rating : entry.rating
    const change = entry.rating - prev

    // Determine opponent from match data
    let opponent = null
    const m = entry.match
    if (m) {
      const isTeam1 = m.player1_id === profileId || m.player2_id === profileId
      if (isTeam1) {
        const names = [m.player3?.full_name, m.player4?.full_name].filter(Boolean)
        opponent = names.map(n => n.split(' ')[0]).join(' + ')
      } else {
        const names = [m.player1?.full_name, m.player2?.full_name].filter(Boolean)
        opponent = names.map(n => n.split(' ')[0]).join(' + ')
      }
    }

    const dateStr = m?.played_at || entry.created_at
    return {
      label:    fmt(dateStr),
      fullDate: new Date(dateStr).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' }),
      rating:   entry.rating,
      change:   idx === 0 ? 0 : change,
      opponent,
    }
  })

  const ratings = data.map(d => d.rating)
  const minR = Math.min(...ratings)
  const maxR = Math.max(...ratings)
  const pad  = Math.max(20, Math.round((maxR - minR) * 0.15)) || 30
  const domainMin = Math.max(0, minR - pad)
  const domainMax = maxR + pad

  const startRating = data[0].rating
  const endRating   = data[data.length - 1].rating
  const totalChange = endRating - startRating

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-white">ELO Графика</h3>
        <div className="text-right">
          <p className="text-xs text-gray-500">{data.length} мача</p>
          {totalChange !== 0 && (
            <p className={`text-xs font-bold ${totalChange > 0 ? 'text-[#CCFF00]' : 'text-red-400'}`}>
              {totalChange > 0 ? '+' : ''}{totalChange} общо
            </p>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[domainMin, domainMax]}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2a2a2a', strokeWidth: 1 }} />
          {startRating && (
            <ReferenceLine
              y={startRating}
              stroke="#374151"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}
          <Line
            type="monotone"
            dataKey="rating"
            stroke="#CCFF00"
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 6, fill: '#CCFF00', stroke: '#1a1a1a', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Min/Max summary */}
      <div className="flex justify-between mt-3 pt-3 border-t border-[#2a2a2a]">
        <div className="text-center">
          <p className="text-xs text-gray-500">Начало</p>
          <p className="text-sm font-bold text-white">{data[0].rating}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Максимум</p>
          <p className="text-sm font-bold text-[#CCFF00]">{maxR}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Текущ</p>
          <p className="text-sm font-bold text-white">{data[data.length - 1].rating}</p>
        </div>
      </div>
    </div>
  )
}
