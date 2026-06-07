import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'


const RISK_COLORS = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#ef4444',
  Critical: '#b91c1c',
}

function riskColor(score) {
  if (score <= 3) return '#22c55e'
  if (score <= 6) return '#f59e0b'
  if (score <= 8) return '#ef4444'
  return '#b91c1c'
}

export default function Dashboard({ api, docs }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const analyze = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${api}/analyze`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Analysis failed')
      }
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!docs.length) {
    return <p className="doc-empty">Upload contracts first, then analyze them here.</p>
  }

  return (
    <div className="dashboard">
      <div className="dashboard-toolbar">
        <button className="analyze-btn" onClick={analyze} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze All Contracts'}
        </button>
        {error && <p className="upload-status error">{error}</p>}
      </div>

      {!data && !loading && (
        <p className="doc-empty">Click "Analyze All Contracts" to generate charts and insights.</p>
      )}

      {data && <DashboardCharts data={data} />}
    </div>
  )
}

function DashboardCharts({ data }) {
  const { analysis, overall_recommendation } = data
  if (!analysis || !analysis.length) {
    return <p className="doc-empty">No analysis data available.</p>
  }

  const barData = analysis.map(a => ({
    name: a.doc_name.replace(/\.pdf$/i, '').slice(0, 20),
    'Risk Score': a.risk_score ?? 0,
  }))

  const riskDist = Object.entries(
    analysis.reduce((acc, a) => {
      const level = a.risk_level || 'Unknown'
      acc[level] = (acc[level] || 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

  const maxTerms = Math.max(...analysis.map(a => Math.max(a.pros?.length || 0, a.cons?.length || 0)))

  const radarData = []
  const metrics = ['Pricing', 'Contract Terms', 'Risk Level', 'Service Level', 'Flexibility']
  metrics.forEach(metric => {
    const point = { metric }
    analysis.forEach(a => {
      const score = computeMetricScore(metric, a)
      point[a.doc_name.replace(/\.pdf$/i, '').slice(0, 15)] = score
    })
    radarData.push(point)
  })

  return (
    <div className="dashboard-grid">
      <div className="dash-section">
        <h3>Risk Scores</h3>
        <div className="risk-cards">
          {analysis.map(a => (
            <div
              key={a.doc_name}
              className="risk-card"
              style={{ borderLeftColor: riskColor(a.risk_score) }}
            >
              <div className="risk-card-name">{a.doc_name}</div>
              <div className="risk-card-score" style={{ color: riskColor(a.risk_score) }}>
                {a.risk_score}/10
              </div>
              <div className="risk-bar-bg">
                <div
                  className="risk-bar-fill"
                  style={{ width: `${(a.risk_score / 10) * 100}%`, background: riskColor(a.risk_score) }}
                />
              </div>
              <div className="risk-card-level" style={{ color: riskColor(a.risk_score) }}>
                {a.risk_level}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dash-section chart-box">
        <h3>Risk Score Comparison</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 10]} />
            <Tooltip />
            <Bar dataKey="Risk Score" fill="#667eea" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {riskDist.length > 1 && (
        <div className="dash-section chart-box">
          <h3>Risk Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={riskDist}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                dataKey="value"
                label={({ name, value }) => `${name} (${value})`}
              >
                {riskDist.map((entry, i) => (
                  <Cell key={i} fill={RISK_COLORS[entry.name] || '#888'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="dash-section chart-box full-width">
        <h3>Multi-Dimension Comparison</h3>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 10 }} />
            {analysis.map((a, i) => {
              const name = a.doc_name.replace(/\.pdf$/i, '').slice(0, 15)
              const color = COLORS[i % COLORS.length]
              return (
                <Radar
                  key={a.doc_name}
                  name={name}
                  dataKey={name}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.15}
                />
              )
            })}
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="dash-section full-width">
        <h3>Key Terms Comparison</h3>
        <div className="terms-grid">
          <div className="terms-header">Metric</div>
          {analysis.map(a => (
            <div key={a.doc_name} className="terms-header">{a.doc_name}</div>
          ))}
          {renderTermRow('Pricing', analysis, 'pricing')}
          {renderTermRow('Duration', analysis, 'contract_duration')}
          {renderTermRow('Termination', analysis, 'termination_clause')}
          {renderTermRow('Liability Cap', analysis, 'liability_cap')}
          {renderTermRow('Service Level', analysis, 'service_level')}
        </div>
      </div>

      <div className="dash-section full-width">
        <h3>Pros & Cons per Vendor</h3>
        <div className="pros-cons-grid">
          {analysis.map(a => (
            <div key={a.doc_name} className="pros-cons-card">
              <div className="pc-name">{a.doc_name}</div>
              <div className="pc-assessment">{a.overall_assessment}</div>
              {a.pros?.length > 0 && (
                <div className="pc-pros">
                  <strong>Pros</strong>
                  {a.pros.map((p, i) => <span key={i} className="tag tag-pro">{p}</span>)}
                </div>
              )}
              {a.cons?.length > 0 && (
                <div className="pc-cons">
                  <strong>Cons</strong>
                  {a.cons.map((c, i) => <span key={i} className="tag tag-con">{c}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {overall_recommendation && (
        <div className="dash-section full-width recommendation">
          <h3>Recommendation</h3>
          <p>{overall_recommendation}</p>
        </div>
      )}
    </div>
  )
}

const COLORS = ['#667eea', '#764ba2', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4']

function computeMetricScore(metric, a) {
  switch (metric) {
    case 'Pricing': {
      const v = a.risk_score ? Math.max(1, 11 - a.risk_score) : 5
      return v
    }
    case 'Contract Terms':
      return a.pros?.length ? Math.min(10, a.pros.length * 3 + 3) : 5
    case 'Risk Level':
      return a.risk_score ? Math.max(1, 11 - a.risk_score) : 5
    case 'Service Level': {
      const sla = (a.key_terms?.service_level || '').toLowerCase()
      if (sla.includes('99.9') || sla.includes('99.99')) return 8
      if (sla.includes('99')) return 6
      return 5
    }
    case 'Flexibility': {
      const term = (a.key_terms?.termination_clause || '').toLowerCase()
      if (term.includes('30') || term.includes('immediate')) return 8
      if (term.includes('60')) return 5
      return 4
    }
    default:
      return 5
  }
}

function renderTermRow(label, analysis, key) {
  return (
    <>
      <div className="terms-label">{label}</div>
      {analysis.map(a => (
        <div key={a.doc_name} className="terms-value">{a.key_terms?.[key] || '—'}</div>
      ))}
    </>
  )
}
