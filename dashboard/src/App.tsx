import { useEffect, useState } from 'react'
import './App.css'
import { csvLoader, type DashboardData, type Section } from './dashboard'
import { DashboardContent } from './pages/DashboardContent'

const TABS: Array<[Section, string]> = [
  ['attackEffectiveness', 'Attack Effectiveness'],
  ['attackTrajectories', 'Attack Trajectories'],
  ['comparingAttacks', 'Comparing Attacks'],
  ['cueExplorer', 'What Attackers Changed'],
]

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [section, setSection] = useState<Section>('attackEffectiveness')

  useEffect(() => {
    const loadData = async () => {
      try {
        const [combined, lingfeat] = await Promise.all([
          csvLoader(`${import.meta.env.BASE_URL}data/combined.csv`),
          csvLoader(`${import.meta.env.BASE_URL}data/combined_long_lingfeat.csv`),
        ])
        setData({ combined, lingfeat })
      } catch (loadErr) {
        setError(loadErr instanceof Error ? loadErr.message : 'Failed to load CSV files.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) return <main className="app"><p className="loading">Loading dashboard data...</p></main>
  if (error || !data) return <main className="app"><p className="error">Unable to load dashboard data. {error}</p></main>

  return (
    <main className="app">
      <header className="hero">
        <h1>Divergent Deceptive Competence in Humans and Generative Language Models</h1>
      </header>
      <section className="section-tabs card">
        {TABS.map(([value, label]) => (
          <button type="button" key={value} className={section === value ? 'tab active' : 'tab'} onClick={() => setSection(value)}>{label}</button>
        ))}
      </section>
      <DashboardContent data={data} section={section} />
    </main>
  )
}

export default App