import Papa from 'papaparse'

export type CsvRow = Record<string, string | number | null | undefined>

export type Section =
  | 'attackEffectiveness'
  | 'attackTrajectories'
  | 'comparingAttacks'
  | 'cueExplorer'

export interface DashboardData {
  combined: CsvRow[]
  lingfeat: CsvRow[]
}

export interface FeatureOption {
  id: string
  label: string
  column: string
}

export const COLORS = { human: '#78a9c7', llm: '#dc9a7a' }

export const FEATURE_OPTIONS: FeatureOption[] = [
  { id: 'num_sentences', label: 'num_sentences', column: 'num_sentences' },
  { id: 'num_words', label: 'num_words', column: 'word_counts' },
  { id: 'num_syllables', label: 'num_syllables', column: 'num_syllables' },
  { id: 'avg_syllabes_per_word', label: 'avg_syllabes_per_word', column: 'avg_syllables_per_word' },
  { id: 'fk_grade', label: 'fk_grade', column: 'fk_grade' },
  { id: 'fk_read', label: 'fk_read', column: 'fk_read' },
  { id: 'Analytic', label: 'Analytic', column: 'Analytic' },
  { id: 'Authentic', label: 'Authentic', column: 'Authentic' },
  { id: 'Tone', label: 'Tone', column: 'Tone' },
  { id: 'tone_pos', label: 'tone_pos', column: 'tone_pos' },
  { id: 'tone_neg', label: 'tone_neg', column: 'tone_neg' },
  { id: 'Cognition', label: 'Cognition', column: 'Cognition' },
  { id: 'memory', label: 'memory', column: 'memory' },
  { id: 'focuspast', label: 'focuspast', column: 'focuspast' },
  { id: 'focuspresent', label: 'focuspresent', column: 'focuspresent' },
  { id: 'focusfuture', label: 'focusfuture', column: 'focusfuture' },
  { id: 'Contextual Embedding', label: 'Contextual Embedding', column: 'Contextual Embedding' },
  { id: 'Reality Monitoring', label: 'Reality Monitoring', column: 'Reality Monitoring' },
  { id: 'Concreteness score', label: 'Concreteness score', column: 'concr_score' },
  { id: 'Perceptual details', label: 'Perceptual details', column: 'Perceptual Details' },
  { id: 'Self-reference', label: 'Self-reference', column: 'Self-reference' },
  { id: 'Other-reference', label: 'Other-reference', column: 'Other-reference' },
  { id: 'People', label: 'People', column: 'People' },
  { id: 'Temporal details', label: 'Temporal details', column: 'Temporal details' },
  { id: 'Spatial details', label: 'Spatial details', column: 'Spatial details' },
  { id: 'Quantity details', label: 'Quantity details', column: 'Quantity details' },
  { id: 'adverb_pct', label: 'adverb_pct', column: 'adverb_pct' },
  { id: 'verb_pct', label: 'verb_pct', column: 'verb_pct' },
  { id: 'noun_pct', label: 'noun_pct', column: 'noun_pct' },
  { id: 'adj_pct', label: 'adj_pct', column: 'adj_pct' },
]

export const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }
  return null
}

export const parseText = (value: unknown): string => value === null || value === undefined ? '' : String(value).trim()
export const bestAttemptField = (row: CsvRow, field: string): unknown => {
  const attempt = parseNumber(row.max_conf_change_attempt)
  return attempt === null ? undefined : row[`rewrite${attempt}_${field}`]
}

export const csvLoader = async (url: string): Promise<CsvRow[]> => new Promise((resolve, reject) => {
  Papa.parse<CsvRow>(url, { download: true, header: true, skipEmptyLines: true, dynamicTyping: true, complete: (results) => resolve(results.data), error: reject })
})