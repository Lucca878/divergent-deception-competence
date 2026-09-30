import { type DashboardData, type Section } from '../dashboard'
import { CueExplorerPage } from './CueExplorerPage'
import { ComparingAttacksPage } from './ComparingAttacksPage'
import { AttackEffectivenessPage } from './AttackEffectivenessPage'
import { TrajectoriesPage } from './TrajectoriesPage'

export function DashboardContent({ data, section }: { data: DashboardData; section: Section }) {
  if (section === 'comparingAttacks') return <ComparingAttacksPage data={data} />
  if (section === 'cueExplorer') return <CueExplorerPage data={data} />
  if (section === 'attackTrajectories') return <TrajectoriesPage data={data} />
  return <AttackEffectivenessPage data={data} />
}