import { useMemo, useState } from 'react'
import { parseNumber, parseText, type CsvRow, type DashboardData } from '../dashboard'

type Attempt = { number: number; text: string; label: number | null; confidence: number | null }
type Trajectory = { id: string; modality: 'human' | 'llm'; original: string; originalLabel: number | null; originalConfidence: number | null; attempts: Attempt[] }

const tokens = (text: string) => text.match(/\w+|[^\w\s]+|\s+/g) ?? []

const changedTokenIndexes = (before: string, after: string) => {
  const source = tokens(before)
  const target = tokens(after)
  const sourceWords = source.map((token) => token.toLowerCase())
  const targetWords = target.map((token) => token.toLowerCase())
  const matrix = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0))
  for (let sourceIndex = source.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let targetIndex = target.length - 1; targetIndex >= 0; targetIndex -= 1) {
      matrix[sourceIndex][targetIndex] = sourceWords[sourceIndex] === targetWords[targetIndex]
        ? matrix[sourceIndex + 1][targetIndex + 1] + 1
        : Math.max(matrix[sourceIndex + 1][targetIndex], matrix[sourceIndex][targetIndex + 1])
    }
  }
  const unchanged = new Set<number>()
  let sourceIndex = 0
  let targetIndex = 0
  while (sourceIndex < source.length && targetIndex < target.length) {
    if (sourceWords[sourceIndex] === targetWords[targetIndex]) {
      unchanged.add(targetIndex); sourceIndex += 1; targetIndex += 1
    } else if (matrix[sourceIndex + 1][targetIndex] >= matrix[sourceIndex][targetIndex + 1]) sourceIndex += 1
    else targetIndex += 1
  }
  return target.map((_, index) => !unchanged.has(index))
}

const trajectoryFromRow = (row: CsvRow): Trajectory | null => {
  const original = parseText(row.original_text)
  const id = parseText(row.rewrite_id)
  const modality = parseText(row.attack_modality)
  if (!id || !original || (modality !== 'human' && modality !== 'llm')) return null
  const attempts = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1
    const text = parseText(row[`rewrite${number}_text`])
    return text ? { number, text, label: parseNumber(row[`rewrite${number}_label`]), confidence: parseNumber(row[`rewrite${number}_confidence`]) } : null
  }).filter((attempt): attempt is Attempt => attempt !== null)
  return attempts.length ? { id, modality, original, originalLabel: parseNumber(row.original_label), originalConfidence: parseNumber(row.original_confidence), attempts } : null
}

const confidenceInOriginalLabel = (originalLabel: number | null, label: number | null, confidence: number | null) => {
  if (originalLabel === null || label === null || confidence === null) return null
  return label === originalLabel ? confidence : 100 - confidence
}

export function TrajectoriesPage({ data }: { data: DashboardData }) {
  const trajectories = useMemo(() => data.combined.map(trajectoryFromRow).filter((item): item is Trajectory => item !== null), [data])
  const [modality, setModality] = useState<'human' | 'llm'>('human')
  const [selectedId, setSelectedId] = useState(() => trajectories.find((item) => item.modality === 'human')?.id ?? '')
  const [attemptIndex, setAttemptIndex] = useState(0)
  const [highlightChanges, setHighlightChanges] = useState(true)
  const sourceLabel = modality === 'human' ? 'Human' : 'Generative language model'
  const availableTrajectories = trajectories.filter((item) => item.modality === modality)
  const trajectory = availableTrajectories.find((item) => item.id === selectedId) ?? availableTrajectories[0]
  if (!trajectory) return <p className="chart-note">No {sourceLabel.toLowerCase()} attack sequences are available.</p>
  const attempt = trajectory.attempts[attemptIndex] ?? trajectory.attempts[0]
  const previousText = attemptIndex ? trajectory.attempts[attemptIndex - 1].text : trajectory.original
  const changed = changedTokenIndexes(previousText, attempt.text)
  const currentOriginalConfidence = confidenceInOriginalLabel(trajectory.originalLabel, attempt.label, attempt.confidence)
  const confidenceValues = [trajectory.originalConfidence, ...trajectory.attempts.map((item) => confidenceInOriginalLabel(trajectory.originalLabel, item.label, item.confidence))].map((value) => value ?? 0)
  const confidencePosition = Math.max(0, Math.min(100, currentOriginalConfidence ?? 0))
  const confidenceChange = currentOriginalConfidence === null || trajectory.originalConfidence === null ? null : currentOriginalConfidence - trajectory.originalConfidence
  const direction = trajectory.originalLabel === 1 ? 'Moving truthful to deceptive' : 'Moving deceptive to truthful'

  return <section className="trajectory-page">
    <header className="trajectory-heading">
      <div><p className="eyebrow">Attack trajectories</p><h2>How attack sequences develop</h2><p>Investigate Human and Generative language model rewrites one attempt at a time to see how they develop.</p></div>
      <div className="trajectory-controls">
        <div className="trajectory-source" aria-label="Attack source"><span>Source</span>{([['human', 'Human'], ['llm', 'Generative language model']] as const).map(([value, label]) => <button className={modality === value ? 'selected' : ''} key={value} onClick={() => { setModality(value); setSelectedId(trajectories.find((item) => item.modality === value)?.id ?? ''); setAttemptIndex(0) }} type="button">{label}</button>)}</div>
        <label className="trajectory-select" htmlFor="trajectory-sequence">attack ID<select id="trajectory-sequence" value={trajectory.id} onChange={(event) => { setSelectedId(event.target.value); setAttemptIndex(0) }}>{availableTrajectories.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.attempts.length} attempts</option>)}</select></label>
      </div>
    </header>

    <section className="trajectory-overview card">
      <div className="verdict-block"><span>{sourceLabel} · attack ID {trajectory.id}</span><strong>{direction}</strong></div>
      <div className="needle-block"><div className="needle-labels"><span>Low confidence in original label</span><span>High confidence in original label</span></div><div className="confidence-needle"><i style={{ left: `${confidencePosition}%` }} /></div><strong>Attempt {attempt.number} · Confidence in original label: {currentOriginalConfidence?.toFixed(1) ?? 'n/a'}</strong></div>
      <Sparkline values={confidenceValues} activeIndex={attemptIndex + 1} />
    </section>

    <section className="trajectory-stepper" aria-label="Attack attempt selector"><span>Attempt</span>{trajectory.attempts.map((item, index) => <button className={index === attemptIndex ? 'active' : ''} key={item.number} onClick={() => setAttemptIndex(index)} type="button">{item.number}</button>)}<label><input checked={highlightChanges} onChange={(event) => setHighlightChanges(event.target.checked)} type="checkbox" /> Highlight changes from previous attempt</label></section>

    <aside className="trajectory-inspector">
      <div className="trajectory-texts">
        <article><h3>Original statement</h3><p>{trajectory.original}</p><footer className="trajectory-text-meta">Predicted label: {trajectory.originalLabel === 1 ? 'Truthful' : 'Deceptive'} · Confidence: {trajectory.originalConfidence?.toFixed(1) ?? 'n/a'}</footer></article>
        <article><h3>Attempt {attempt.number}</h3><p>{tokens(attempt.text).map((token, index) => <span className={highlightChanges && changed[index] && /\w/.test(token) ? 'word-change' : ''} key={`${token}-${index}`}>{token}</span>)}</p><footer className={attempt.label !== trajectory.originalLabel ? 'trajectory-text-meta successful' : 'trajectory-text-meta unsuccessful'}><strong>Confidence change: {confidenceChange === null ? 'n/a' : `${confidenceChange >= 0 ? '+' : ''}${confidenceChange.toFixed(2)}`}</strong><span>Predicted label: {attempt.label === 1 ? 'Truthful' : 'Deceptive'} · Confidence: {attempt.confidence?.toFixed(1) ?? 'n/a'}</span></footer></article>
      </div>
      {highlightChanges && <p className="trajectory-diff-note">Highlighted words show changed words to the previous attempt. If attempt one, they show changes from the original statement.</p>}
    </aside>
  </section>
}

function Sparkline({ activeIndex, values }: { activeIndex: number; values: number[] }) {
  const width = 300
  const height = 112
  const left = 30
  const right = 8
  const top = 8
  const bottom = 24
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const x = (index: number) => left + (index / Math.max(1, values.length - 1)) * chartWidth
  const y = (value: number) => top + (1 - value / 100) * chartHeight
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  return <div className="sparkline"><span>Confidence in original label</span><svg aria-label="Confidence in original label over attempts" viewBox={`0 0 ${width} ${height}`}><line className="spark-axis" x1={left} x2={left} y1={top} y2={top + chartHeight} /><line className="spark-axis" x1={left} x2={width - right} y1={top + chartHeight} y2={top + chartHeight} />{[0, 50, 100].map((value) => <g key={value}><line className="spark-guide" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text className="spark-tick" x={left - 5} y={y(value) + 3}>{value}</text></g>)}<text className="spark-tick" x={left} y={height - 5}>Original</text><text className="spark-tick" textAnchor="end" x={width - right} y={height - 5}>Attempt {values.length - 1}</text><polyline fill="none" points={points} stroke="#78a9c7" strokeWidth="2" />{values.map((value, index) => <circle cx={x(index)} cy={y(value)} fill={index === activeIndex ? '#dc9a7a' : '#78a9c7'} key={index} r={index === activeIndex ? 4 : 2.5} />)}</svg></div>
}