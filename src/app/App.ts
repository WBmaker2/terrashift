import { MAX_TIME_MYR, PLAYBACK_SPEEDS } from '../geo/constants';
import {
  boundaryLandformLabelKo,
  boundaryPlatesLabelKo,
  boundarySubtypeLabelKo,
  boundaryTypeColor,
  boundaryTypeLabelKo,
  boundaryTypeShortKo,
  boundariesForPlate,
  buildBoundaries,
  findBoundaryMatch,
  findNearestBoundary,
  type BoundaryCluster
} from '../geo/boundaries';
import { describeCrossSection } from '../geo/crossSection';
import {
  buildEventCatalog,
  countEventsInWindow,
  visibleVolcanoes,
  type EventCatalog
} from '../geo/events';
import {
  LAND_REGIONS,
  PLATE_BY_ID,
  PLATES,
  plateLabelPoint,
  plateMotionLabel,
  plateTypeLabel,
  type Plate
} from '../geo/plates';
import { PLATE_RASTER } from '../geo/raster';
import { buildTerrainModel, type TerrainModel } from '../geo/terrain';
import { formatTimeLabel, formatTimeShort } from '../geo/time';
import {
  MISSIONS,
  completedCount,
  difficultyLabel,
  missionById,
  missionConceptLabel,
  resolveMissionBoundary,
  scoreForAttempts,
  type Mission
} from '../features/missions/missions';
import { Globe, type GlobePick } from '../render/Globe';
import { CrossSectionView } from '../render/CrossSectionView';
import { clearProgress, loadProgress, mergeProgress, saveProgress } from '../storage/progress';
import { appTemplate } from '../ui/template';
import { escapeAttr, escapeHtml, qs, qsa, show } from '../ui/dom';
import {
  Store,
  createInitialState,
  type AppState,
  type LayerState,
  type Route,
  type ViewMode
} from './state';
import { navigate, parseRoute } from './routes';

interface Elements {
  exploreLayout: HTMLElement;
  teacherLayout: HTMLElement;
  leftPanel: HTMLElement;
  rightPanel: HTMLElement;
  globeArea: HTMLElement;
  globeContainer: HTMLElement;
  crossSectionFull: HTMLElement;
  crossSectionCanvas: HTMLCanvasElement;
  fullSectionTitle: HTMLElement;
  fullSectionSubtitle: HTMLElement;
  fullSectionNotes: HTMLElement;
  layerList: HTMLElement;
  plateList: HTMLElement;
  boundaryLegend: HTMLElement;
  selectionPanel: HTMLElement;
  missionPanel: HTMLElement;
  stageTitle: HTMLElement;
  stageEyebrow: HTMLElement;
  canvasFallback: HTMLElement;
  readout: HTMLElement;
  mapReadBody: HTMLElement;
  timeLabel: HTMLElement;
  timeNote: HTMLElement;
  timeRange: HTMLInputElement;
  playToggle: HTMLButtonElement;
  speedSelect: HTMLSelectElement;
  progressChip: HTMLElement;
  scaleBadge: HTMLElement;
  stageBadges: HTMLElement;
  toast: HTMLElement;
  srStatus: HTMLElement;
  modalRoot: HTMLElement;
  printWorksheet: HTMLElement;
  mobileSelectionTab: HTMLButtonElement;
  toggleLeftPanel: HTMLButtonElement;
  toggleRightPanel: HTMLButtonElement;
}

const LAYER_DEFINITIONS: Array<{ key: keyof LayerState; label: string; note?: string }> = [
  { key: 'boundaries', label: '경계선', note: '판 경계의 종류와 위치' },
  { key: 'labels', label: '이름표', note: '판과 경계 이름' },
  { key: 'earthquakes', label: '지진', note: '깊이에 따라 색이 달라짐' },
  { key: 'volcanoes', label: '화산', note: '수렴·발산 경계에 나타남' },
  { key: 'crustAge', label: '해양 지각 나이', note: '해령에서 멀수록 오래됨' },
  { key: 'plateColors', label: '판 색', note: '판별 색을 지형에 섞음' }
];

const PRESETS: Array<{
  id: string;
  nameKo: string;
  captionKo: string;
  myr: number;
  match: Parameters<typeof findBoundaryMatch>[1];
  camera?: { lat: number; lon: number; distance?: number };
}> = [
  {
    id: 'himalaya',
    nameKo: '히말라야',
    captionKo: '대륙-대륙 충돌',
    myr: 80,
    match: {
      plates: ['eurasia', 'indo-australia'],
      type: 'convergent',
      subtype: 'continental-continental'
    },
    camera: { lat: 30, lon: 85, distance: 2.75 }
  },
  {
    id: 'andes',
    nameKo: '안데스',
    captionKo: '해양-대륙 수렴',
    myr: 80,
    match: {
      plates: ['nazca', 'south-america'],
      type: 'convergent',
      subtype: 'oceanic-continental'
    },
    camera: { lat: -20, lon: -72, distance: 2.75 }
  },
  {
    id: 'rift',
    nameKo: '동아프리카 열곡',
    captionKo: '대륙 열곡',
    myr: 120,
    match: { plates: ['nubia', 'somalia'], type: 'divergent', subtype: 'rift' },
    camera: { lat: 0, lon: 35, distance: 2.75 }
  },
  {
    id: 'san-andreas',
    nameKo: '샌안드레아스',
    captionKo: '변환 경계',
    myr: 100,
    match: { plates: ['north-america', 'pacific'], type: 'transform' },
    camera: { lat: 32, lon: -118, distance: 2.2 }
  },
  {
    id: 'ring-of-fire',
    nameKo: '불의 고리',
    captionKo: '태평양 주변 수렴 경계',
    myr: 50,
    match: { plates: ['pacific'], type: 'convergent' },
    camera: { lat: 0, lon: -160, distance: 3.5 }
  }
];

export class App {
  private readonly root: HTMLElement;
  private readonly elements: Elements;
  private readonly boundaries: BoundaryCluster[];
  private readonly terrainModel: TerrainModel;
  private readonly catalog: EventCatalog;
  private readonly store: Store;
  private globe: Globe | null = null;
  private previewView: CrossSectionView | null = null;
  private readonly fullView: CrossSectionView;
  private previousState: AppState | null = null;
  private playbackFrame: number | null = null;
  private lastTick = 0;
  private saveTimer: number | null = null;
  private toastTimer: number | null = null;
  private lastReadoutTime = -Infinity;
  private lastPreviewTime = -Infinity;
  private draftPrediction: Record<string, string> = {};
  private draftExplanation: Record<string, string> = {};
  private focusExplanationOnRender = false;
  private focusCompletionOnRender = false;
  private userSetReducedMotion = false;
  private readonly mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly onMediaChange = (event: MediaQueryListEvent): void => {
    if (this.userSetReducedMotion) return;
    this.store.update((state) => ({
      ...state,
      preferences: { ...state.preferences, reducedMotion: event.matches }
    }));
  };

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = appTemplate();
    this.elements = this.cacheElements();
    this.boundaries = buildBoundaries(PLATE_RASTER);
    this.terrainModel = buildTerrainModel(PLATE_RASTER, this.boundaries);
    this.catalog = buildEventCatalog(this.boundaries);

    const persisted = loadProgress();
    let state = createInitialState(this.mediaQuery.matches);
    state = mergeProgress(state, persisted);
    state.route = parseRoute(window.location.hash);
    if (window.innerWidth < 768) {
      state.layers = { ...state.layers, labels: false };
    }
    if (
      state.selection.boundaryId &&
      !this.boundaries.some((cluster) => cluster.id === state.selection.boundaryId)
    ) {
      state.selection = { boundaryId: null, plateId: null };
    }
    if (state.selection.plateId && !PLATE_BY_ID.has(state.selection.plateId)) {
      state.selection = { boundaryId: null, plateId: null };
    }
    if (state.mission.currentId) {
      const mission = missionById(state.mission.currentId);
      if (mission) {
        const boundary = resolveMissionBoundary(mission, this.boundaries);
        if (boundary) state.selection = { boundaryId: boundary.id, plateId: null };
      }
    } else if (
      !state.selection.boundaryId &&
      !state.selection.plateId &&
      state.route !== 'teacher'
    ) {
      const andes = findBoundaryMatch(this.boundaries, {
        plates: ['nazca', 'south-america'],
        type: 'convergent',
        subtype: 'oceanic-continental'
      });
      if (andes) state.selection = { boundaryId: andes.id, plateId: null };
    }

    this.store = new Store(state);
    this.buildStaticUI();
    this.fullView = new CrossSectionView(this.elements.crossSectionCanvas);
    this.initGlobe();
    this.attachHandlers();
    this.store.subscribe((next) => this.onStateChange(next));
    this.mediaQuery.addEventListener('change', this.onMediaChange);
    this.buildWorksheet();
    this.exposeDebug();
    this.scheduleSave();
  }

  private cacheElements(): Elements {
    return {
      exploreLayout: qs('#explore-layout'),
      teacherLayout: qs('#teacher-layout'),
      leftPanel: qs('#left-panel'),
      rightPanel: qs('#right-panel'),
      globeArea: qs('#globe-area'),
      globeContainer: qs('#globe-container'),
      crossSectionFull: qs('#cross-section-full'),
      crossSectionCanvas: qs('#full-section-canvas'),
      fullSectionTitle: qs('#full-section-title'),
      fullSectionSubtitle: qs('#full-section-subtitle'),
      fullSectionNotes: qs('#full-section-notes-list'),
      layerList: qs('#layer-list'),
      plateList: qs('#plate-list'),
      boundaryLegend: qs('#boundary-legend'),
      selectionPanel: qs('#selection-panel'),
      missionPanel: qs('#mission-panel'),
      stageTitle: qs('#stage-title'),
      stageEyebrow: qs('#stage-eyebrow'),
      canvasFallback: qs('#canvas-fallback'),
      readout: qs('#readout'),
      mapReadBody: qs('#map-read-body'),
      timeLabel: qs('#time-label'),
      timeNote: qs('#time-note'),
      timeRange: qs('#time-range'),
      playToggle: qs('#play-toggle'),
      speedSelect: qs('#speed-select'),
      progressChip: qs('#progress-chip'),
      scaleBadge: qs('#scale-badge'),
      stageBadges: qs('#stage-badges'),
      toast: qs('#toast'),
      srStatus: qs('#sr-status'),
      modalRoot: qs('#modal-root'),
      printWorksheet: qs('#print-worksheet'),
      mobileSelectionTab: qs('#mobile-selection-tab'),
      toggleLeftPanel: qs('#toggle-left-panel'),
      toggleRightPanel: qs('#toggle-right-panel')
    };
  }

  private initGlobe(): void {
    try {
      this.globe = new Globe(
        this.elements.globeContainer,
        this.terrainModel,
        this.boundaries,
        this.catalog,
        {
          onPick: (pick) => this.handleGlobePick(pick),
          onDoubleClick: (pick) => this.handleGlobeDoubleClick(pick)
        }
      );
    } catch (error) {
      console.warn('3D globe could not be created', error);
      this.globe = null;
      show(this.elements.canvasFallback, true);
      this.elements.globeContainer.classList.add('hidden');
      this.announce('3D 지구본을 표시할 수 없어 단면도와 지도 읽기 패널을 사용합니다.');
    }
  }

  private buildStaticUI(): void {
    this.elements.speedSelect.innerHTML = PLAYBACK_SPEEDS.map(
      (speed) => `<option value="${speed}">${speed} Myr/s</option>`
    ).join('');
    this.elements.layerList.innerHTML = `
      ${LAYER_DEFINITIONS.map(
        (layer) => `
        <label class="toggle" data-layer-row="${layer.key}">
          <input type="checkbox" data-layer="${layer.key}" />
          <span class="switch" aria-hidden="true"></span>
          <span>
            ${escapeHtml(layer.label)}
            ${layer.note ? `<span class="toggle-note">${escapeHtml(layer.note)}</span>` : ''}
          </span>
        </label>`
      ).join('')}
      <p class="toggle-note hidden" id="layer-mission-note">미션 예측 전에는 경계선과 이름표가 숨겨집니다.</p>
    `;
    this.elements.plateList.innerHTML = PLATES.map(
      (plate) => `
      <button type="button" class="plate-btn" data-plate-id="${escapeAttr(plate.id)}" aria-pressed="false">
        <span class="plate-dot" style="background:${escapeAttr(plate.color)};color:${escapeAttr(plate.color)}"></span>
        <span>
          <span class="plate-name">${escapeHtml(plate.nameKo)}</span>
          <span class="plate-meta">${escapeHtml(plateTypeLabel(plate.type))}</span>
        </span>
        <span class="plate-speed">${Math.hypot(plate.motion.eastCmYr, plate.motion.northCmYr).toFixed(1)} cm/yr</span>
      </button>`
    ).join('');
    this.elements.boundaryLegend.innerHTML = `
      <span><i class="legend-line divergent"></i>발산 경계 · 열곡/해령</span>
      <span><i class="legend-line convergent"></i>수렴 경계 · 해구/산맥/화산호</span>
      <span><i class="legend-line transform"></i>변환 경계 · 단층/얕은 지진</span>
      <span><i class="legend-line inactive"></i>활동이 약한 경계</span>
    `;
  }

  private attachHandlers(): void {
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('change', this.handleChange);
    this.root.addEventListener('input', this.handleInput);
    window.addEventListener('hashchange', this.handleHashChange);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('click', this.handleDocumentClick);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (!target) return;
    const routeButton = target.closest<HTMLElement>('[data-route]');
    if (routeButton) {
      event.preventDefault();
      this.goRoute(routeButton.dataset.route as Route);
      return;
    }
    const mobileTab = target.closest<HTMLElement>('[data-mobile-tab]');
    if (mobileTab) {
      this.setMobileTab(mobileTab.dataset.mobileTab ?? 'time');
      return;
    }
    const closePanel = target.closest<HTMLElement>('[data-close-panel]');
    if (closePanel) {
      this.closePanels();
      return;
    }
    const plateButton = target.closest<HTMLElement>('[data-plate-id]');
    if (plateButton) {
      this.selectPlate(plateButton.dataset.plateId ?? null);
      return;
    }
    const boundaryButton = target.closest<HTMLElement>('[data-boundary-id]');
    if (boundaryButton) {
      this.selectBoundary(boundaryButton.dataset.boundaryId ?? null, true);
      return;
    }
    const missionButton = target.closest<HTMLElement>('[data-mission-id]');
    if (missionButton) {
      const mission = missionById(missionButton.dataset.missionId ?? null);
      if (mission) this.startMission(mission);
      return;
    }
    const presetButton = target.closest<HTMLElement>('[data-preset]');
    if (presetButton) {
      this.applyPreset(presetButton.dataset.preset ?? '');
      return;
    }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    switch (action) {
      case 'select-andes':
        this.selectAndes();
        return;
      case 'focus-boundary':
        this.focusSelectedBoundary();
        return;
      case 'open-cross-section':
        this.openCrossSection();
        return;
      case 'back-to-globe':
        this.setView('globe');
        return;
      case 'clear-selection':
        this.store.patch({ selection: { boundaryId: null, plateId: null } });
        this.globe?.setPlateMarker(null, null);
        return;
      case 'reapply-mission':
        if (this.currentMission) this.startMission(this.currentMission);
        return;
      case 'submit-prediction':
        this.submitPrediction();
        return;
      case 'submit-explanation':
        this.submitExplanation();
        return;
      case 'next-mission':
        this.nextMission();
        return;
      case 'reset-progress':
        this.confirmReset();
        return;
      case 'print-worksheet':
        this.printWorksheet();
        return;
      case 'close-panels':
        this.closePanels();
        return;
      default:
        break;
    }
    if (target.closest('#play-toggle')) {
      this.togglePlayback();
      return;
    }
    if (target.closest('#reset-time')) {
      this.seek(0);
      return;
    }
    if (target.closest('#reset-camera')) {
      this.globe?.resetView();
      return;
    }
    if (target.closest('#toggle-left-panel')) {
      this.togglePanel('left');
      return;
    }
    if (target.closest('#toggle-right-panel')) {
      this.togglePanel('right');
      return;
    }
    if (target.closest('#back-to-globe')) {
      this.setView('globe');
      return;
    }
    if (target.closest('#teacher-reset')) {
      this.confirmReset();
      return;
    }
    if (target.closest('#teacher-print')) {
      this.printWorksheet();
    }
  };

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    if (window.innerWidth >= 1200) return;
    const target = event.target as Element | null;
    if (!target) return;
    if (
      this.elements.leftPanel.classList.contains('open') ||
      this.elements.rightPanel.classList.contains('open')
    ) {
      if (
        !this.elements.leftPanel.contains(target) &&
        !this.elements.rightPanel.contains(target) &&
        !target.closest('[data-mobile-tab]') &&
        !target.closest('#toggle-left-panel') &&
        !target.closest('#toggle-right-panel') &&
        !target.closest('[data-close-panel]')
      ) {
        this.closePanels();
      }
    }
  };

  private readonly handleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!target) return;
    if (target instanceof HTMLInputElement && target.matches('input[data-layer]')) {
      const key = target.dataset.layer as keyof LayerState;
      this.store.update((state) => ({
        ...state,
        layers: { ...state.layers, [key]: target.checked }
      }));
      return;
    }
    if (target.id === 'speed-select') {
      this.store.update((state) => ({
        ...state,
        time: { ...state.time, speed: Number(target.value) }
      }));
      return;
    }
    if (target.id === 'mission-select') {
      const mission = missionById(target.value);
      if (mission) this.startMission(mission);
      return;
    }
    if (target instanceof HTMLInputElement && target.matches('input[data-pref]')) {
      const key = target.dataset.pref as 'reducedMotion' | 'showScaleWarning';
      if (key === 'reducedMotion') this.userSetReducedMotion = true;
      this.store.update((state) => ({
        ...state,
        preferences: { ...state.preferences, [key]: target.checked }
      }));
      return;
    }
    if (target.name === 'prediction' || target.name === 'explanation') {
      const mission = this.currentMission;
      if (!mission) return;
      if (target.name === 'prediction') this.draftPrediction[mission.id] = target.value;
      else this.draftExplanation[mission.id] = target.value;
    }
  };

  private readonly handleInput = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    if (target.id === 'time-range') {
      this.pausePlayback();
      this.store.update((state) => ({
        ...state,
        time: { ...state.time, myr: Number(target.value), playing: false }
      }));
    }
  };

  private readonly handleHashChange = (): void => {
    const route = parseRoute(window.location.hash);
    if (route !== this.store.state.route) this.store.patch({ route });
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as Element | null;
    const tagName = target?.tagName.toLowerCase() ?? '';
    const isFormField =
      tagName === 'input' ||
      tagName === 'select' ||
      tagName === 'textarea' ||
      Boolean(target?.closest('[contenteditable="true"]'));
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.elements.modalRoot.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      if (this.store.state.view === 'cross-section') {
        this.setView('globe');
        return;
      }
      this.closePanels();
      return;
    }
    if (isFormField) return;
    if (event.code === 'Space') {
      if (target?.closest('button, a, summary')) return;
      event.preventDefault();
      this.togglePlayback();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      this.seek(this.store.state.time.myr + (event.key === 'ArrowRight' ? step : -step));
      return;
    }
    if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      this.cycleBoundary(event.key === ']' ? 1 : -1);
      return;
    }
    if (event.key === 'l' || event.key === 'L') {
      event.preventDefault();
      this.store.update((state) => ({
        ...state,
        layers: { ...state.layers, labels: !state.layers.labels }
      }));
      return;
    }
    if (event.key === '1') {
      event.preventDefault();
      this.setView('globe');
      return;
    }
    if (event.key === '2') {
      event.preventDefault();
      this.openCrossSection();
    }
  };

  private readonly handleBeforeUnload = (): void => {
    saveProgress(this.store.state);
  };

  private get currentMission(): Mission | undefined {
    return missionById(this.store.state.mission.currentId);
  }

  private get selectedBoundary(): BoundaryCluster | null {
    const id = this.store.state.selection.boundaryId;
    if (!id) return null;
    return this.boundaries.find((cluster) => cluster.id === id) ?? null;
  }

  private get selectedPlate(): Plate | null {
    const id = this.store.state.selection.plateId;
    return id ? (PLATE_BY_ID.get(id) ?? null) : null;
  }

  private predictionPassed(mission: Mission): boolean {
    return this.store.state.mission.answers[`${mission.id}:prediction`] === mission.answer;
  }

  private hideBoundaryType(): boolean {
    const mission = this.currentMission;
    return (
      this.store.state.route === 'missions' &&
      Boolean(mission?.setup.hideType) &&
      Boolean(mission && !this.predictionPassed(mission))
    );
  }

  private effectiveLayers(state = this.store.state): LayerState {
    if (this.hideBoundaryType()) {
      return { ...state.layers, boundaries: false, labels: false };
    }
    return state.layers;
  }

  private onStateChange(next: AppState): void {
    const prev = this.previousState;
    if (!prev) {
      this.previousState = next;
      this.fullRender(next);
      return;
    }
    const routeChanged = next.route !== prev.route;
    const viewChanged = next.view !== prev.view;
    const selectionChanged = next.selection !== prev.selection;
    const layersChanged = next.layers !== prev.layers;
    const missionChanged = next.mission !== prev.mission;
    const preferencesChanged = next.preferences !== prev.preferences;
    const timeChanged = next.time !== prev.time;

    if (routeChanged || viewChanged) this.applyRoute(next);
    if (preferencesChanged) this.applyPreferences(next);
    if (layersChanged || missionChanged || routeChanged) this.applyLayers(next);
    if (selectionChanged || routeChanged || missionChanged) this.applySelection(next, false);
    if (timeChanged) this.applyTime(next, prev);
    if (missionChanged) {
      this.renderMissionPanel();
      this.renderProgress();
      this.syncLayerList();
      if (next.route === 'teacher') this.renderTeacher();
      if (next.route === 'explore') this.renderSelectionPanel();
    }
    if (routeChanged) {
      this.renderSelectionPanel();
      this.renderMissionPanel();
      this.renderTeacher();
      this.renderFullCrossSection();
      this.renderReadout();
    }
    if (viewChanged) {
      this.renderFullCrossSection();
      this.renderReadout();
    }
    if (preferencesChanged && next.route === 'teacher') this.renderTeacher();
    if (layersChanged && next.route === 'teacher') this.renderTeacher();
    this.previousState = next;
    this.scheduleSave();
  }

  private fullRender(state: AppState): void {
    this.applyRoute(state);
    this.applyPreferences(state);
    this.syncLayerList();
    this.syncPlateList();
    this.applyLayers(state);
    this.applySelection(state, false);
    this.applyTime(state);
    if (state.route !== 'teacher') {
      const cluster = this.selectedBoundary;
      if (cluster) {
        this.globe?.focus(
          cluster.representative.lat,
          cluster.representative.lon,
          this.adaptedDistance(3.05),
          true
        );
      } else {
        const plate = this.selectedPlate;
        if (plate) {
          const centroid = plateLabelPoint(plate);
          this.globe?.focus(centroid.lat, centroid.lon, this.adaptedDistance(3.05), true);
        }
      }
    }
    this.renderMissionPanel();
    this.renderTeacher();
    this.renderFullCrossSection();
    this.renderProgress();
    this.renderReadout();
  }

  private applyRoute(state: AppState): void {
    const isTeacher = state.route === 'teacher';
    this.elements.exploreLayout.classList.toggle('hidden', isTeacher);
    this.elements.teacherLayout.classList.toggle('hidden', !isTeacher);
    qsa<HTMLElement>('[data-route]').forEach((button) => {
      const active = button.dataset.route === state.route;
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (isTeacher) {
      this.stopPlaybackLoop();
      this.globe?.setActive(false);
      this.closePanels();
    } else {
      const globeVisible = state.view === 'globe';
      this.globe?.setActive(globeVisible);
    }
    const crossSection = state.view === 'cross-section';
    this.elements.globeArea.classList.toggle('hidden', crossSection);
    this.elements.crossSectionFull.classList.toggle('hidden', !crossSection);
    this.elements.stageTitle.textContent = isTeacher
      ? '교사 모드'
      : state.route === 'missions'
        ? '미션으로 경계를 관찰하세요'
        : crossSection
          ? '개념 단면도'
          : '지구를 돌려 경계를 읽어 보세요';
    this.elements.stageEyebrow.textContent = isTeacher
      ? 'TEACHER'
      : crossSection
        ? 'CROSS-SECTION'
        : state.route === 'missions'
          ? 'MISSION'
          : 'EXPLORE';
    this.elements.mobileSelectionTab.textContent = state.route === 'missions' ? '미션' : '선택';
    if (crossSection) this.renderFullCrossSection();
  }

  private applyPreferences(state: AppState): void {
    document.body.classList.toggle('reduced-motion', state.preferences.reducedMotion);
    show(this.elements.scaleBadge, state.preferences.showScaleWarning);
    show(this.elements.stageBadges, state.preferences.showScaleWarning);
    this.globe?.setReducedMotion(state.preferences.reducedMotion);
  }

  private applyLayers(state: AppState): void {
    const layers = this.effectiveLayers(state);
    this.globe?.setLayers(layers);
    this.syncLayerList();
    if (state.route === 'teacher') this.renderTeacher();
  }

  private applySelection(state: AppState, focus: boolean): void {
    const cluster = this.selectedBoundary;
    this.globe?.setSelection(cluster);
    if (cluster) {
      this.globe?.setPlateMarker(null, null);
    } else {
      const plate = this.selectedPlate;
      if (plate) {
        const centroid = plateLabelPoint(plate);
        this.globe?.setPlateMarker(centroid.lat, centroid.lon, plate.color);
      } else {
        this.globe?.setPlateMarker(null, null);
      }
    }
    if (focus && cluster) {
      this.globe?.focus(
        cluster.representative.lat,
        cluster.representative.lon,
        this.adaptedDistance(2.85)
      );
    }
    if (state.route === 'explore') this.renderSelectionPanel();
    if (state.route === 'missions') this.renderMissionPanel();
    this.syncPlateList();
    this.renderReadout();
  }

  private applyTime(state: AppState, previous?: AppState): void {
    const myr = state.time.myr;
    this.globe?.setTime(myr);
    this.elements.timeLabel.textContent = formatTimeLabel(myr);
    this.elements.timeNote.textContent = '모델 시간 · 미래 예측 아님';
    this.elements.timeRange.value = String(Math.round(myr));
    this.elements.timeRange.setAttribute('aria-valuetext', formatTimeShort(myr));
    this.elements.playToggle.textContent = state.time.playing ? '❚❚ 일시정지' : '▶ 재생';
    this.elements.playToggle.setAttribute(
      'aria-label',
      state.time.playing ? '시간 일시정지' : '시간 재생'
    );
    this.elements.speedSelect.value = String(state.time.speed);
    const now = performance.now();
    if (now - this.lastReadoutTime > 220 || !previous || previous.selection !== state.selection) {
      this.renderReadout();
      this.lastReadoutTime = now;
    }
    if (
      state.view === 'cross-section' ||
      (state.route === 'explore' && Boolean(this.selectedBoundary))
    ) {
      if (
        now - this.lastPreviewTime > 140 ||
        !previous ||
        previous.selection !== state.selection ||
        previous.view !== state.view
      ) {
        this.updateCrossSectionViews();
        this.lastPreviewTime = now;
      }
    }
  }

  private syncLayerList(): void {
    const hidden = this.hideBoundaryType();
    qsa<HTMLInputElement>('input[data-layer]', this.elements.layerList).forEach((input) => {
      const key = input.dataset.layer as keyof LayerState;
      input.checked = Boolean(this.store.state.layers[key]);
      const disabled = hidden && (key === 'boundaries' || key === 'labels');
      input.disabled = disabled;
      input.closest('.toggle')?.classList.toggle('is-disabled', disabled);
    });
    const note = this.elements.layerList.querySelector<HTMLElement>('#layer-mission-note');
    show(note, hidden);
  }

  private syncPlateList(): void {
    const selectedId = this.store.state.selection.plateId;
    qsa<HTMLElement>('[data-plate-id]', this.elements.plateList).forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.plateId === selectedId ? 'true' : 'false');
    });
  }

  private renderSelectionPanel(): void {
    if (this.store.state.route !== 'explore') {
      show(this.elements.selectionPanel, false);
      return;
    }
    show(this.elements.selectionPanel, true);
    this.previewView?.dispose();
    this.previewView = null;
    const cluster = this.selectedBoundary;
    const plate = this.selectedPlate;
    const hidden = this.hideBoundaryType();
    if (cluster) {
      const typeLabel = hidden ? '관찰 중인 경계' : boundaryTypeLabelKo(cluster.type);
      const subtypeLabel = hidden
        ? '유형은 예측 후 공개됩니다'
        : boundarySubtypeLabelKo(cluster.subtype);
      const color = hidden ? '#93b4bf' : boundaryTypeColor(cluster.type);
      const normalLabel =
        cluster.normalComponent >= 0 ? '서로 가까워지는 성분' : '서로 멀어지는 성분';
      const otherBoundaries = boundariesForPlate(this.boundaries, cluster.plateA)
        .concat(boundariesForPlate(this.boundaries, cluster.plateB))
        .filter(
          (candidate, index, list) =>
            candidate.id !== cluster.id &&
            candidate.type !== 'inactive' &&
            list.findIndex((item) => item.id === candidate.id) === index
        )
        .slice(0, 3);
      this.elements.selectionPanel.innerHTML = `
        <div class="panel-heading">
          <div><span class="eyebrow">SELECTED BOUNDARY</span><h2>경계 카드</h2></div>
          <div class="panel-heading-actions">
            <button type="button" class="text-btn" data-action="clear-selection">해제</button>
            <button type="button" class="icon-btn panel-close" data-close-panel="right" aria-label="경계 패널 닫기">×</button>
          </div>
        </div>
        <h3 class="selection-title" style="color:${escapeAttr(color)}">${escapeHtml(typeLabel)}</h3>
        <p class="selection-subtitle">${escapeHtml(boundaryPlatesLabelKo(cluster))}</p>
        <div class="chips">
          <span class="chip accent">${escapeHtml(subtypeLabel)}</span>
          <span class="chip">${cluster.relativeVelocityCmYr.toFixed(1)} cm/yr</span>
          <span class="chip">${Math.round(cluster.lengthKm).toLocaleString('ko-KR')} km</span>
        </div>
        ${
          hidden
            ? `<div class="observe-note"><strong>예측 먼저.</strong> 경계선과 이름표를 잠시 숨겼습니다. 해구·산맥·지진·화산의 위치를 관찰한 뒤 유형을 골라 보세요.</div>`
            : `<div class="landform-callout"><strong>${escapeHtml(boundaryLandformLabelKo(cluster.subtype))}</strong>${escapeHtml(this.boundaryDescription(cluster))}</div>
               <div class="stat-grid">
                 <div class="stat"><span>상대 속도</span><strong>${cluster.relativeVelocityCmYr.toFixed(1)} cm/yr</strong></div>
                 <div class="stat"><span>${escapeHtml(normalLabel)}</span><strong>${cluster.normalComponent.toFixed(1)} cm/yr</strong></div>
                 <div class="stat"><span>미끄러지는 성분</span><strong>${Math.abs(cluster.tangentialComponent).toFixed(1)} cm/yr</strong></div>
                 <div class="stat"><span>화산</span><strong>${cluster.type === 'transform' ? '거의 없음' : cluster.type === 'convergent' || cluster.type === 'divergent' ? '나타남' : '적음'}</strong></div>
               </div>
               <div class="preview-wrap"><canvas id="preview-canvas" aria-label="선택한 경계의 개념 단면도 미리보기"></canvas></div>
               <p class="preview-caption">개념 단면도 · 실제 지질 단면이 아님</p>`
        }
        <div class="btn-row">
          ${
            hidden
              ? ''
              : `<button type="button" class="btn btn-primary btn-pulse" data-action="open-cross-section">단면도 크게 보기</button>`
          }
          <button type="button" class="btn btn-ghost" data-action="focus-boundary">이 경계로 이동</button>
        </div>
        ${
          otherBoundaries.length > 0
            ? `<div class="mission-section"><h3>이 판과 만나는 다른 경계</h3><div class="mission-list">${otherBoundaries
                .map(
                  (candidate) =>
                    `<button type="button" class="mission-card" data-boundary-id="${escapeAttr(candidate.id)}">
                      <span class="mission-card-top"><strong>${escapeHtml(boundaryTypeLabelKo(candidate.type))}</strong><span class="mission-card-meta">${Math.round(candidate.lengthKm).toLocaleString('ko-KR')} km</span></span>
                      <span class="mission-card-meta">${escapeHtml(boundaryPlatesLabelKo(candidate))} · ${escapeHtml(boundarySubtypeLabelKo(candidate.subtype))}</span>
                    </button>`
                )
                .join('')}</div></div>`
            : ''
        }
      `;
      if (!hidden) {
        const canvas =
          this.elements.selectionPanel.querySelector<HTMLCanvasElement>('#preview-canvas');
        if (canvas) {
          this.previewView = new CrossSectionView(canvas);
          this.previewView.setModel(describeCrossSection(cluster, this.store.state.time.myr), {
            compact: true,
            reducedMotion: this.store.state.preferences.reducedMotion
          });
        }
      }
      return;
    }
    if (plate) {
      const plateBoundaries = boundariesForPlate(this.boundaries, plate.id)
        .filter((candidate) => candidate.type !== 'inactive')
        .slice(0, 6);
      this.elements.selectionPanel.innerHTML = `
        <div class="panel-heading">
          <div><span class="eyebrow">SELECTED PLATE</span><h2>판 카드</h2></div>
          <div class="panel-heading-actions">
            <button type="button" class="text-btn" data-action="clear-selection">해제</button>
            <button type="button" class="icon-btn panel-close" data-close-panel="right" aria-label="판 패널 닫기">×</button>
          </div>
        </div>
        <h3 class="selection-title" style="color:${escapeAttr(plate.color)}">${escapeHtml(plate.nameKo)}</h3>
        <p class="selection-subtitle">${escapeHtml(plateTypeLabel(plate.type))} · ${escapeHtml(plate.nameEn)}</p>
        <div class="chips">
          <span class="chip accent">${escapeHtml(plateTypeLabel(plate.type))}</span>
          <span class="chip">${Math.hypot(plate.motion.eastCmYr, plate.motion.northCmYr).toFixed(1)} cm/yr</span>
        </div>
        <div class="landform-callout"><strong>운동 벡터</strong>${escapeHtml(plateMotionLabel(plate))}</div>
        <p class="motion-note">판의 색은 수업용으로 단순화한 것이며, 경계선은 실제 판 경계를 단순화한 모자이크입니다.</p>
        ${
          plateBoundaries.length > 0
            ? `<div class="mission-section"><h3>이 판과 만나는 경계</h3><div class="mission-list">${plateBoundaries
                .map(
                  (candidate) =>
                    `<button type="button" class="mission-card" data-boundary-id="${escapeAttr(candidate.id)}">
                      <span class="mission-card-top"><strong>${escapeHtml(boundaryTypeLabelKo(candidate.type))}</strong><span class="mission-card-meta">${Math.round(candidate.lengthKm).toLocaleString('ko-KR')} km</span></span>
                      <span class="mission-card-meta">${escapeHtml(boundaryPlatesLabelKo(candidate))} · ${escapeHtml(boundarySubtypeLabelKo(candidate.subtype))}</span>
                    </button>`
                )
                .join('')}</div></div>`
            : ''
        }
      `;
      return;
    }
    this.elements.selectionPanel.innerHTML = `
      <div class="empty-state">
        <span class="eyebrow">EXPLORE</span>
        <h2>경계를 골라 보세요</h2>
        <p>지구본을 돌리고 판 경계를 클릭하면 지형과 사건, 개념 단면도가 함께 바뀝니다. 경계선은 색과 선 모양, 이름표로 구분됩니다.</p>
        <ol class="steps">
          <li><span class="step-num">1</span><span>지구본을 드래그해 관심 있는 바다나 대륙으로 이동합니다.</span></li>
          <li><span class="step-num">2</span><span>경계선 근처를 클릭해 경계를 선택합니다.</span></li>
          <li><span class="step-num">3</span><span>시간을 0에서 200 Myr까지 움직이며 지형 변화를 관찰합니다.</span></li>
        </ol>
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-pulse" data-action="select-andes">안데스 경계 보기</button>
          <button type="button" class="btn btn-ghost" data-action="close-panels">닫기</button>
        </div>
      </div>
    `;
  }

  private boundaryDescription(cluster: BoundaryCluster): string {
    switch (cluster.subtype) {
      case 'ridge':
        return ' 맨틀이 올라와 새 해양 지각을 만들고, 해령 양쪽으로 지각이 이동합니다.';
      case 'rift':
        return ' 대륙 지각이 갈라지고 가라앉습니다. 시간이 지나면 좁은 바다가 될 수 있습니다.';
      case 'oceanic-continental':
        return ' 해양판이 대륙 아래로 섭입합니다. 해구는 바다 쪽, 산맥과 화산호는 대륙 쪽에 나타납니다.';
      case 'oceanic-oceanic':
        return ' 한 해양판이 다른 해양판 아래로 들어가 해구와 섬호를 만듭니다.';
      case 'continental-continental':
        return ' 두 대륙 지각이 부딪혀 접히고 두꺼워지며 넓은 산맥과 고원을 만듭니다.';
      case 'transform':
        return ' 두 판이 옆으로 미끄러집니다. 지진은 많지만 화산은 거의 없습니다.';
      default:
        return ' 상대 운동이 느려 뚜렷한 지형 변화가 적습니다.';
    }
  }

  private renderMissionPanel(): void {
    if (this.store.state.route !== 'missions') {
      show(this.elements.missionPanel, false);
      return;
    }
    show(this.elements.missionPanel, true);
    const state = this.store.state;
    const mission = this.currentMission;
    const done = completedCount(state.mission.completed);
    const select = `
      <div class="mission-header">
        <div><span class="eyebrow">MISSIONS</span><h2>미션</h2></div>
        <div class="panel-heading-actions">
          <span class="mission-progress">${done}/6 완료</span>
          <button type="button" class="icon-btn panel-close" data-close-panel="right" aria-label="미션 패널 닫기">×</button>
        </div>
      </div>
      <select id="mission-select" class="mission-select" aria-label="미션 선택">
        <option value="">미션을 선택하세요</option>
        ${MISSIONS.map(
          (item) =>
            `<option value="${escapeAttr(item.id)}" ${mission?.id === item.id ? 'selected' : ''}>${escapeHtml(item.titleKo)}${state.mission.completed.includes(item.id) ? ' · 완료' : ''}</option>`
        ).join('')}
      </select>
    `;
    if (!mission) {
      this.elements.missionPanel.innerHTML = `
        ${select}
        <p class="mission-prompt">여섯 개의 미션으로 판 경계 읽기, 수렴 지형, 변환 단층, 열곡, 불의 고리를 차례로 탐구합니다.</p>
        <div class="mission-list">
          ${MISSIONS.map(
            (item) => `
            <button type="button" class="mission-card" data-mission-id="${escapeAttr(item.id)}">
              <span class="mission-card-top"><strong>${escapeHtml(item.titleKo)}</strong>${state.mission.completed.includes(item.id) ? '<span class="mission-card-done">완료</span>' : `<span class="mission-card-meta">${escapeHtml(difficultyLabel(item.difficulty))}</span>`}</span>
              <span class="mission-card-meta">${escapeHtml(missionConceptLabel(item.concept))} · ${escapeHtml(item.promptKo)}</span>
            </button>`
          ).join('')}
        </div>
      `;
      return;
    }
    const prediction = state.mission.answers[`${mission.id}:prediction`] ?? '';
    const explanation = state.mission.answers[`${mission.id}:explanation`] ?? '';
    if (this.draftPrediction[mission.id] === undefined && prediction) {
      this.draftPrediction[mission.id] = prediction;
    }
    if (this.draftExplanation[mission.id] === undefined && explanation) {
      this.draftExplanation[mission.id] = explanation;
    }
    const predictionPassed = prediction === mission.answer;
    const explanationPassed = explanation === mission.explanationAnswer;
    const completed = state.mission.completed.includes(mission.id);
    const hidden = this.hideBoundaryType();
    const selected = this.selectedBoundary;
    const score = state.mission.scores[mission.id];
    const wrongAttempts = state.mission.attempts[mission.id] ?? 0;
    const explanationHeadingId = 'explanation-heading';
    const completionHeadingId = 'mission-complete-heading';
    const predictionFeedback =
      prediction && !predictionPassed
        ? `<div class="feedback wrong" role="status"><strong>아직 정답이 아니에요.</strong>${escapeHtml(mission.predictionHintKo)}</div>`
        : '';
    const explanationFeedback =
      explanation && !explanationPassed
        ? `<div class="feedback wrong" role="status"><strong>까닭을 다시 살펴보세요.</strong>관찰한 지형과 사건의 위치를 근거로 골라 보세요.</div>`
        : '';

    this.elements.missionPanel.innerHTML = `
      ${select}
      <span class="eyebrow">MISSION ${escapeHtml(missionConceptLabel(mission.concept))}</span>
      <h3 class="mission-title">${escapeHtml(mission.titleKo)}</h3>
      <div class="chips">
        <span class="chip accent">${escapeHtml(difficultyLabel(mission.difficulty))}</span>
        <span class="chip">${formatTimeShort(state.time.myr)}</span>
        ${selected ? `<span class="chip">${escapeHtml(boundaryPlatesLabelKo(selected))}</span>` : ''}
        ${completed ? '<span class="completed-badge">완료</span>' : ''}
      </div>
      <p class="mission-prompt">${escapeHtml(mission.promptKo)}</p>
      <div class="mission-scenario">
        <span class="chip">개념 모델</span>
        <span class="chip">실제 예보 아님</span>
      </div>
      ${
        hidden
          ? `<div class="observe-note"><strong>관찰 모드.</strong> 경계 유형을 맞히기 전에는 경계선과 이름표를 숨깁니다. 지형·지진·화산 표시를 살펴보세요.</div>`
          : ''
      }
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-sm" data-action="reapply-mission">시나리오로 돌아가기</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="focus-boundary" ${selected ? '' : 'disabled'}>경계로 이동</button>
        ${
          !hidden && selected
            ? `<button type="button" class="btn btn-ghost btn-sm" data-action="open-cross-section">단면도 보기</button>`
            : ''
        }
      </div>

      <section class="mission-section">
        <h3>1. 예측</h3>
        ${
          predictionPassed
            ? `<div class="feedback correct" role="status"><strong>예측 성공.</strong>이제 관찰한 증거로 까닭을 설명해 보세요.</div>`
            : `<div class="option-list">
                ${mission.options
                  .map(
                    (option, index) => `
                    <label class="option">
                      <input type="radio" name="prediction" value="${escapeAttr(option)}" ${this.draftPrediction[mission.id] === option ? 'checked' : ''} />
                      <span>${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</span>
                    </label>`
                  )
                  .join('')}
              </div>
              <div class="btn-row">
                <button type="button" class="btn btn-primary btn-pulse" data-action="submit-prediction">예측 확인</button>
              </div>
              ${predictionFeedback}
              <details class="hint-box"><summary>힌트 보기</summary>${escapeHtml(mission.predictionHintKo)}</details>`
        }
      </section>

      ${
        predictionPassed
          ? `<section class="mission-section">
              <h3 id="${explanationHeadingId}" tabindex="-1">2. 설명</h3>
              <p class="mission-prompt">${escapeHtml(mission.explanationPromptKo)}</p>
              ${
                explanationPassed
                  ? ''
                  : `<div class="option-list">
                      ${mission.explanationOptions
                        .map(
                          (option, index) => `
                          <label class="option">
                            <input type="radio" name="explanation" value="${escapeAttr(option)}" ${this.draftExplanation[mission.id] === option ? 'checked' : ''} />
                            <span>${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</span>
                          </label>`
                        )
                        .join('')}
                    </div>
                    <div class="btn-row">
                      <button type="button" class="btn btn-primary btn-pulse" data-action="submit-explanation">설명 확인</button>
                    </div>
                    ${explanationFeedback}`
              }
              ${
                explanationPassed
                  ? `<div class="feedback correct" role="status"><strong>설명 완료.</strong>${escapeHtml(mission.explanationKo)}</div>
                     <div class="takeaway"><strong>한 줄 정리</strong>${escapeHtml(mission.takeawayKo)}</div>`
                  : ''
              }
            </section>`
          : ''
      }

      ${
        completed
          ? `<section class="mission-section">
              <h3 id="${completionHeadingId}" tabindex="-1">미션 완료</h3>
              <div class="completed-badge">완료 · ${score ?? scoreForAttempts(wrongAttempts)}점</div>
              <p class="motion-note">틀린 횟수 ${wrongAttempts}회 · 다음 미션으로 이어서 탐구해 보세요.</p>
              <div class="btn-row">
                <button type="button" class="btn btn-primary btn-pulse" data-action="next-mission">다음 미션</button>
              </div>
            </section>`
          : ''
      }
    `;
    if (this.focusExplanationOnRender) {
      this.focusExplanationOnRender = false;
      requestAnimationFrame(() => {
        this.elements.missionPanel.querySelector<HTMLElement>(`#${explanationHeadingId}`)?.focus();
      });
    }
    if (this.focusCompletionOnRender) {
      this.focusCompletionOnRender = false;
      requestAnimationFrame(() => {
        this.elements.missionPanel.querySelector<HTMLElement>(`#${completionHeadingId}`)?.focus();
      });
    }
  }

  private renderTeacher(): void {
    if (this.store.state.route !== 'teacher') return;
    const state = this.store.state;
    const done = completedCount(state.mission.completed);
    const scores = MISSIONS.map((mission) => state.mission.scores[mission.id]).filter(
      (score): score is number => typeof score === 'number'
    );
    const average =
      scores.length > 0
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : 0;
    this.elements.teacherLayout.innerHTML = `
      <div class="teacher-head">
        <div>
          <span class="eyebrow">TEACHER MODE</span>
          <h1>교사 모드</h1>
          <p>수업용 개념 모델입니다. 정답과 해설을 확인하고, 장면을 바로 띄우거나 학생용 활동지를 인쇄할 수 있습니다. 이 앱은 실제 지진·화산을 예측하지 않습니다.</p>
        </div>
        <span class="badge badge-concept">개념 모델 · 예보 아님</span>
      </div>
      <div class="teacher-summary">
        <span class="chip accent">완료 ${done}/6</span>
        <span class="chip">평균 ${average}점</span>
        <span class="chip">시간 ${formatTimeShort(state.time.myr)}</span>
        <span class="chip">고도 40× 과장</span>
      </div>
      <div class="teacher-grid">
        <div>
          <section class="teacher-card">
            <h2>미션과 정답</h2>
            <table class="mission-table">
              <thead><tr><th>미션</th><th>개념</th><th>정답</th><th>해설</th><th>상태</th></tr></thead>
              <tbody>
                ${MISSIONS.map(
                  (mission) => `
                  <tr>
                    <td><strong>${escapeHtml(mission.titleKo)}</strong><br /><span>${escapeHtml(mission.promptKo)}</span></td>
                    <td>${escapeHtml(missionConceptLabel(mission.concept))}</td>
                    <td class="answer">${escapeHtml(mission.answer)}</td>
                    <td>${escapeHtml(mission.explanationKo)}</td>
                    <td>${state.mission.completed.includes(mission.id) ? `완료 ${state.mission.scores[mission.id] ?? ''}` : '미완료'}</td>
                  </tr>`
                ).join('')}
              </tbody>
            </table>
          </section>
          <section class="teacher-card">
            <h2>수업 장면 바로 열기</h2>
            <div class="preset-list">
              ${PRESETS.map(
                (preset) => `
                <button type="button" class="preset-btn" data-preset="${escapeAttr(preset.id)}">
                  ${escapeHtml(preset.nameKo)}
                  <span>${escapeHtml(preset.captionKo)} · ${preset.myr} Myr</span>
                </button>`
              ).join('')}
            </div>
          </section>
        </div>
        <div>
          <section class="teacher-card">
            <h2>수업 설정</h2>
            <div class="settings-grid">
              <label class="toggle">
                <input type="checkbox" data-pref="reducedMotion" ${state.preferences.reducedMotion ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>동작 줄이기<small class="toggle-note">자동 회전과 깜빡임을 끕니다.</small></span>
              </label>
              <label class="toggle">
                <input type="checkbox" data-pref="showScaleWarning" ${state.preferences.showScaleWarning ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>고도 과장 배지 표시</span>
              </label>
              <label class="toggle">
                <input type="checkbox" data-layer="labels" ${state.layers.labels ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>경계·판 이름표 표시</span>
              </label>
            </div>
          </section>
          <section class="teacher-card">
            <h2>진행과 인쇄</h2>
            <p>활동지는 빈 세계 지도, 경계 유형별 지진 수 표, 여섯 미션 질문으로 구성됩니다. 인쇄 대화상자에서 용지를 A4로 선택하세요.</p>
            <div class="teacher-actions">
              <button type="button" class="btn btn-primary btn-pulse" id="teacher-print" data-action="print-worksheet">활동지 인쇄</button>
              <button type="button" class="btn btn-danger" id="teacher-reset" data-action="reset-progress">진행 초기화</button>
            </div>
          </section>
          <section class="teacher-card">
            <h2>모델의 한계</h2>
            <p>판의 모양과 운동은 수업을 위해 단순화했습니다. 지형 고도는 40배 과장했고, 지진·화산은 규칙 기반 분포 모델입니다. 실제 지질도나 미래 예측으로 사용하면 안 됩니다.</p>
          </section>
        </div>
      </div>
    `;
  }

  private renderFullCrossSection(): void {
    const state = this.store.state;
    if (state.view !== 'cross-section' || state.route === 'teacher') return;
    const cluster = this.selectedBoundary;
    const model = describeCrossSection(cluster, state.time.myr);
    this.fullView.setModel(model, {
      compact: false,
      reducedMotion: state.preferences.reducedMotion
    });
    this.elements.fullSectionTitle.textContent = model.titleKo;
    this.elements.fullSectionSubtitle.textContent = model.subtitleKo;
    this.elements.fullSectionNotes.innerHTML = model.notesKo
      .map((note) => `<li>${escapeHtml(note)}</li>`)
      .join('');
  }

  private updateCrossSectionViews(): void {
    const state = this.store.state;
    const cluster = this.selectedBoundary;
    if (state.route === 'explore' && this.previewView) {
      this.previewView.setModel(describeCrossSection(cluster, state.time.myr), {
        compact: true,
        reducedMotion: state.preferences.reducedMotion
      });
    }
    if (state.view === 'cross-section') this.renderFullCrossSection();
  }

  private renderReadout(): void {
    const state = this.store.state;
    const cluster = this.selectedBoundary;
    const plate = this.selectedPlate;
    const counts = countEventsInWindow(this.catalog, state.time.myr);
    const volcanoCount = visibleVolcanoes(this.catalog).length;
    const hidden = this.hideBoundaryType();
    const landformText = cluster && !hidden ? boundaryLandformLabelKo(cluster.subtype) : '';
    const selectedText = cluster
      ? hidden
        ? '경계 유형 관찰 중'
        : `${boundaryTypeLabelKo(cluster.type)} · ${boundaryPlatesLabelKo(cluster)}`
      : plate
        ? `${plate.nameKo} · ${plateTypeLabel(plate.type)}`
        : '경계를 선택하세요';
    this.elements.readout.innerHTML = `
      <span class="readout-line"><strong>${escapeHtml(formatTimeLabel(state.time.myr))}</strong> · ${escapeHtml(selectedText)}</span>
      <span class="readout-line readout-extra">지진 사건 ${counts.total} (최대 300 표시) · 화산 ${volcanoCount} · 발산 ${counts.divergent} / 수렴 ${counts.convergent} / 변환 ${counts.transform}</span>
      <span class="readout-line readout-extra">${hidden ? '미션 예측 전에는 유형을 숨깁니다.' : '지형은 개념 모델이며 실제 예보가 아닙니다.'}</span>
      ${landformText ? `<span class="readout-line readout-extra">단면도: ${escapeHtml(landformText)}</span>` : ''}
    `;
    this.elements.mapReadBody.innerHTML = `
      <p><strong>시간</strong> ${escapeHtml(formatTimeLabel(state.time.myr))}입니다. ${escapeHtml(
        state.time.myr >= MAX_TIME_MYR
          ? '모델 시간의 끝입니다. 실제 미래가 아닙니다.'
          : '현재에서 모델 미래로 진행하는 시간입니다.'
      )}</p>
      <p><strong>선택</strong> ${escapeHtml(selectedText)}</p>
      <p><strong>사건</strong> 시간 ±2 Myr 안에 지진 ${counts.total}개, 표시 화산 ${volcanoCount}개가 보입니다. 지진은 발산 ${counts.divergent}개, 수렴 ${counts.convergent}개, 변환 ${counts.transform}개입니다.</p>
      <p><strong>판</strong> ${PLATES.map((item) => item.nameKo).join(', ')}.</p>
      <p><strong>주요 경계</strong> ${this.boundaries
        .filter((item) => item.lengthKm > 2600 && item.type !== 'inactive')
        .slice(0, 6)
        .map(
          (item) =>
            `${escapeHtml(boundaryPlatesLabelKo(item))} ${escapeHtml(boundaryTypeShortKo(item.type))}`
        )
        .join(' · ')}.</p>
    `;
  }

  private renderProgress(): void {
    const done = completedCount(this.store.state.mission.completed);
    this.elements.progressChip.textContent = `미션 ${done}/6`;
  }

  private adaptedDistance(distance: number): number {
    return window.innerWidth < 768 ? Math.max(3.7, distance) : distance;
  }

  private goRoute(route: Route): void {
    if (route === 'teacher' && this.store.state.time.playing) this.pausePlayback();
    navigate(route);
    if (this.store.state.route !== route) this.store.patch({ route });
    this.closePanels();
  }

  private setView(view: ViewMode): void {
    if (view === 'cross-section' && !this.selectedBoundary) {
      this.showToast('먼저 지구본에서 경계를 선택하세요.');
      return;
    }
    if (view === 'cross-section' && this.hideBoundaryType()) {
      this.showToast('미션 예측을 완료한 뒤 단면도를 볼 수 있습니다.');
      return;
    }
    this.store.patch({ view });
  }

  private openCrossSection(): void {
    this.setView('cross-section');
  }

  private selectBoundary(id: string | null, focus = false): void {
    if (!id) {
      this.store.patch({ selection: { boundaryId: null, plateId: null } });
      return;
    }
    const cluster = this.boundaries.find((item) => item.id === id);
    if (!cluster) return;
    this.store.patch({ selection: { boundaryId: id, plateId: null } });
    if (focus) {
      this.globe?.focus(
        cluster.representative.lat,
        cluster.representative.lon,
        this.adaptedDistance(2.85)
      );
    }
    this.announce(
      `${boundaryTypeLabelKo(cluster.type)} 경계를 선택했습니다. ${boundaryPlatesLabelKo(cluster)}`
    );
  }

  private selectPlate(id: string | null): void {
    if (!id) {
      this.store.patch({ selection: { boundaryId: null, plateId: null } });
      return;
    }
    const plate = PLATE_BY_ID.get(id);
    if (!plate) return;
    this.store.patch({ selection: { boundaryId: null, plateId: id } });
    const centroid = plateLabelPoint(plate);
    this.globe?.setPlateMarker(centroid.lat, centroid.lon, plate.color);
    this.announce(`${plate.nameKo}를 선택했습니다. ${plateMotionLabel(plate)}`);
  }

  private selectAndes(): void {
    const cluster = findBoundaryMatch(this.boundaries, {
      plates: ['nazca', 'south-america'],
      type: 'convergent',
      subtype: 'oceanic-continental'
    });
    if (!cluster) return;
    this.selectBoundary(cluster.id, true);
    this.store.patch({ route: 'explore', view: 'globe' });
    navigate('explore');
  }

  private focusSelectedBoundary(): void {
    const cluster = this.selectedBoundary;
    if (!cluster) return;
    this.globe?.focus(
      cluster.representative.lat,
      cluster.representative.lon,
      this.adaptedDistance(2.85)
    );
    this.closePanels();
  }

  private handleGlobePick(pick: GlobePick): void {
    const nearest = findNearestBoundary(this.boundaries, pick.lat, pick.lon, 8);
    if (nearest) {
      this.selectBoundary(nearest.cluster.id, false);
      return;
    }
    const plate = PLATE_RASTER.plateAtLatLon(pick.lat, pick.lon);
    this.selectPlate(plate.id);
  }

  private handleGlobeDoubleClick(pick: GlobePick): void {
    const nearest = findNearestBoundary(this.boundaries, pick.lat, pick.lon, 8);
    if (nearest) this.selectBoundary(nearest.cluster.id, false);
    this.globe?.focus(pick.lat, pick.lon, 2.15);
  }

  private cycleBoundary(direction: number): void {
    const candidates = this.boundaries.filter(
      (cluster) => cluster.type !== 'inactive' && cluster.lengthKm > 700
    );
    if (candidates.length === 0) return;
    const currentId = this.store.state.selection.boundaryId;
    let index = candidates.findIndex((cluster) => cluster.id === currentId);
    if (index < 0) index = 0;
    else index = (index + direction + candidates.length) % candidates.length;
    const cluster = candidates[index];
    this.selectBoundary(cluster.id, true);
  }

  private startMission(mission: Mission): void {
    const boundary = resolveMissionBoundary(mission, this.boundaries);
    if (!boundary) {
      this.showToast('이 미션의 경계를 찾지 못했습니다.');
      return;
    }
    this.draftPrediction[mission.id] =
      this.store.state.mission.answers[`${mission.id}:prediction`] ?? '';
    this.draftExplanation[mission.id] =
      this.store.state.mission.answers[`${mission.id}:explanation`] ?? '';
    this.store.update((state) => ({
      ...state,
      route: 'missions',
      view: mission.setup.view ?? 'globe',
      time: { ...state.time, myr: mission.setup.myr, playing: false },
      selection: { boundaryId: boundary.id, plateId: null },
      layers: { ...state.layers, ...(mission.setup.layers ?? {}) },
      mission: { ...state.mission, currentId: mission.id }
    }));
    navigate('missions');
    const camera = mission.setup.camera;
    requestAnimationFrame(() => {
      if (camera) {
        this.globe?.focus(
          camera.lat,
          camera.lon,
          this.adaptedDistance(camera.distance ?? 2.75),
          true
        );
      } else {
        this.globe?.focus(
          boundary.representative.lat,
          boundary.representative.lon,
          this.adaptedDistance(2.85),
          true
        );
      }
    });
    this.announce(`${mission.titleKo} 미션을 시작했습니다.`);
  }

  private submitPrediction(): void {
    const mission = this.currentMission;
    if (!mission) return;
    const checked = this.elements.missionPanel.querySelector<HTMLInputElement>(
      'input[name="prediction"]:checked'
    );
    if (!checked) {
      this.showToast('예측을 하나 선택하세요.');
      return;
    }
    const value = checked.value;
    const correct = value === mission.answer;
    this.store.update((state) => {
      const attempts = { ...state.mission.attempts };
      if (!correct) attempts[mission.id] = (attempts[mission.id] ?? 0) + 1;
      return {
        ...state,
        mission: {
          ...state.mission,
          answers: { ...state.mission.answers, [`${mission.id}:prediction`]: value },
          attempts
        }
      };
    });
    this.draftPrediction[mission.id] = value;
    saveProgress(this.store.state);
    if (correct) {
      this.focusExplanationOnRender = true;
      this.announce('예측이 맞았습니다. 이제 까닭을 설명해 보세요.');
      this.showToast('예측 성공. 설명 단계로 이동합니다.');
    } else {
      this.announce(`아직 정답이 아닙니다. ${mission.predictionHintKo}`);
      this.showToast('힌트를 확인하고 다시 골라 보세요.');
    }
  }

  private submitExplanation(): void {
    const mission = this.currentMission;
    if (!mission) return;
    const checked = this.elements.missionPanel.querySelector<HTMLInputElement>(
      'input[name="explanation"]:checked'
    );
    if (!checked) {
      this.showToast('설명을 하나 선택하세요.');
      return;
    }
    const value = checked.value;
    const correct = value === mission.explanationAnswer;
    let completedNow = false;
    this.store.update((state) => {
      const attempts = { ...state.mission.attempts };
      if (!correct) attempts[mission.id] = (attempts[mission.id] ?? 0) + 1;
      const completed = correct
        ? Array.from(new Set([...state.mission.completed, mission.id]))
        : state.mission.completed;
      const scores = { ...state.mission.scores };
      if (correct) scores[mission.id] = scoreForAttempts(attempts[mission.id] ?? 0);
      completedNow = correct && !state.mission.completed.includes(mission.id);
      return {
        ...state,
        mission: {
          ...state.mission,
          answers: { ...state.mission.answers, [`${mission.id}:explanation`]: value },
          attempts,
          completed,
          scores
        }
      };
    });
    this.draftExplanation[mission.id] = value;
    saveProgress(this.store.state);
    if (correct) {
      this.focusCompletionOnRender = true;
      this.announce(
        completedNow
          ? `${mission.titleKo} 미션을 완료했습니다. ${mission.takeawayKo}`
          : `${mission.titleKo} 미션의 설명을 확인했습니다.`
      );
      this.showToast(completedNow ? '미션 완료. 한 줄 정리를 확인하세요.' : '설명이 맞았습니다.');
    } else {
      this.announce('설명이 아직 맞지 않습니다. 관찰한 증거를 다시 살펴보세요.');
      this.showToast('지형과 사건의 위치를 근거로 다시 골라 보세요.');
    }
  }

  private nextMission(): void {
    const current = this.currentMission;
    const currentIndex = current ? MISSIONS.findIndex((mission) => mission.id === current.id) : -1;
    const next =
      MISSIONS.slice(currentIndex + 1).find(
        (mission) => !this.store.state.mission.completed.includes(mission.id)
      ) ??
      MISSIONS.find((mission) => !this.store.state.mission.completed.includes(mission.id)) ??
      MISSIONS[(currentIndex + 1 + MISSIONS.length) % MISSIONS.length];
    if (next) this.startMission(next);
  }

  private applyPreset(id: string): void {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    const boundary = findBoundaryMatch(this.boundaries, preset.match);
    if (!boundary) {
      this.showToast('이 장면의 경계를 찾지 못했습니다.');
      return;
    }
    this.store.update((state) => ({
      ...state,
      route: 'explore',
      view: 'globe',
      time: { ...state.time, myr: preset.myr, playing: false },
      selection: { boundaryId: boundary.id, plateId: null },
      layers: {
        ...state.layers,
        boundaries: true,
        labels: true,
        earthquakes: true,
        volcanoes: true
      }
    }));
    navigate('explore');
    this.closePanels();
    requestAnimationFrame(() => {
      if (preset.camera) {
        this.globe?.focus(
          preset.camera.lat,
          preset.camera.lon,
          this.adaptedDistance(preset.camera.distance ?? 2.75),
          true
        );
      } else {
        this.globe?.focus(
          boundary.representative.lat,
          boundary.representative.lon,
          this.adaptedDistance(2.85),
          true
        );
      }
    });
    this.showToast(`${preset.nameKo} 장면을 열었습니다.`);
  }

  private togglePlayback(): void {
    const state = this.store.state;
    if (state.time.playing) {
      this.pausePlayback();
      return;
    }
    const startAt = state.time.myr >= MAX_TIME_MYR ? 0 : state.time.myr;
    this.store.update((current) => ({
      ...current,
      time: { ...current.time, myr: startAt, playing: true }
    }));
    this.lastTick = 0;
    if (this.playbackFrame !== null) cancelAnimationFrame(this.playbackFrame);
    this.playbackFrame = requestAnimationFrame(this.tickPlayback);
  }

  private pausePlayback(): void {
    if (this.playbackFrame !== null) {
      cancelAnimationFrame(this.playbackFrame);
      this.playbackFrame = null;
    }
    if (this.store.state.time.playing) {
      this.store.update((state) => ({
        ...state,
        time: { ...state.time, playing: false }
      }));
    }
  }

  private stopPlaybackLoop(): void {
    if (this.playbackFrame !== null) {
      cancelAnimationFrame(this.playbackFrame);
      this.playbackFrame = null;
    }
  }

  private readonly tickPlayback = (now: number): void => {
    this.playbackFrame = null;
    const state = this.store.state;
    if (!state.time.playing) return;
    const last = this.lastTick === 0 ? now : this.lastTick;
    const delta = Math.min(0.1, (now - last) / 1000);
    this.lastTick = now;
    const next = state.time.myr + delta * state.time.speed;
    if (next >= MAX_TIME_MYR) {
      this.store.update((current) => ({
        ...current,
        time: { ...current.time, myr: MAX_TIME_MYR, playing: false }
      }));
      return;
    }
    this.store.update((current) => ({
      ...current,
      time: { ...current.time, myr: next }
    }));
    this.playbackFrame = requestAnimationFrame(this.tickPlayback);
  };

  private seek(myr: number): void {
    this.pausePlayback();
    this.store.update((state) => ({
      ...state,
      time: {
        ...state.time,
        myr: Math.max(0, Math.min(MAX_TIME_MYR, myr)),
        playing: false
      }
    }));
  }

  private togglePanel(panel: 'left' | 'right'): void {
    const element = panel === 'left' ? this.elements.leftPanel : this.elements.rightPanel;
    const other = panel === 'left' ? this.elements.rightPanel : this.elements.leftPanel;
    const button =
      panel === 'left' ? this.elements.toggleLeftPanel : this.elements.toggleRightPanel;
    const willOpen = !element.classList.contains('open');
    other.classList.remove('open');
    element.classList.toggle('open', willOpen);
    button.setAttribute('aria-expanded', String(willOpen));
    const otherButton =
      panel === 'left' ? this.elements.toggleRightPanel : this.elements.toggleLeftPanel;
    otherButton.setAttribute('aria-expanded', 'false');
  }

  private closePanels(): void {
    this.elements.leftPanel.classList.remove('open');
    this.elements.rightPanel.classList.remove('open');
    this.elements.toggleLeftPanel.setAttribute('aria-expanded', 'false');
    this.elements.toggleRightPanel.setAttribute('aria-expanded', 'false');
    qsa<HTMLElement>('#mobile-tabs button').forEach((button) => {
      const isTime = button.dataset.mobileTab === 'time';
      button.classList.toggle('active', isTime);
      button.setAttribute('aria-pressed', isTime ? 'true' : 'false');
    });
  }

  private setMobileTab(tab: string): void {
    const alreadyOpen =
      (tab === 'layers' && this.elements.leftPanel.classList.contains('open')) ||
      (tab === 'selection' && this.elements.rightPanel.classList.contains('open'));
    if (alreadyOpen) {
      this.closePanels();
      return;
    }
    const buttons = qsa<HTMLElement>('#mobile-tabs button');
    buttons.forEach((button) => {
      const active = button.dataset.mobileTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    this.elements.leftPanel.classList.toggle('open', tab === 'layers');
    this.elements.rightPanel.classList.toggle('open', tab === 'selection');
    if (tab === 'time') {
      this.elements.leftPanel.classList.remove('open');
      this.elements.rightPanel.classList.remove('open');
      this.elements.timeRange.scrollIntoView({
        block: 'nearest',
        behavior: this.store.state.preferences.reducedMotion ? 'auto' : 'smooth'
      });
      this.elements.timeRange.focus({ preventScroll: true });
    }
  }

  private showToast(message: string): void {
    this.elements.toast.textContent = message;
    this.elements.toast.classList.add('show');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.elements.toast.classList.remove('show');
      this.toastTimer = null;
    }, 2800);
  }

  private announce(message: string): void {
    this.elements.srStatus.textContent = '';
    requestAnimationFrame(() => {
      this.elements.srStatus.textContent = message;
    });
  }

  private confirmReset(): void {
    this.openConfirm(
      '학생 진행을 초기화할까요?',
      '완료한 미션, 점수, 저장된 답안이 모두 지워집니다. 이 작업은 되돌릴 수 없습니다.',
      '초기화',
      () => {
        clearProgress();
        this.store.update((state) => ({
          ...state,
          mission: {
            currentId: null,
            answers: {},
            completed: [],
            scores: {},
            attempts: {}
          }
        }));
        this.draftPrediction = {};
        this.draftExplanation = {};
        this.showToast('학생 진행을 초기화했습니다.');
        this.announce('학생 진행을 초기화했습니다.');
      }
    );
  }

  private openConfirm(
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void
  ): void {
    const dialog = document.createElement('dialog');
    dialog.innerHTML = `
      <div class="modal-body">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-modal-cancel>취소</button>
          <button type="button" class="btn btn-danger" data-modal-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    this.elements.modalRoot.appendChild(dialog);
    const close = (): void => {
      dialog.close();
      dialog.remove();
    };
    dialog.querySelector('[data-modal-cancel]')?.addEventListener('click', close);
    dialog.querySelector('[data-modal-confirm]')?.addEventListener('click', () => {
      close();
      onConfirm();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-modal-cancel]')?.focus();
  }

  private buildWorksheet(): void {
    this.elements.printWorksheet.innerHTML = `
      <div class="print-sheet">
        <h1>TerraShift · 판 경계 관찰 활동지</h1>
        <div class="print-meta"><span>이름: ____________________</span><span>날짜: ____________</span><span>모둠: ________</span></div>
        <p>지구본에서 판 경계를 관찰하고, 아래 지도에 발산·수렴·변환 경계를 표시해 보세요. 시간을 0, 50, 100, 200 Myr로 바꾸며 지진 수를 세어 표를 채웁니다. 개념 모델이며 실제 예보가 아닙니다.</p>
        ${buildWorksheetMapSvg()}
        <h2>경계 유형별 지진 수 (모델 시간 ±2 Myr)</h2>
        <table class="print-table">
          <thead><tr><th>경계 유형</th><th>0 Myr</th><th>50 Myr</th><th>100 Myr</th><th>200 Myr</th></tr></thead>
          <tbody>
            <tr><td>발산 경계</td><td></td><td></td><td></td><td></td></tr>
            <tr><td>수렴 경계</td><td></td><td></td><td></td><td></td></tr>
            <tr><td>변환 경계</td><td></td><td></td><td></td><td></td></tr>
            <tr><td>합계</td><td></td><td></td><td></td><td></td></tr>
          </tbody>
        </table>
        <h2>미션 질문</h2>
        <div class="print-questions">
          ${MISSIONS.map(
            (mission, index) =>
              `<div class="print-question">${index + 1}. ${escapeHtml(mission.promptKo)}</div>`
          ).join('')}
        </div>
        <p class="print-footer">TerraShift · 수업용 단순화 판 모자이크 · 지형 고도 40× 과장 · 실제 지진·화산 예측 아님</p>
      </div>
    `;
  }

  private printWorksheet(): void {
    window.print();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      saveProgress(this.store.state);
    }, 1000);
  }

  private exposeDebug(): void {
    const debugWindow = window as unknown as {
      __TERRASHIFT__?: {
        getState: () => AppState;
        getBoundaryCount: () => number;
        getEventCount: () => number;
        getMissionCount: () => number;
      };
    };
    debugWindow.__TERRASHIFT__ = {
      getState: () => this.store.state,
      getBoundaryCount: () => this.boundaries.length,
      getEventCount: () => this.catalog.earthquakes.length + this.catalog.volcanoes.length,
      getMissionCount: () => MISSIONS.length
    };
  }
}

function buildWorksheetMapSvg(): string {
  const width = 720;
  const height = 360;
  const project = (lat: number, lon: number): [number, number] => [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height
  ];
  const landPath = (polygon: Array<{ lat: number; lon: number }>): string => {
    if (polygon.length < 3) return '';
    const firstLon = polygon[0].lon;
    const points = polygon.map((point) => {
      let lon = point.lon;
      while (lon - firstLon > 180) lon -= 360;
      while (lon - firstLon < -180) lon += 360;
      return project(point.lat, lon);
    });
    return `M ${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;
  };
  const land = LAND_REGIONS.filter((region) => region.polar !== 'south')
    .map(
      (region) =>
        `<path d="${landPath(region.polygon)}" fill="#e8e3d8" stroke="#b9b1a3" stroke-width="1" />`
    )
    .join('');
  const grid: string[] = [];
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x] = project(0, lon);
    grid.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#d8d2c7" stroke-width="0.7" />`
    );
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = project(lat, 0);
    grid.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#d8d2c7" stroke-width="0.7" />`
    );
  }
  const antarcticY = project(-65, 0)[1];
  return `
    <svg class="print-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="빈 세계 지도">
      <rect width="${width}" height="${height}" fill="#fbfaf7" />
      ${grid.join('')}
      ${land}
      <rect x="0" y="${antarcticY}" width="${width}" height="${height - antarcticY}" fill="#f0ede6" stroke="#c9c2b6" stroke-width="1" />
      <text x="12" y="22" font-size="12" fill="#756f66" font-family="sans-serif">TerraShift · 관찰 지도</text>
    </svg>
  `;
}
