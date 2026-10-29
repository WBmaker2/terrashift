import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  TorusGeometry,
  TubeGeometry,
  Vector3
} from 'three';
import {
  boundaryPlatesLabelKo,
  boundarySubtypeLabelKo,
  boundaryTypeColor,
  boundaryTypeLabelKo,
  boundaryTypeShortKo,
  type BoundaryCluster,
  type BoundaryType
} from '../geo/boundaries';
import { PLATES } from '../geo/plates';
import { latLonToVector } from '../geo/sphere';
import { createTextSprite, disposeTextSprite } from './TextSprites';

const LINE_RADIUS = 1.061;
const SELECTED_RADIUS = 1.072;
const LABEL_RADIUS = 1.105;

export class PlateOverlay {
  private readonly boundaryGroup = new Group();
  private readonly labelsGroup = new Group();
  private readonly selectionGroup = new Group();
  private readonly lineObjects: LineSegments[] = [];
  private readonly plateLabels: Sprite[] = [];
  private readonly boundaryLabels: Sprite[] = [];
  private selectedTube: Mesh | null = null;
  private selectedRing: Mesh | null = null;
  private selectedLabel: Sprite | null = null;
  private selected: BoundaryCluster | null = null;

  constructor(
    private readonly scene: import('three').Scene,
    private readonly boundaries: BoundaryCluster[]
  ) {
    this.boundaryGroup.name = 'boundary-lines';
    this.labelsGroup.name = 'map-labels';
    this.selectionGroup.name = 'selected-boundary';
    this.scene.add(this.boundaryGroup, this.labelsGroup, this.selectionGroup);
    this.buildLines();
    this.buildLabels();
  }

  private buildLines(): void {
    const byType: Record<BoundaryType, number[]> = {
      divergent: [],
      convergent: [],
      transform: [],
      inactive: []
    };
    for (const cluster of this.boundaries) {
      for (const segment of cluster.segments) {
        const start = latLonToVector(segment.start.lat, segment.start.lon, LINE_RADIUS);
        const end = latLonToVector(segment.end.lat, segment.end.lon, LINE_RADIUS);
        byType[segment.type].push(start.x, start.y, start.z, end.x, end.y, end.z);
      }
    }
    for (const type of ['convergent', 'divergent', 'transform', 'inactive'] as BoundaryType[]) {
      const positions = byType[type];
      if (positions.length === 0) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      const material =
        type === 'transform' || type === 'inactive'
          ? new LineDashedMaterial({
              color: boundaryTypeColor(type),
              transparent: true,
              opacity: type === 'inactive' ? 0.55 : 0.92,
              dashSize: type === 'inactive' ? 0.018 : 0.035,
              gapSize: type === 'inactive' ? 0.02 : 0.018,
              depthWrite: false
            })
          : new LineBasicMaterial({
              color: boundaryTypeColor(type),
              transparent: true,
              opacity: 0.92,
              depthWrite: false
            });
      const line = new LineSegments(geometry, material);
      line.renderOrder = 3;
      if (type === 'transform' || type === 'inactive') line.computeLineDistances();
      this.boundaryGroup.add(line);
      this.lineObjects.push(line);
    }
  }

  private buildLabels(): void {
    for (const plate of PLATES) {
      const centroid = plateCentroid(plate.polygon);
      const sprite = createTextSprite(plate.nameKo, {
        fontSize: 22,
        background: 'rgba(4, 18, 24, 0.76)',
        border: `${plate.color}cc`,
        color: '#eaf6fa',
        scale: 0.00095,
        radius: 9
      });
      sprite.position.copy(latLonToVector(centroid.lat, centroid.lon, LABEL_RADIUS));
      this.labelsGroup.add(sprite);
      this.plateLabels.push(sprite);
    }

    const major = this.boundaries
      .filter((cluster) => cluster.lengthKm > 3500 && cluster.type !== 'inactive')
      .slice(0, 10);
    for (const cluster of major) {
      const sprite = createTextSprite(
        `${boundaryTypeShortKo(cluster.type)} · ${boundarySubtypeLabelKo(cluster.subtype)}`,
        {
          fontSize: 19,
          background: 'rgba(4, 18, 24, 0.7)',
          border: boundaryTypeColor(cluster.type),
          color: '#f4fbfd',
          scale: 0.0008,
          radius: 8
        }
      );
      const point = latLonToVector(
        cluster.representative.lat,
        cluster.representative.lon,
        LABEL_RADIUS
      );
      const normal = cluster.normal.clone().multiplyScalar(0.02);
      sprite.position.copy(point.add(normal));
      this.labelsGroup.add(sprite);
      this.boundaryLabels.push(sprite);
    }
  }

  setLayers(layers: { boundaries: boolean; labels: boolean }): void {
    this.boundaryGroup.visible = layers.boundaries;
    this.labelsGroup.visible = layers.labels;
    if (this.selectedLabel) this.selectedLabel.visible = layers.labels;
  }

  setSelected(cluster: BoundaryCluster | null): void {
    this.selected = cluster;
    this.clearSelectionObjects();
    if (!cluster) return;

    const points = cluster.points.map((point) =>
      latLonToVector(point.lat, point.lon, SELECTED_RADIUS)
    );
    if (points.length >= 2) {
      const curve = new CatmullRomCurve3(points, false, 'centripetal');
      const geometry = new TubeGeometry(
        curve,
        Math.min(600, Math.max(24, points.length * 2)),
        0.0045,
        5,
        false
      );
      const material = new MeshBasicMaterial({
        color: '#ffe2a8',
        transparent: true,
        opacity: 0.98,
        depthWrite: false
      });
      this.selectedTube = new Mesh(geometry, material);
      this.selectedTube.renderOrder = 6;
      this.selectionGroup.add(this.selectedTube);
    }

    const ringGeometry = new TorusGeometry(0.018, 0.0028, 6, 28);
    const ringMaterial = new MeshBasicMaterial({
      color: '#ffe2a8',
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    this.selectedRing = new Mesh(ringGeometry, ringMaterial);
    const ringPoint = latLonToVector(
      cluster.representative.lat,
      cluster.representative.lon,
      SELECTED_RADIUS
    );
    this.selectedRing.position.copy(ringPoint);
    this.selectedRing.quaternion.setFromUnitVectors(
      new Vector3(0, 0, 1),
      cluster.normal.clone().normalize()
    );
    this.selectedRing.renderOrder = 7;
    this.selectionGroup.add(this.selectedRing);

    this.selectedLabel = createTextSprite(
      `${boundaryTypeLabelKo(cluster.type)} · ${boundaryPlatesLabelKo(cluster)}`,
      {
        fontSize: 22,
        background: 'rgba(40, 29, 8, 0.9)',
        border: '#ffe2a8',
        color: '#fff4d6',
        scale: 0.00085,
        radius: 9
      }
    );
    this.selectedLabel.position.copy(
      latLonToVector(
        cluster.representative.lat,
        cluster.representative.lon,
        SELECTED_RADIUS + 0.045
      )
    );
    this.selectionGroup.add(this.selectedLabel);

    this.selectionGroup.visible = true;
  }

  private clearSelectionObjects(): void {
    if (this.selectedTube) {
      this.selectionGroup.remove(this.selectedTube);
      this.selectedTube.geometry.dispose();
      (this.selectedTube.material as MeshBasicMaterial).dispose();
      this.selectedTube = null;
    }
    if (this.selectedRing) {
      this.selectionGroup.remove(this.selectedRing);
      this.selectedRing.geometry.dispose();
      (this.selectedRing.material as MeshBasicMaterial).dispose();
      this.selectedRing = null;
    }
    if (this.selectedLabel) {
      this.selectionGroup.remove(this.selectedLabel);
      disposeTextSprite(this.selectedLabel);
      this.selectedLabel = null;
    }
  }

  getSelected(): BoundaryCluster | null {
    return this.selected;
  }

  getPlateLabelCount(): number {
    return this.plateLabels.length;
  }

  getBoundaryLabelCount(): number {
    return this.boundaryLabels.length;
  }

  dispose(): void {
    this.clearSelectionObjects();
    for (const line of this.lineObjects) {
      line.geometry.dispose();
      (line.material as LineBasicMaterial | LineDashedMaterial).dispose();
    }
    for (const sprite of [...this.plateLabels, ...this.boundaryLabels]) {
      disposeTextSprite(sprite);
    }
    this.scene.remove(this.boundaryGroup, this.labelsGroup, this.selectionGroup);
  }
}

function plateCentroid(polygon: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const sum = new Vector3();
  for (const point of polygon) sum.add(latLonToVector(point.lat, point.lon));
  if (sum.lengthSq() < 1e-12) return polygon[0] ?? { lat: 0, lon: 0 };
  sum.normalize();
  const lat = (Math.asin(Math.max(-1, Math.min(1, sum.y))) * 180) / Math.PI;
  const lon = (Math.atan2(sum.z, sum.x) * 180) / Math.PI;
  return { lat, lon };
}
