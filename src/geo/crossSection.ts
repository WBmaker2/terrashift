import type { BoundaryCluster } from './boundaries';
import { boundarySubtypeLabelKo, boundaryTypeLabelKo, orderedPlates } from './boundaries';
import type { Plate } from './plates';
import { clamp } from './sphere';
import { formatTimeShort } from './time';

export type CrossSectionKind =
  | 'ridge'
  | 'rift'
  | 'oceanic-continental'
  | 'oceanic-oceanic'
  | 'continental-continental'
  | 'transform'
  | 'inactive';

export interface CrossSectionFeatures {
  slabDepthKm: number;
  slabAngleDeg: number;
  trenchDepthKm: number;
  mountainHeightKm: number;
  arcHeightKm: number;
  arcOffsetKm: number;
  riftWidthKm: number;
  riftDepthKm: number;
  offsetKm: number;
  crustThicknessKm: number;
  upwelling: boolean;
}

export interface CrossSectionModel {
  kind: CrossSectionKind;
  titleKo: string;
  subtitleKo: string;
  captionKo: string;
  timeLabelKo: string;
  notesKo: string[];
  hasVolcano: boolean;
  oceanSide: 'left' | 'right' | 'both' | 'none';
  leftPlateKo: string;
  rightPlateKo: string;
  leftTypeKo: string;
  rightTypeKo: string;
  features: CrossSectionFeatures;
  accentColor: string;
}

function kindFor(cluster: BoundaryCluster): CrossSectionKind {
  if (cluster.type === 'transform') return 'transform';
  if (cluster.type === 'inactive') return 'inactive';
  if (cluster.subtype === 'ridge') return 'ridge';
  if (cluster.subtype === 'rift') return 'rift';
  if (cluster.subtype === 'oceanic-continental') return 'oceanic-continental';
  if (cluster.subtype === 'oceanic-oceanic') return 'oceanic-oceanic';
  return 'continental-continental';
}

function oceanSideFor(
  left: Plate | undefined,
  right: Plate | undefined
): 'left' | 'right' | 'both' | 'none' {
  if (!left || !right) return 'none';
  if (left.type === 'oceanic' && right.type === 'oceanic') return 'both';
  if (left.type === 'continental' && right.type === 'continental') return 'none';
  return left.type === 'oceanic' ? 'left' : 'right';
}

function baseFeatures(): CrossSectionFeatures {
  return {
    slabDepthKm: 0,
    slabAngleDeg: 0,
    trenchDepthKm: 0,
    mountainHeightKm: 0,
    arcHeightKm: 0,
    arcOffsetKm: 0,
    riftWidthKm: 0,
    riftDepthKm: 0,
    offsetKm: 0,
    crustThicknessKm: 32,
    upwelling: false
  };
}

export function describeCrossSection(
  cluster: BoundaryCluster | null,
  myr: number
): CrossSectionModel {
  const time = clamp(myr, 0, 200);
  const progress = time / 200;
  const kind = cluster ? kindFor(cluster) : 'inactive';
  const features = baseFeatures();
  const ordered = cluster ? orderedPlates(cluster) : null;
  const leftPlate = ordered?.[0];
  const rightPlate = ordered?.[1];
  const leftPlateKo = leftPlate?.nameKo ?? '판 A';
  const rightPlateKo = rightPlate?.nameKo ?? '판 B';
  const leftTypeKo = leftPlate?.type === 'oceanic' ? '해양판' : leftPlate ? '대륙판' : '';
  const rightTypeKo = rightPlate?.type === 'oceanic' ? '해양판' : rightPlate ? '대륙판' : '';
  const notesKo: string[] = [];
  let hasVolcano = false;
  let subtitleKo = '';
  const titleKo = cluster ? boundarySubtypeLabelKo(cluster.subtype) : '경계를 선택하세요';
  let accentColor = '#f1a43c';

  switch (kind) {
    case 'ridge':
      features.slabDepthKm = 35;
      features.riftWidthKm = 40 + 180 * progress;
      features.riftDepthKm = 1.5;
      features.upwelling = true;
      features.crustThicknessKm = 7;
      hasVolcano = true;
      accentColor = '#f1a43c';
      subtitleKo = '맨틀이 올라와 새 해양 지각을 만드는 발산 경계';
      notesKo.push('맨틀이 올라와 새 해양 지각을 만듭니다.');
      notesKo.push('해령 축은 갈라지고, 지각은 양쪽으로 이동합니다.');
      notesKo.push('해령에서 멀어질수록 해양 지각의 나이가 많아집니다.');
      break;
    case 'rift':
      features.riftWidthKm = 40 + 260 * progress;
      features.riftDepthKm = 0.5 + 2.8 * progress;
      features.upwelling = true;
      features.crustThicknessKm = 32 - 10 * progress;
      hasVolcano = true;
      accentColor = '#f1a43c';
      subtitleKo = '대륙 지각이 갈라지는 발산 경계';
      notesKo.push('대륙 지각이 갈라지고 얇아집니다.');
      notesKo.push('열곡이 넓어지고 가라앉으면 바닷물이 들어올 수 있습니다.');
      notesKo.push('지진과 일부 화산 활동이 함께 나타납니다.');
      break;
    case 'oceanic-continental':
      features.slabDepthKm = 100 + 560 * progress;
      features.slabAngleDeg = 28 + 18 * progress;
      features.trenchDepthKm = 4 + 4 * progress;
      features.mountainHeightKm = 2.2 + 3.6 * progress;
      features.arcHeightKm = 1.2 + 2.4 * progress;
      features.arcOffsetKm = 95 + 85 * progress;
      features.crustThicknessKm = 32 + 18 * progress;
      hasVolcano = true;
      accentColor = '#e7644b';
      subtitleKo = '해양판이 대륙 아래로 섭입하는 수렴 경계';
      notesKo.push('해양판이 대륙 아래로 섭입합니다.');
      notesKo.push('해구는 섭입이 시작되는 곳, 화산호는 대륙 안쪽에 생깁니다.');
      notesKo.push('지진은 섭입하는 판을 따라 깊어집니다.');
      break;
    case 'oceanic-oceanic':
      features.slabDepthKm = 90 + 500 * progress;
      features.slabAngleDeg = 32 + 20 * progress;
      features.trenchDepthKm = 4 + 4 * progress;
      features.arcHeightKm = 1.8 + 2.6 * progress;
      features.arcOffsetKm = 70 + 60 * progress;
      features.crustThicknessKm = 8 + 6 * progress;
      hasVolcano = true;
      accentColor = '#e7644b';
      subtitleKo = '한 해양판이 다른 해양판 아래로 섭입하는 경계';
      notesKo.push('오래된 해양판이 다른 해양판 아래로 들어갑니다.');
      notesKo.push('해구와 섬호가 나란히 나타납니다.');
      notesKo.push('섬호는 화산 활동으로 만들어질 수 있습니다.');
      break;
    case 'continental-continental':
      features.mountainHeightKm = 3.5 + 4.5 * progress;
      features.crustThicknessKm = 40 + 32 * progress;
      hasVolcano = false;
      accentColor = '#e7644b';
      subtitleKo = '두 대륙판이 충돌하는 수렴 경계';
      notesKo.push('두 대륙 지각이 부딪혀 접히고 두꺼워집니다.');
      notesKo.push('해구 대신 높은 산맥과 넓은 고원이 만들어집니다.');
      notesKo.push('지각이 두꺼워져 화산은 거의 나타나지 않습니다.');
      break;
    case 'transform':
      features.offsetKm = 12 + 180 * progress;
      features.crustThicknessKm = 30;
      features.slabDepthKm = 15;
      hasVolcano = false;
      accentColor = '#b08be8';
      subtitleKo = '두 판이 옆으로 미끄러지는 변환 경계';
      notesKo.push('두 판이 서로 옆으로 미끄러집니다.');
      notesKo.push('마그마가 올라올 틈이 거의 생기지 않아 화산이 드뭅니다.');
      notesKo.push('지각이 얕게 부러져 얕은 지진이 자주 발생합니다.');
      break;
    default:
      hasVolcano = false;
      subtitleKo = '뚜렷한 지형 변화가 적은 경계';
      notesKo.push('상대 운동이 느려 지형 변화가 작습니다.');
      notesKo.push('이 모델에서는 여섯 미션에 사용하지 않습니다.');
      break;
  }

  const dynamicNote =
    kind === 'rift'
      ? `현재 열곡 폭은 약 ${Math.round(features.riftWidthKm)} km입니다.`
      : kind === 'transform'
        ? `현재 누적 어긋남은 약 ${Math.round(features.offsetKm)} km입니다.`
        : kind === 'oceanic-continental' || kind === 'oceanic-oceanic'
          ? `섭입판은 약 ${Math.round(features.slabDepthKm)} km 깊이까지 내려갑니다.`
          : kind === 'continental-continental'
            ? `지각 두께는 약 ${Math.round(features.crustThicknessKm)} km입니다.`
            : '';
  if (dynamicNote) notesKo.push(dynamicNote);

  return {
    kind,
    titleKo: `${titleKo} · ${cluster ? boundaryTypeLabelKo(cluster.type) : '개념 모델'}`,
    subtitleKo: cluster ? `${leftPlateKo} · ${rightPlateKo} — ${subtitleKo}` : subtitleKo,
    captionKo: '개념 단면도 · 실제 지질 단면이 아닙니다.',
    timeLabelKo: formatTimeShort(time),
    notesKo,
    hasVolcano,
    oceanSide: cluster ? oceanSideFor(leftPlate, rightPlate) : 'none',
    leftPlateKo,
    rightPlateKo,
    leftTypeKo,
    rightTypeKo,
    features,
    accentColor
  };
}
