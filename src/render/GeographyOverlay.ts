import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from 'three';
import { latLonToVector } from '../geo/sphere';
import coastline from '../data/coastline-110m.json';
import borders from '../data/borders-110m.json';

export class GeographyOverlay {
  private readonly group = new Group();
  private readonly coastlineMesh: LineSegments;
  private readonly borderMesh: LineSegments;

  constructor(private readonly scene: import('three').Scene) {
    this.group.name = 'geography-overlay';
    this.scene.add(this.group);

    this.coastlineMesh = this.buildMesh(coastline as any, 0xb7c7cf, 0.32);
    this.borderMesh = this.buildMesh(borders as any, 0xc9d6dc, 0.26);
    this.coastlineMesh.visible = false;
    this.borderMesh.visible = false;
    this.group.add(this.coastlineMesh);
    this.group.add(this.borderMesh);
  }

  private buildMesh(data: any, color: number, opacity: number): LineSegments {
    const positions: number[] = [];
    const features = data.features || [];
    for (const feature of features) {
      const geom = feature.geometry;
      if (!geom) continue;
      if (geom.type === 'LineString') {
        const coords = geom.coordinates as number[][];
        for (let i = 0; i < coords.length - 1; i += 1) {
          const a = latLonToVector(coords[i][1], coords[i][0]);
          const b = latLonToVector(coords[i + 1][1], coords[i + 1][0]);
          const r = 1.0016;
          positions.push(a.x * r, a.y * r, a.z * r);
          positions.push(b.x * r, b.y * r, b.z * r);
        }
      } else if (geom.type === 'MultiLineString') {
        for (const line of geom.coordinates as number[][][]) {
          for (let i = 0; i < line.length - 1; i += 1) {
            const a = latLonToVector(line[i][1], line[i][0]);
            const b = latLonToVector(line[i + 1][1], line[i + 1][0]);
            const r = 1.0016;
            positions.push(a.x * r, a.y * r, a.z * r);
            positions.push(b.x * r, b.y * r, b.z * r);
          }
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const mesh = new LineSegments(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  }

  setVisible(coastline: boolean, borders: boolean): void {
    this.coastlineMesh.visible = coastline;
    this.borderMesh.visible = borders;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.coastlineMesh.geometry.dispose();
    (this.coastlineMesh.material as LineBasicMaterial).dispose();
    this.borderMesh.geometry.dispose();
    (this.borderMesh.material as LineBasicMaterial).dispose();
  }
}
