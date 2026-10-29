import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  MeshStandardMaterial
} from 'three';
import {
  EARTH_RADIUS_KM,
  TERRAIN_COLS,
  TERRAIN_ROWS,
  VISUAL_HEIGHT_EXAGGERATION
} from '../geo/constants';
import type { TerrainLayerState, TerrainModel } from '../geo/terrain';

export class TerrainMesh {
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly colors: Float32Array;
  private readonly currentHeights: Float32Array;
  private readonly positionAttribute: BufferAttribute;
  private readonly normalAttribute: BufferAttribute;
  private readonly colorAttribute: BufferAttribute;
  private layers: TerrainLayerState = { crustAge: false, plateColors: true };

  constructor(private readonly model: TerrainModel) {
    const vertexCount = model.vertexCount;
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);
    this.currentHeights = new Float32Array(vertexCount);
    const geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(this.positions, 3);
    this.normalAttribute = new BufferAttribute(this.normals, 3);
    this.colorAttribute = new BufferAttribute(this.colors, 3);
    this.positionAttribute.setUsage(DynamicDrawUsage);
    this.normalAttribute.setUsage(DynamicDrawUsage);
    this.colorAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('normal', this.normalAttribute);
    geometry.setAttribute('color', this.colorAttribute);
    geometry.setIndex(buildIndices());
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.02
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'terrain';
    this.update(0, this.layers);
  }

  setLayers(layers: TerrainLayerState): void {
    this.layers = layers;
  }

  update(myr: number, layers: TerrainLayerState = this.layers): void {
    this.layers = layers;
    const { a, b, mix, heightsA, heightsB } = this.model.frameAt(myr);
    const normalsA = this.model.normalsFor(a);
    const normalsB = this.model.normalsFor(b);
    const directions = this.model.directions;
    const heights = this.currentHeights;
    for (let index = 0; index < this.model.vertexCount; index += 1) {
      const h = heightsA[index] + (heightsB[index] - heightsA[index]) * mix;
      heights[index] = h;
      const radius = 1 + (h * VISUAL_HEIGHT_EXAGGERATION) / EARTH_RADIUS_KM;
      const base = index * 3;
      this.positions[base] = directions[base] * radius;
      this.positions[base + 1] = directions[base + 1] * radius;
      this.positions[base + 2] = directions[base + 2] * radius;
      let nx = normalsA[base] + (normalsB[base] - normalsA[base]) * mix;
      let ny = normalsA[base + 1] + (normalsB[base + 1] - normalsA[base + 1]) * mix;
      let nz = normalsA[base + 2] + (normalsB[base + 2] - normalsA[base + 2]) * mix;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      this.normals[base] = nx;
      this.normals[base + 1] = ny;
      this.normals[base + 2] = nz;
    }
    this.model.computeColors(heights, layers, this.colors);
    this.positionAttribute.needsUpdate = true;
    this.normalAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  heightAt(lat: number, lon: number, myr: number): number {
    return this.model.heightAt(lat, lon, myr);
  }
}

function buildIndices(): number[] {
  const indices: number[] = [];
  const cols = TERRAIN_COLS;
  for (let row = 0; row < TERRAIN_ROWS - 1; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const nextCol = (col + 1) % cols;
      const a = row * cols + col;
      const b = row * cols + nextCol;
      const c = (row + 1) * cols + col;
      const d = (row + 1) * cols + nextCol;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }
  return indices;
}
