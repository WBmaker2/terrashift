import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3
} from 'three';
import {
  depthColor,
  earthquakesInWindow,
  eruptionIntensity,
  magnitudeRadius,
  visibleVolcanoes,
  type EventCatalog,
  type Volcano
} from '../geo/events';
import type { TerrainModel } from '../geo/terrain';
import { latLonToVector } from '../geo/sphere';

export interface MarkerLayerState {
  earthquakes: boolean;
  volcanoes: boolean;
}

const UP = new Vector3(0, 1, 0);

export class EventMarkers {
  private readonly earthquakeMesh: InstancedMesh;
  private readonly volcanoMesh: InstancedMesh;
  private readonly volcanoGlow: Points;
  private readonly glowPositions: Float32Array;
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly scaleVector = new Vector3();
  private readonly color = new Color();
  private readonly visibleVolcanoes: Volcano[];
  private layers: MarkerLayerState = { earthquakes: true, volcanoes: true };
  private reducedMotion = false;
  private lastQuakeTime = -100;
  private lastQuakeKey = '';

  constructor(
    private readonly scene: import('three').Scene,
    private readonly catalog: EventCatalog,
    private readonly model: TerrainModel
  ) {
    this.visibleVolcanoes = visibleVolcanoes(catalog);

    this.earthquakeMesh = new InstancedMesh(
      new IcosahedronGeometry(0.006, 0),
      new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      300
    );
    this.earthquakeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.earthquakeMesh.count = 0;
    this.earthquakeMesh.frustumCulled = false;
    this.earthquakeMesh.name = 'earthquakes';
    this.scene.add(this.earthquakeMesh);

    this.volcanoMesh = new InstancedMesh(
      new ConeGeometry(0.011, 0.03, 6, 1),
      new MeshStandardMaterial({
        color: 0xff8a3d,
        emissive: 0xff3d12,
        emissiveIntensity: 1.1,
        roughness: 0.55,
        metalness: 0
      }),
      this.visibleVolcanoes.length
    );
    this.volcanoMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.volcanoMesh.frustumCulled = false;
    this.volcanoMesh.name = 'volcanoes';
    this.scene.add(this.volcanoMesh);

    this.glowPositions = new Float32Array(this.visibleVolcanoes.length * 3);
    const glowGeometry = new BufferGeometry();
    const glowAttribute = new Float32BufferAttribute(this.glowPositions, 3);
    glowAttribute.setUsage(DynamicDrawUsage);
    glowGeometry.setAttribute('position', glowAttribute);
    this.volcanoGlow = new Points(
      glowGeometry,
      new PointsMaterial({
        color: 0xff7a33,
        size: 0.038,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
      })
    );
    this.volcanoGlow.frustumCulled = false;
    this.volcanoGlow.name = 'volcano-glow';
    this.scene.add(this.volcanoGlow);

    this.updateVolcanoPositions(0);
  }

  setLayers(layers: MarkerLayerState): void {
    this.layers = layers;
    this.earthquakeMesh.visible = layers.earthquakes;
    this.volcanoMesh.visible = layers.volcanoes;
    this.volcanoGlow.visible = layers.volcanoes;
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  update(myr: number): void {
    const bucket = Math.round(myr * 4);
    const key = `${bucket}|${this.layers.earthquakes}`;
    if (key !== this.lastQuakeKey) {
      this.lastQuakeKey = key;
      this.updateEarthquakes(myr);
    }
    this.updateVolcanoPulse(myr);
  }

  private updateEarthquakes(myr: number): void {
    if (!this.layers.earthquakes) {
      this.earthquakeMesh.count = 0;
      return;
    }
    const events = earthquakesInWindow(this.catalog, myr);
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const position = this.model.surfacePoint(event.lat, event.lon, myr, 0.018);
      const size = 0.55 + magnitudeRadius(event.magnitude) * 0.9;
      this.scaleVector.setScalar(size);
      this.matrix.compose(position, new Quaternion(), this.scaleVector);
      this.earthquakeMesh.setMatrixAt(index, this.matrix);
      this.color.set(depthColor(event.depthKm));
      this.earthquakeMesh.setColorAt(index, this.color);
    }
    this.earthquakeMesh.count = events.length;
    this.earthquakeMesh.instanceMatrix.needsUpdate = true;
    if (this.earthquakeMesh.instanceColor) this.earthquakeMesh.instanceColor.needsUpdate = true;
    this.lastQuakeTime = myr;
  }

  private updateVolcanoPulse(myr: number): void {
    if (!this.layers.volcanoes) return;
    for (let index = 0; index < this.visibleVolcanoes.length; index += 1) {
      const volcano = this.visibleVolcanoes[index];
      const intensity = this.reducedMotion ? 0 : eruptionIntensity(volcano, myr);
      const scale = 1 + intensity * 0.3;
      const direction = latLonToVector(volcano.lat, volcano.lon);
      const position = this.model.surfacePoint(volcano.lat, volcano.lon, myr, 0.014);
      this.quaternion.setFromUnitVectors(UP, direction);
      this.scaleVector.setScalar(scale);
      this.matrix.compose(position, this.quaternion, this.scaleVector);
      this.volcanoMesh.setMatrixAt(index, this.matrix);
      const glow = position.clone().addScaledVector(direction, 0.02 + intensity * 0.02);
      this.glowPositions[index * 3] = glow.x;
      this.glowPositions[index * 3 + 1] = glow.y;
      this.glowPositions[index * 3 + 2] = glow.z;
    }
    this.volcanoMesh.instanceMatrix.needsUpdate = true;
    const glowAttribute = this.volcanoGlow.geometry.getAttribute('position');
    glowAttribute.needsUpdate = true;
  }

  private updateVolcanoPositions(myr: number): void {
    for (let index = 0; index < this.visibleVolcanoes.length; index += 1) {
      const volcano = this.visibleVolcanoes[index];
      const direction = latLonToVector(volcano.lat, volcano.lon);
      const position = this.model.surfacePoint(volcano.lat, volcano.lon, myr, 0.014);
      this.quaternion.setFromUnitVectors(UP, direction);
      this.scaleVector.setScalar(1);
      this.matrix.compose(position, this.quaternion, this.scaleVector);
      this.volcanoMesh.setMatrixAt(index, this.matrix);
      const glow = position.clone().addScaledVector(direction, 0.02);
      this.glowPositions[index * 3] = glow.x;
      this.glowPositions[index * 3 + 1] = glow.y;
      this.glowPositions[index * 3 + 2] = glow.z;
    }
    this.volcanoMesh.instanceMatrix.needsUpdate = true;
    this.volcanoGlow.geometry.getAttribute('position').needsUpdate = true;
    this.lastQuakeTime = myr;
  }

  getVisibleEarthquakeCount(): number {
    return this.earthquakeMesh.count;
  }

  getVisibleVolcanoCount(): number {
    return this.visibleVolcanoes.length;
  }

  getLastQuakeTime(): number {
    return this.lastQuakeTime;
  }

  dispose(): void {
    this.scene.remove(this.earthquakeMesh, this.volcanoMesh, this.volcanoGlow);
    this.earthquakeMesh.geometry.dispose();
    (this.earthquakeMesh.material as MeshBasicMaterial).dispose();
    this.volcanoMesh.geometry.dispose();
    (this.volcanoMesh.material as MeshStandardMaterial).dispose();
    this.volcanoGlow.geometry.dispose();
    (this.volcanoGlow.material as PointsMaterial).dispose();
  }
}
