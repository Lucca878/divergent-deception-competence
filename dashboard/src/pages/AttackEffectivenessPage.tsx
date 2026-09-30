import { useEffect, useMemo, useState } from 'react'
import { bestAttemptField, COLORS, parseNumber, parseText, type CsvRow, type DashboardData } from '../dashboard'

type Modality = 'human' | 'llm'
type Sequence = {
  id: string
  modality: Modality
  veracity: 'Truthful' | 'Deceptive'
  confidenceChange: number
  attempt: number | null
  successful: boolean
  original: string
  rewrite: string
}

const DIRECTIONS = [
  { veracity: 'Truthful' as const, title: 'Moving truthful to deceptive', note: 'A successful attack flips the original prediction of the classifier, lowering its confidence that the statement is truthful.' },
  { veracity: 'Deceptive' as const, title: 'Moving deceptive to truthful', note: 'A successful attack flips the original prediction of the classifier, lowering its confidence that the statement is deceptive.' },
]

const sequenceFromRow = (row: CsvRow): Sequence | null => {
  const modality = parseText(row.attack_modality)
  const veracity = parseText(row.original_veracity)
  const id = parseText(row.rewrite_id)
  const confidenceChange = parseNumber(row.max_conf_change)
  if ((modality !== 'human' && modality !== 'llm') || (veracity !== 'Truthful' && veracity !== 'Deceptive') || !id || confidenceChange === null) return null
  return {
    id,
    modality,
    veracity,
    confidenceChange,
    attempt: parseNumber(row.max_conf_change_attempt),
    successful: parseNumber(row.asr) === 1,
    original: parseText(row.original_text),
    rewrite: parseText(bestAttemptField(row, 'text')),
  }
}

const percentile = (value: number, values: number[]) => values.length ? Math.round((values.filter((candidate) => candidate <= value).length / values.length) * 100) : 0

export function AttackEffectivenessPage({ data }: { data: DashboardData }) {
  const sequences = useMemo(() => data.combined.map(sequenceFromRow).filter((row): row is Sequence => row !== null), [data])
  const selectedIdsFromUrl = () => {
    const params = new URLSearchParams(window.location.search)
    return {
      Truthful: params.get('truthfulSequence') ?? params.get('sequence'),
      Deceptive: params.get('deceptiveSequence'),
    }
  }
  const [selectedIds, setSelectedIds] = useState(selectedIdsFromUrl)
  const [attacker, setAttacker] = useState<'all' | Modality>('all')

  useEffect(() => {
    const syncFromUrl = () => setSelectedIds(selectedIdsFromUrl())
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  const selectedByDirection = {
    Truthful: sequences.find((sequence) => sequence.id === selectedIds.Truthful) ?? null,
    Deceptive: sequences.find((sequence) => sequence.id === selectedIds.Deceptive) ?? null,
  }
  const selectSequence = (veracity: Sequence['veracity'], sequence: Sequence | null) => {
    const url = new URL(window.location.href)
    const param = veracity === 'Truthful' ? 'truthfulSequence' : 'deceptiveSequence'
    if (sequence) url.searchParams.set(param, sequence.id)
    else url.searchParams.delete(param)
    url.searchParams.delete('sequence')
    window.history.pushState({}, '', url)
    setSelectedIds((current) => ({ ...current, [veracity]: sequence?.id ?? null }))
  }

  return <section className="sequence-map-page">
    <header className="sequence-map-heading">
      <div>
        <p className="eyebrow">Attack effectiveness</p>
        <h2>Changing classifer confidence</h2>
        <p>Each point is the most successful (i.e., largest change in classifier confidence) modification within an attack sequence. Click on a point to explore modifications and the associated original statements.</p>
      </div>
      <div className="map-filter" aria-label="Show attacker">
        {([['all', 'Both'], ['human', 'Human'], ['llm', 'Generative language model']] as const).map(([value, label]) => <button className={attacker === value ? 'selected' : ''} key={value} onClick={() => setAttacker(value)} type="button">{label}</button>)}
      </div>
    </header>

    <div className="sequence-legend" aria-label="Attacker legend">
      <span><i className="modality-dot human" />Human</span>
      <span><i className="modality-dot llm" />Generative language model</span>
      <span className="legend-note">Circled point: selected modification</span>
    </div>

    <div className="sequence-map-grid">
      {DIRECTIONS.map((direction) => {
        const directionSequences = sequences.filter((sequence) => sequence.veracity === direction.veracity && (attacker === 'all' || sequence.modality === attacker))
        const selected = selectedByDirection[direction.veracity]
        const selectedInCell = selected && (attacker === 'all' || selected.modality === attacker) ? selected : null
        return <DirectionPlot direction={direction} key={direction.veracity} onSelect={selectSequence} selected={selectedInCell} sequences={directionSequences} />
      })}
    </div>
  </section>
}

function DirectionPlot({ direction, onSelect, selected, sequences }: { direction: typeof DIRECTIONS[number]; onSelect: (veracity: Sequence['veracity'], sequence: Sequence | null) => void; selected: Sequence | null; sequences: Sequence[] }) {
  const width = 720
  const height = 254
  const padding = 34
  const plotBottom = 202
  const binCount = 24
  const x = (value: number) => padding + ((value + 100) / 200) * (width - padding * 2)
  const y = (sequence: Sequence, index: number) => 40 + ((index * 37) % 156) + (sequence.modality === 'human' ? -3 : 3)
  const cellPopulation = sequences.filter((sequence) => sequence.veracity === direction.veracity)
  const distributions = (['human', 'llm'] as const).map((modality) => {
    const bins = Array.from({ length: binCount }, () => 0)
    sequences.filter((sequence) => sequence.modality === modality).forEach((sequence) => {
      const index = Math.min(binCount - 1, Math.max(0, Math.floor(((sequence.confidenceChange + 100) / 200) * binCount)))
      bins[index] += 1
    })
    return { modality, bins }
  })
  const maxBin = Math.max(1, ...distributions.flatMap(({ bins }) => bins))
  const binWidth = (width - padding * 2) / binCount

  return <article className="sequence-cell direction-cell">
    <header><div><h3>{direction.title}</h3><p>{direction.note}</p></div><strong>n = {sequences.length}</strong></header>
    <svg aria-label={direction.title} className="sequence-plot" role="img" viewBox={`0 0 ${width} ${height}`}>
      {distributions.map(({ modality, bins }) => bins.map((count, index) => count > 0 && <rect className={`distribution-bar ${modality}`} fill={modality === 'human' ? COLORS.human : COLORS.llm} height={(count / maxBin) * 64} key={`${modality}-${index}`} width={Math.max(2, binWidth - 2)} x={padding + index * binWidth + 1} y={plotBottom - (count / maxBin) * 64} />))}
      <line className="plot-baseline" x1={x(0)} x2={x(0)} y1="28" y2={plotBottom} />
      <line className="plot-axis" x1={padding} x2={width - padding} y1={plotBottom} y2={plotBottom} />
      <text className="plot-tick" x={padding} y="224">−100</text><text className="plot-tick center" x={x(0)} y="224">0</text><text className="plot-tick end" x={width - padding} y="224">+100</text>
      {sequences.map((sequence, index) => <circle className={selected?.id === sequence.id ? 'sequence-point selected' : 'sequence-point'} cx={x(sequence.confidenceChange)} cy={y(sequence, index)} fill={sequence.modality === 'human' ? COLORS.human : COLORS.llm} key={sequence.id} onClick={() => onSelect(direction.veracity, sequence)} r="4"><title>{`${sequence.modality === 'human' ? 'Human' : 'Generative language model'} · ${sequence.confidenceChange.toFixed(1)} confidence change`}</title></circle>)}
    </svg>
    <footer><span>Less confidence in original label</span><span>More confidence in original label</span></footer>
    {selected && <SequenceInspector population={cellPopulation} sequence={selected} onClose={() => onSelect(direction.veracity, null)} />}
  </article>
}

function SequenceInspector({ onClose, population, sequence }: { onClose: () => void; population: Sequence[]; sequence: Sequence }) {
  const typicality = percentile(sequence.confidenceChange, population.map((item) => item.confidenceChange))
  return <aside className="sequence-inspector" aria-label="Selected sequence detail">
    <header><div><span className={`modality-dot ${sequence.modality}`} />{sequence.modality === 'human' ? 'Human' : 'Generative language model'}</div><button aria-label="Close sequence" onClick={onClose} type="button">×</button></header>
    <div className={sequence.successful ? 'sequence-summary successful' : 'sequence-summary unsuccessful'}><strong>{sequence.successful ? 'Successful attack' : 'Unsuccessful attack'}</strong><span>Confidence change {sequence.confidenceChange.toFixed(2)} · Attempt {sequence.attempt ?? 'n/a'} · Within {typicality}th percentile for current attack direction</span></div>
    <div className="sequence-texts">
      <article><h3>Original statement</h3><p>{sequence.original}</p></article>
      <article><h3>Selected rewrite</h3><p>{sequence.rewrite}</p></article>
    </div>
  </aside>
}