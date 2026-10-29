import { describe, expect, it } from 'vitest';
import { buildBoundaries } from '../../geo/boundaries';
import { PLATE_RASTER } from '../../geo/raster';
import {
  MISSIONS,
  completedCount,
  difficultyLabel,
  missionById,
  missionConceptLabel,
  resolveMissionBoundary,
  scoreForAttempts,
  validateMissions
} from '../../features/missions/missions';

const clusters = buildBoundaries(PLATE_RASTER);

describe('mission content', () => {
  it('ships valid missions with unique ids', () => {
    expect(MISSIONS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(MISSIONS.map((mission) => mission.id)).size).toBe(MISSIONS.length);
    expect(validateMissions()).toEqual([]);
  });

  it('resolves the intended boundary for each mission', () => {
    const expected = new Map<string, { type: string; subtype?: string }>([
      ['boundary-id', { type: 'convergent', subtype: 'oceanic-continental' }],
      ['continental-collision', { type: 'convergent', subtype: 'continental-continental' }],
      ['ocean-continent', { type: 'convergent', subtype: 'oceanic-continental' }],
      ['transform', { type: 'transform' }],
      ['rift', { type: 'divergent', subtype: 'rift' }],
      ['ring-of-fire', { type: 'convergent' }]
    ]);
    for (const mission of MISSIONS) {
      if (mission.id === 'misconception-earthquakes-make-mountains' || mission.id === 'misconception-all-volcanoes-boundary') {
        continue;
      }
      const boundary = resolveMissionBoundary(mission, clusters);
      expect(boundary, mission.id).not.toBeNull();
      const target = expected.get(mission.id);
      expect(boundary?.type).toBe(target?.type);
      if (target?.subtype) expect(boundary?.subtype).toBe(target.subtype);
      if (mission.id === 'ring-of-fire') {
        expect([boundary?.plateA, boundary?.plateB]).toContain('pacific');
      }
    }
  });

  it('keeps answers inside the option lists', () => {
    for (const mission of MISSIONS) {
      expect(mission.options).toContain(mission.answer);
      expect(mission.explanationOptions).toContain(mission.explanationAnswer);
      expect(mission.takeawayKo.length).toBeGreaterThan(10);
      expect(mission.explanationKo.length).toBeGreaterThan(20);
    }
  });

  it('scores wrong attempts without punishing correct first answers', () => {
    expect(scoreForAttempts(0)).toBe(100);
    expect(scoreForAttempts(1)).toBe(80);
    expect(scoreForAttempts(2)).toBe(60);
    expect(scoreForAttempts(4)).toBe(20);
    expect(scoreForAttempts(10)).toBe(20);
  });

  it('exposes labels and lookup helpers', () => {
    expect(missionById('rift')?.titleKo).toContain('열곡');
    expect(missionConceptLabel('ring-of-fire')).toBe('불의 고리');
    expect(difficultyLabel(1)).toBe('기초');
    expect(completedCount(['rift', 'transform'])).toBe(2);
  });
});
