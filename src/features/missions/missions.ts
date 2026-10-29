import rawMissions from '../../data/missions.json';
import type { BoundaryCluster, BoundaryMatch } from '../../geo/boundaries';
import { findBoundaryMatch } from '../../geo/boundaries';
import type { LayerState, ViewMode } from '../../app/state';

export type MissionConcept =
  'boundary' | 'convergence' | 'transform' | 'rift' | 'ring-of-fire' | 'scale';

export interface MissionSetup {
  myr: number;
  match?: BoundaryMatch;
  layers?: Partial<LayerState>;
  camera?: { lat: number; lon: number; distance?: number };
  hideType?: boolean;
  view?: ViewMode;
}

export interface Mission {
  id: string;
  titleKo: string;
  concept: MissionConcept;
  difficulty: 1 | 2 | 3;
  promptKo: string;
  setup: MissionSetup;
  options: string[];
  answer: string;
  predictionHintKo: string;
  explanationPromptKo: string;
  explanationOptions: string[];
  explanationAnswer: string;
  explanationKo: string;
  takeawayKo: string;
}

export const MISSIONS: Mission[] = rawMissions as Mission[];
export const MISSION_BY_ID = new Map(MISSIONS.map((mission) => [mission.id, mission]));

export function missionById(id: string | null): Mission | undefined {
  if (!id) return undefined;
  return MISSION_BY_ID.get(id);
}

export function resolveMissionBoundary(
  mission: Mission,
  boundaries: BoundaryCluster[]
): BoundaryCluster | null {
  if (!mission.setup.match) return null;
  return findBoundaryMatch(boundaries, mission.setup.match);
}

export function scoreForAttempts(wrongAttempts: number): number {
  return Math.max(20, 100 - Math.max(0, wrongAttempts) * 20);
}

export function completedCount(completed: string[]): number {
  return MISSIONS.filter((mission) => completed.includes(mission.id)).length;
}

export function missionConceptLabel(concept: MissionConcept): string {
  switch (concept) {
    case 'boundary':
      return '경계 읽기';
    case 'convergence':
      return '수렴';
    case 'transform':
      return '변환';
    case 'rift':
      return '열곡';
    case 'ring-of-fire':
      return '불의 고리';
    default:
      return '규모';
  }
}

export function difficultyLabel(difficulty: 1 | 2 | 3): string {
  return ['기초', '보통', '도전'][difficulty - 1] ?? '보통';
}

export function validateMissions(missions: Mission[] = MISSIONS): string[] {
  const errors: string[] = [];
  for (const mission of missions) {
    if (!mission.options.includes(mission.answer)) {
      errors.push(`${mission.id}: prediction answer is not in options`);
    }
    if (!mission.explanationOptions.includes(mission.explanationAnswer)) {
      errors.push(`${mission.id}: explanation answer is not in options`);
    }
    if (mission.setup.myr < 0 || mission.setup.myr > 200) {
      errors.push(`${mission.id}: time outside 0..200`);
    }
  }
  return errors;
}
