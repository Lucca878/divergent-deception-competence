import { useMemo, useState } from 'react'
import { bestAttemptField, parseNumber, parseText, type CsvRow, type DashboardData } from '../dashboard'

interface RewritePair {
  statementId: string
  original: string
  summary: string
  human: CsvRow
  llm: CsvRow
}

interface DisplayAttempt {
  number: number
  text: string
  label: number | null
  confidence: number | null
  confidenceChange: number | null
  successful: boolean
}

function attackLabel(row: CsvRow): string {
  const original = parseText(row.original_veracity)
  const target = parseText(row.target_veracity)
  const score = parseNumber(row.max_conf_change)
  const outcome = parseNumber(row.asr) === 1 ? 'successful' : 'no success'
  const bestAttempt = parseNumber(row.max_conf_change_attempt)
  const scoreText = score === null ? '' : ` · confidence change ${score > 0 ? '+' : ''}${score.toFixed(1)}`
  const attemptText = bestAttempt === null ? '' : `Attempt ${bestAttempt} · `
  return `${attemptText}${original || 'Unknown'} → ${target || 'Unknown'} · ${outcome}${scoreText}`
}

function predictionLabel(label: number | null): string {
  return label === null ? 'n/a' : label === 1 ? 'Truthful' : 'Deceptive'
}

export function ComparingAttacksPage({ data }: { data: DashboardData }) {
  const [activePair, setActivePair] = useState(0)
  const [showAllAttempts, setShowAllAttempts] = useState(false)

  const sequencesByRewrite = useMemo(() => {
    const sequences = new Map<string, CsvRow>()
    data.combined.forEach((row) => {
      const rewriteId = parseText(row.rewrite_id)
      if (rewriteId) sequences.set(rewriteId, row)
    })
    return sequences
  }, [data.combined])

  const pairs = useMemo(() => {
    const byStatement = new Map<string, { human: CsvRow[]; llm: CsvRow[] }>()
    data.combined.forEach((row) => {
      const statementId = parseText(row.statement_id)
      const modality = parseText(row.attack_modality).toLowerCase()
      if (!statementId || (modality !== 'human' && modality !== 'llm')) return
      const group = byStatement.get(statementId) ?? { human: [], llm: [] }
      group[modality].push(row)
      byStatement.set(statementId, group)
    })

    const sharedPairs: RewritePair[] = []
    byStatement.forEach((group, statementId) => {
      if (!group.human.length || !group.llm.length) return
      const original = parseText(group.human[0].original_text) || parseText(group.llm[0].original_text)
      if (!original) return
      const summary = parseText(group.human[0].summary) || parseText(group.llm[0].summary)
      group.human.forEach((human) => group.llm.forEach((llm) => {
        sharedPairs.push({ statementId, original, summary, human, llm })
      }))
    })

    return sharedPairs.sort((left, right) => {
      const statementOrder = left.statementId.localeCompare(right.statementId, undefined, { numeric: true })
      if (statementOrder !== 0) return statementOrder
      const humanOrder = parseText(left.human.rewrite_id).localeCompare(parseText(right.human.rewrite_id), undefined, { numeric: true })
      return humanOrder || parseText(left.llm.rewrite_id).localeCompare(parseText(right.llm.rewrite_id), undefined, { numeric: true })
    })
  }, [data])

  if (!pairs.length) {
    return <section className="chart-grid"><article className="card chart-card full-width"><h2>Comparing Attacks</h2><p className="chart-note">No originals with both human and LLM rewrites were found in the loaded dataset.</p></article></section>
  }

  const current = pairs[activePair % pairs.length]
  const allAttempts = (row: CsvRow): DisplayAttempt[] => {
    const sequence = sequencesByRewrite.get(parseText(row.rewrite_id))
    if (!sequence) return []
    const successfulAttempt = parseNumber(row.flip_attempt) ?? parseNumber(sequence.flip_attempt)
    const originalLabel = parseNumber(row.original_label) ?? parseNumber(sequence.original_label)
    const attackSucceeded = parseNumber(row.asr) === 1 || parseNumber(sequence.asr) === 1
    return Array.from({ length: 10 }, (_, index) => {
      const number = index + 1
      const text = parseText(sequence[`rewrite${number}_text`])
      const label = parseNumber(sequence[`rewrite${number}_label`])
      return text ? {
        number,
        text,
        label,
        confidence: parseNumber(sequence[`rewrite${number}_confidence`]),
        confidenceChange: parseNumber(sequence[`rewrite${number}_conf_change`]),
        successful: successfulAttempt !== null
          ? successfulAttempt === number
          : attackSucceeded && label !== null && originalLabel !== null && label !== originalLabel,
      } : null
    }).filter((attempt): attempt is DisplayAttempt => attempt !== null)
  }
  const humanAttempts = showAllAttempts ? allAttempts(current.human) : []
  const llmAttempts = showAllAttempts ? allAttempts(current.llm) : []

  return (
    <section className="paired-page">
      <header className="paired-heading">
        <div>
          <p className="eyebrow">Same original statement, different rewrites</p>
          <h2>Comparing Attacks</h2>
          <p>Investigate paraphrasing attacks by humans and language model on the same original statement and compare them.</p>
        </div>
        <div className="paired-navigation">
          <span>{activePair % pairs.length + 1} / {pairs.length} matched attacks</span>
          <button type="button" className="shuffle-btn" onClick={() => setActivePair((index) => (index + 1) % pairs.length)}>
            Next pair <span aria-hidden="true">→</span>
          </button>
        </div>
      </header>

      <label className="paired-attempt-toggle">
        <input checked={showAllAttempts} onChange={(event) => setShowAllAttempts(event.target.checked)} type="checkbox" />
        Show all attempts in each attack sequence
      </label>

      <article className="paired-original card">
        <div className="paired-original-meta">
          <span>Original statement</span>
          <strong>Statement ID {current.statementId}</strong>
        </div>
        <p>{current.original}</p>
        <footer className="trajectory-text-meta paired-original-prediction">
          Predicted label: {predictionLabel(parseNumber(current.human.original_label))} · Confidence: {parseNumber(current.human.original_confidence)?.toFixed(1) ?? 'n/a'}
        </footer>
        {current.summary && <details><summary>Statement summary from Hippocorpus</summary><p>{current.summary}</p></details>}
      </article>

      <div className="paired-outcomes">
        <article className="paired-outcome human">
          <header><span className="outcome-kicker">Human</span><span className="outcome-meta">attack ID {parseText(current.human.rewrite_id)}</span></header>
          {!showAllAttempts && <p className="outcome-status">{attackLabel(current.human)}</p>}
          {showAllAttempts && humanAttempts.length ? <div className="paired-attempt-list">{humanAttempts.map((attempt) => <section key={attempt.number}><h3>Attempt {attempt.number}{attempt.successful && <span className="attempt-success">Success</span>}</h3><p className="attempt-metrics"><strong>Confidence change: {attempt.confidenceChange === null ? 'n/a' : `${attempt.confidenceChange >= 0 ? '+' : ''}${attempt.confidenceChange.toFixed(2)}`}</strong><span>Predicted label: {predictionLabel(attempt.label)} · Confidence: {attempt.confidence?.toFixed(1) ?? 'n/a'}</span></p><p className="outcome-text">{attempt.text}</p></section>)}</div> : <p className="outcome-text">{parseText(bestAttemptField(current.human, 'text')) || 'No rewrite text in this row.'}</p>}
        </article>
        <article className="paired-outcome llm">
          <header><span className="outcome-kicker">Generative language model</span><span className="outcome-meta">attack ID {parseText(current.llm.rewrite_id)}</span></header>
          {!showAllAttempts && <p className="outcome-status">{attackLabel(current.llm)}</p>}
          {showAllAttempts && llmAttempts.length ? <div className="paired-attempt-list">{llmAttempts.map((attempt) => <section key={attempt.number}><h3>Attempt {attempt.number}{attempt.successful && <span className="attempt-success">Success</span>}</h3><p className="attempt-metrics"><strong>Confidence change: {attempt.confidenceChange === null ? 'n/a' : `${attempt.confidenceChange >= 0 ? '+' : ''}${attempt.confidenceChange.toFixed(2)}`}</strong><span>Predicted label: {predictionLabel(attempt.label)} · Confidence: {attempt.confidence?.toFixed(1) ?? 'n/a'}</span></p><p className="outcome-text">{attempt.text}</p></section>)}</div> : <p className="outcome-text">{parseText(bestAttemptField(current.llm, 'text')) || 'No rewrite text in this row.'}</p>}
        </article>
      </div>
      {!showAllAttempts && <p className="paired-footnote"><strong>Note.</strong> Rewrites display the best attempts of the attack sequence. If you want to see all attempts of the sequence, check the option above.</p>}
    </section>
  )
}