import { useMemo, useState } from 'react'
import { bestAttemptField, FEATURE_OPTIONS, parseNumber, parseText, type CsvRow, type DashboardData, type FeatureOption } from '../dashboard'

type Modality = 'human' | 'llm'
type Veracity = 'Truthful' | 'Deceptive'
type ChangeDirection = 'increase' | 'decrease' | 'any'

interface FeatureSample {
  key: string
  statementId: string
  rewriteId: string
  modality: Modality
  veracity: Veracity
  asr: number
  originalLabel: number | null
  originalConfidence: number | null
  rewriteLabel: number | null
  rewriteConfidence: number | null
  attempt: number | null
  originalText: string
  rewriteText: string
  originalValues: Record<string, number | null>
  rewriteValues: Record<string, number | null>
}

const FEATURE_DETAILS: Record<string, { family: string; composition: string }> = {
  num_sentences: { family: 'Structure', composition: 'Sentence count: the number of sentence segments in the text.' },
  num_words: { family: 'Length', composition: 'Word count: the number of words in the text.' },
  num_syllables: { family: 'Length', composition: 'Syllable count across all words.' },
  avg_syllabes_per_word: { family: 'Length', composition: 'Average syllables per word: syllables divided by words.' },
  fk_grade: { family: 'Readability', composition: 'Flesch–Kincaid grade level, derived from words per sentence and syllables per word.' },
  fk_read: { family: 'Readability', composition: 'Flesch Reading Ease, derived from words per sentence and syllables per word; higher scores indicate easier reading.' },
  Analytic: { family: 'Style', composition: 'LIWC analytic-thinking score; the export provides an aggregate score, not individual word attributions.' },
  Authentic: { family: 'Style', composition: 'LIWC authenticity score; the export provides an aggregate score, not individual word attributions.' },
  Tone: { family: 'Style', composition: 'LIWC emotional tone score; the export provides an aggregate score, not individual word attributions.' },
  tone_pos: { family: 'Emotion', composition: 'Percentage of words in the positive-emotion category.' },
  tone_neg: { family: 'Emotion', composition: 'Percentage of words in the negative-emotion category.' },
  Cognition: { family: 'Language cues', composition: 'Percentage of words associated with cognitive processes.' },
  memory: { family: 'Language cues', composition: 'Percentage of words associated with memory.' },
  focuspast: { family: 'Language cues', composition: 'Percentage of words referring to the past.' },
  focuspresent: { family: 'Language cues', composition: 'Percentage of words referring to the present.' },
  focusfuture: { family: 'Language cues', composition: 'Percentage of words referring to the future.' },
  'Contextual Embedding': { family: 'Language cues', composition: 'Aggregate contextual-embedding score; the export does not identify individual contributing words.' },
  'Reality Monitoring': { family: 'Memory cues', composition: 'Composite Reality Monitoring score, combining perceptual, spatial, temporal, motion, affective, and cognitive cues.' },
  'Concreteness score': { family: 'Meaning', composition: 'Average concreteness score across the words in the text.' },
  'Perceptual details': { family: 'Memory cues', composition: 'Percentage of words classified as perceptual details.' },
  'Self-reference': { family: 'Language cues', composition: 'Percentage of first-person self-reference words.' },
  'Other-reference': { family: 'Language cues', composition: 'Percentage of words referring to other people.' },
  People: { family: 'Memory cues', composition: 'Percentage of words referring to people.' },
  'Temporal details': { family: 'Memory cues', composition: 'Percentage of words referring to time.' },
  'Spatial details': { family: 'Memory cues', composition: 'Percentage of words referring to places or spatial relations.' },
  'Quantity details': { family: 'Memory cues', composition: 'Percentage of words expressing quantities.' },
  adverb_pct: { family: 'Grammar', composition: 'Percentage of words that are adverbs.' },
  verb_pct: { family: 'Grammar', composition: 'Percentage of words that are verbs.' },
  noun_pct: { family: 'Grammar', composition: 'Percentage of words that are nouns.' },
  adj_pct: { family: 'Grammar', composition: 'Percentage of words that are adjectives.' },
}

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim()

function featureDelta(sample: FeatureSample, feature: FeatureOption): number | null {
  const before = sample.originalValues[feature.id]
  const after = sample.rewriteValues[feature.id]
  return before === null || after === null ? null : after - before
}

function formatFeatureValue(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : value.toFixed(2)
}

function quantile(values: number[], probability: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * probability
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  return lower === upper ? sorted[lower] : sorted[lower] * (upper - index) + sorted[upper] * (index - lower)
}

function transitionLabel(veracity: Veracity): string {
  return veracity === 'Truthful' ? 'Moving truthful to deceptive' : 'Moving deceptive to truthful'
}

function confidenceInOriginalLabel(originalLabel: number | null, label: number | null, confidence: number | null): number | null {
  if (originalLabel === null || label === null || confidence === null) return null
  return label === originalLabel ? confidence : 100 - confidence
}

function ConfidenceShift({ sample }: { sample: FeatureSample }) {
  const endingConfidence = confidenceInOriginalLabel(sample.originalLabel, sample.rewriteLabel, sample.rewriteConfidence)
  const change = endingConfidence === null || sample.originalConfidence === null ? null : endingConfidence - sample.originalConfidence
  const start = sample.originalConfidence
  const y = (value: number) => 70 - (value / 100) * 56

  return <div className="cue-confidence-shift">
    <div className="cue-confidence-heading"><span>Classifier confidence change</span></div>
    {start !== null && endingConfidence !== null ? <div className="cue-confidence-plot-row"><svg viewBox="0 0 330 100" role="img" aria-label={`Confidence in original label: original ${start.toFixed(2)}; rewrite ${endingConfidence.toFixed(2)}; change ${change === null ? 'unavailable' : change.toFixed(2)}`}>
      {[0, 50, 100].map((tick) => <g key={tick}><line className="cue-confidence-guide" x1="42" x2="320" y1={y(tick)} y2={y(tick)} /><text className="cue-confidence-tick" x="34" y={y(tick) + 3} textAnchor="end">{tick}</text></g>)}
      <line className="cue-confidence-path" x1="92" x2="267" y1={y(start)} y2={y(endingConfidence)} />
      <circle className="cue-confidence-point original" cx="92" cy={y(start)} r="4.5" />
      <circle className="cue-confidence-point rewrite" cx="267" cy={y(endingConfidence)} r="4.5" />
      <text className="cue-confidence-value" x="92" y={Math.max(9, y(start) - 7)} textAnchor="middle">{start.toFixed(1)}</text>
      <text className="cue-confidence-value" x="267" y={Math.max(9, y(endingConfidence) - 7)} textAnchor="middle">{endingConfidence.toFixed(1)}</text>
      <text className="cue-confidence-caption" x="92" y="94" textAnchor="middle">Original</text>
      <text className="cue-confidence-caption" x="267" y="94" textAnchor="middle">Rewrite</text>
    </svg>{change !== null && <strong className="cue-confidence-change-badge">Δ {change > 0 ? '+' : ''}{change.toFixed(2)}</strong>}</div> : <p className="cue-confidence-missing">Confidence data unavailable.</p>}
  </div>
}

function InteractionChart({ feature, samples }: {
  feature: FeatureOption
  samples: FeatureSample[]
}) {
  const width = 760
  const height = 250
  const plot = { left: 55, right: 742, top: 20, bottom: 202 }
  const values = samples.map((sample) => featureDelta(sample, feature)).filter((value): value is number => value !== null)
  const groups: Array<{ modality: Modality; veracity: Veracity; items: Array<{ sample: FeatureSample; delta: number }> }> = (['human', 'llm'] as const).flatMap((modality) => (['Truthful', 'Deceptive'] as const).map((veracity) => ({
    modality,
    veracity,
    items: samples.map((sample) => ({ sample, delta: featureDelta(sample, feature) })).filter((item): item is { sample: FeatureSample; delta: number } => item.sample.modality === modality && item.sample.veracity === veracity && item.delta !== null),
  })))
  const means = (modality: Modality, veracity: Veracity) => {
    const group = groups.find((item) => item.modality === modality && item.veracity === veracity)
    const cellValues = group?.items.map((item) => item.delta) ?? []
    return cellValues.length ? cellValues.reduce((sum, value) => sum + value, 0) / cellValues.length : null
  }
  const meanValues = (['human', 'llm'] as const).flatMap((modality) => (['Truthful', 'Deceptive'] as const).map((veracity) => means(modality, veracity)).filter((value): value is number => value !== null))
  const low = Math.min(0, quantile(values, 0.05), ...meanValues)
  const high = Math.max(0, quantile(values, 0.95), ...meanValues)
  const padding = Math.max((high - low) * 0.08, 0.15)
  const min = low - padding
  const max = high + padding
  const y = (value: number) => plot.bottom - ((value - min) / (max - min || 1)) * (plot.bottom - plot.top)
  const xAt = (veracity: Veracity) => veracity === 'Truthful' ? 220 : 570
  const zeroY = min <= 0 && max >= 0 ? y(0) : null
  const clipId = `cue-clip-${feature.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  return (
    <article className="cue-interaction-chart card">
      <header><div><h3>{feature.label} change</h3></div><span>n = {values.length}</span></header>
      <svg className="cue-interaction-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${feature.label} change distribution by attacker and attack direction`}>
        <defs><clipPath id={clipId}><rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} /></clipPath></defs>
        <line className="cue-axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
        <g clipPath={`url(#${clipId})`}>
        {groups.map((group) => {
          const visible = group.items.length > 90
            ? group.items.filter((_, index) => index % Math.ceil(group.items.length / 90) === 0).slice(0, 90)
            : group.items
          const jitter = group.modality === 'human' ? -14 : 14
          return visible.map(({ sample, delta }, index) => {
            const deterministicJitter = (((index * 37 + Number(sample.rewriteId) * 13) % 31) - 15) * 1.1
            return <circle key={`${sample.key}-${group.modality}-${group.veracity}`} cx={xAt(group.veracity) + jitter + deterministicJitter} cy={y(delta)} r="2.6" className={`cue-dot ${group.modality}`}><title>{`${group.modality === 'human' ? 'Human' : 'Generative language model'} · ${transitionLabel(group.veracity)} · Δ ${delta.toFixed(2)}`}</title></circle>
          })
        })}
        {(['human', 'llm'] as const).map((modality) => {
          const truthfulMean = means(modality, 'Truthful')
          const deceptiveMean = means(modality, 'Deceptive')
          if (truthfulMean === null || deceptiveMean === null) return null
          return <g key={modality}><line className={`cue-mean-line ${modality}`} x1={xAt('Truthful')} x2={xAt('Deceptive')} y1={y(truthfulMean)} y2={y(deceptiveMean)} /><circle className={`cue-mean ${modality}`} cx={xAt('Truthful')} cy={y(truthfulMean)} r="4" /><circle className={`cue-mean ${modality}`} cx={xAt('Deceptive')} cy={y(deceptiveMean)} r="4" /></g>
        })}
        </g>
        {zeroY !== null && <g><line className="cue-zero" x1={plot.left} x2={plot.right} y1={zeroY} y2={zeroY} /><text className="cue-tick-label cue-zero-label" x={plot.left - 7} y={zeroY + 3} textAnchor="end">0</text></g>}
        <text className="cue-axis-label" x={xAt('Truthful')} y="226" textAnchor="middle">Moving truthful to deceptive</text>
        <text className="cue-axis-label" x={xAt('Deceptive')} y="226" textAnchor="middle">Moving deceptive to truthful</text>
        <text className="cue-axis-label" transform={`translate(14 ${(plot.top + plot.bottom) / 2}) rotate(-90)`} textAnchor="middle">Rewrite − original</text>
      </svg>
      <footer className="cue-plot-legend"><span><i className="cue-legend-dot human" />Human</span><span><i className="cue-legend-dot llm" />Generative language model</span><span>Each point is the best rewrite within an attack sequence</span><span>Dotted line: Rewrite-original = 0; no change</span></footer>
    </article>
  )
}

export function CueExplorerPage({ data }: { data: DashboardData }) {
  const [selectedFeature, setSelectedFeature] = useState(FEATURE_OPTIONS.find((feature) => feature.id === 'Reality Monitoring')?.id ?? FEATURE_OPTIONS[0].id)
  const [modalityFilter, setModalityFilter] = useState<'all' | Modality>('all')
  const [veracityFilter, setVeracityFilter] = useState<'all' | Veracity>('all')
  const [direction, setDirection] = useState<ChangeDirection>('any')
  const [limit, setLimit] = useState(5)

  const samples = useMemo(() => {
    const linguisticByRewrite = new Map<string, { original?: CsvRow; rewrites: CsvRow[] }>()
    data.lingfeat.forEach((row) => {
      const id = parseText(row.rewrite_id)
      if (!id) return
      const pair = linguisticByRewrite.get(id) ?? { rewrites: [] }
      if (parseText(row.text_type) === 'original') pair.original = row
      else if (parseText(row.text_type) === 'rewrite') pair.rewrites.push(row)
      linguisticByRewrite.set(id, pair)
    })
    const linguisticByOriginal = new Map<string, { original: CsvRow; rewrites: CsvRow[] }>()
    linguisticByRewrite.forEach((pair) => {
      if (!pair.original) return
      const key = [normalizeText(parseText(pair.original.text)), parseText(pair.original.attack_modality), parseText(pair.original.original_veracity)].join('\t')
      const matching = linguisticByOriginal.get(key) ?? { original: pair.original, rewrites: [] }
      matching.rewrites.push(...pair.rewrites)
      linguisticByOriginal.set(key, matching)
    })
    return data.combined.flatMap((row) => {
      const modality = parseText(row.attack_modality).toLowerCase()
      const originalVeracity = parseText(row.original_veracity)
      const rewriteId = parseText(row.rewrite_id)
      if ((modality !== 'human' && modality !== 'llm') || (originalVeracity !== 'Truthful' && originalVeracity !== 'Deceptive') || !rewriteId) return []
      const originalText = parseText(row.original_text)
      const bestText = parseText(bestAttemptField(row, 'text'))
      const key = [normalizeText(originalText), modality, originalVeracity].join('\t')
      const pair = linguisticByOriginal.get(key)
      if (!pair?.rewrites.length) return []
      const rewriteRow = pair.rewrites.find((candidate) => normalizeText(parseText(candidate.text)) === normalizeText(bestText))
      if (!rewriteRow) return []
      const originalValues = Object.fromEntries(FEATURE_OPTIONS.map((feature) => [feature.id, parseNumber(pair.original?.[feature.column])])) as Record<string, number | null>
      const rewriteValues = Object.fromEntries(FEATURE_OPTIONS.map((feature) => [feature.id, parseNumber(rewriteRow[feature.column])])) as Record<string, number | null>
      return [{
        key: rewriteId,
        statementId: parseText(row.statement_id),
        rewriteId,
        modality,
        veracity: originalVeracity,
        asr: parseNumber(row.asr) ?? 0,
        originalLabel: parseNumber(row.original_label),
        originalConfidence: parseNumber(row.original_confidence),
        rewriteLabel: parseNumber(bestAttemptField(row, 'label')),
        rewriteConfidence: parseNumber(bestAttemptField(row, 'confidence')),
        attempt: parseNumber(row.max_conf_change_attempt),
        originalText,
        rewriteText: bestText,
        originalValues,
        rewriteValues,
      } satisfies FeatureSample]
    })
  }, [data])

  const activeFeature = FEATURE_OPTIONS.find((feature) => feature.id === selectedFeature) ?? FEATURE_OPTIONS[0]
  const rankedExamples = useMemo(() => samples
    .filter((sample) => modalityFilter === 'all' || sample.modality === modalityFilter)
    .filter((sample) => veracityFilter === 'all' || sample.veracity === veracityFilter)
    .map((sample) => ({ sample, delta: featureDelta(sample, activeFeature) }))
    .filter((item): item is { sample: FeatureSample; delta: number } => item.delta !== null)
    .filter(({ delta }) => direction === 'increase' ? delta > 0 : direction === 'decrease' ? delta < 0 : true)
    .sort((left, right) => direction === 'decrease' ? left.delta - right.delta : direction === 'any' ? Math.abs(right.delta) - Math.abs(left.delta) : right.delta - left.delta)
    .slice(0, limit), [activeFeature, direction, limit, modalityFilter, samples, veracityFilter])

  const componentInfo = FEATURE_DETAILS[activeFeature.id] ?? { family: 'Feature', composition: 'Aggregate linguistic feature score.' }

  return (
    <section className="cue-explorer-page">
      <header className="cue-explorer-heading">
        <div>
          <p className="eyebrow">What attackers changed</p>
          <h2>Cue Explorer</h2>
          <p>Select a linguistic feature to compare its change across attack modality and original veracity, then inspect the actual rewrites.</p>
        </div>
      </header>

      <section className="cue-results card">
        <header className="cue-results-heading">
          <div><p className="eyebrow">Selected feature</p><h2>{activeFeature.label}</h2><p>{componentInfo.composition}</p></div>
          <label className="cue-feature-select">Linguistic feature<select value={selectedFeature} onChange={(event) => setSelectedFeature(event.target.value)}>{FEATURE_OPTIONS.map((feature) => <option key={feature.id} value={feature.id}>{feature.label}</option>)}</select></label>
        </header>
        <InteractionChart feature={activeFeature} samples={samples} />
        <div className="cue-controls cue-example-filters">
          <label>Attacker<select value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value as 'all' | Modality)}><option value="all">All</option><option value="human">Human</option><option value="llm">Generative language model</option></select></label>
          <label>Original veracity<select value={veracityFilter} onChange={(event) => setVeracityFilter(event.target.value as 'all' | Veracity)}><option value="all">All</option><option value="Truthful">Truthful</option><option value="Deceptive">Deceptive</option></select></label>
          <label>Rank by change<select value={direction} onChange={(event) => setDirection(event.target.value as ChangeDirection)}><option value="any">Largest magnitude</option><option value="increase">Largest increase</option><option value="decrease">Largest decrease</option></select></label>
          <label>Show<select value={limit} onChange={(event) => setLimit(Number(event.target.value))}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label>
        </div>
        <p className="cue-filter-note">Each example shows the best rewrite from its attack sequence.</p>
        {rankedExamples.length ? <div className="cue-example-list">{rankedExamples.map(({ sample, delta }, index) => {
          const successful = sample.asr === 1
          return <article className={`cue-example ${sample.modality}`} key={sample.key}>
            <header className="cue-example-header">
              <span className="cue-example-rank">#{index + 1}</span>
              <div className="cue-example-header-content">
                <div className="cue-example-context"><span>{sample.modality === 'human' ? 'Human' : 'Generative language model'}</span><span>{transitionLabel(sample.veracity)}</span></div>
                <div className="cue-example-feature-delta"><strong>{activeFeature.label}</strong><span>Δ {delta > 0 ? '+' : ''}{delta.toFixed(2)}</span></div>
              </div>
              <span className={`cue-success-badge ${successful ? 'successful' : 'unsuccessful'}`}>{successful ? 'Success' : 'No success'}</span>
            </header>
            <div className="cue-text-grid">
              <section><h3>Original</h3><p className="cue-text">{sample.originalText}</p></section>
              <section><h3>Rewrite</h3><p className="cue-text">{sample.rewriteText}</p></section>
              <div className="cue-feature-change original"><span>{activeFeature.label} · original</span><strong>{formatFeatureValue(sample.originalValues[activeFeature.id])}</strong></div>
              <span className="cue-feature-arrow" aria-label="changes to">→</span>
              <div className="cue-feature-change rewrite"><span>{activeFeature.label} · rewrite</span><strong>{formatFeatureValue(sample.rewriteValues[activeFeature.id])}</strong></div>
            </div>
            <ConfidenceShift sample={sample} />
            <footer className="cue-example-metrics"><span>Statement ID <strong>{sample.statementId}</strong></span><span>Attack ID <strong>{sample.rewriteId}</strong></span><span>Attempt <strong>{sample.attempt ?? 'n/a'}</strong></span></footer>
          </article>
        })}</div> : <p className="chart-note">No rewrites match the selected filters.</p>}
      </section>
    </section>
  )
}