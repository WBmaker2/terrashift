import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Clock,
  DirectionalLight,
  Float32BufferAttribute,
  FrontSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import { MAX_TIME_MYR } from '../geo/constants';
import type { BoundaryCluster } from '../geo/boundaries';
import type { EventCatalog } from '../geo/events';
import type { TerrainModel } from '../geo/terrain';
import { vectorToLatLon } from '../geo/sphere';
import { CameraRig } from './CameraRig';
import { EventMarkers } from './EventMarkers';
import { PlateOverlay } from './PlateOverlay';
import { TerrainMesh } from './TerrainMesh';
import type { LayerState } from '../app/state';

export interface GlobePick {
  lat: number;
  lon: number;
}

export interface GlobeCallbacks {
  onPick?: (pick: GlobePick) => void;
  onDoubleClick?: (pick: GlobePick) => void;
}

export class Globe {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly rig: CameraRig;
  private readonly terrain: TerrainMesh;
  private readonly overlay: PlateOverlay;
  private readonly markers: EventMarkers;
  private readonly model: TerrainModel;
  private readonly clock = new Clock();
  private sun!: DirectionalLight;
  private headlight!: DirectionalLight;
  private readonly headlightTarget = new Object3D();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly resizeObserver: ResizeObserver;
  private active = true;
  private reducedMotion = false;
  private time = 0;
  private layers: LayerState = {
    boundaries: true,
    labels: true,
    earthquakes: true,
    volcanoes: true,
    crustAge: false,
    plateColors: true
  };
  private pointerDown: { x: number; y: number } | null = null;
  private readonly plateMarker: Mesh;
  private plateMarkerPoint: { lat: number; lon: number } | null = null;

  constructor(
    private readonly container: HTMLElement,
    model: TerrainModel,
    boundaries: BoundaryCluster[],
    catalog: EventCatalog,
    private readonly callbacks: GlobeCallbacks = {}
  ) {
    this.model = model;
    this.camera = new PerspectiveCamera(38, 1, 0.1, 120);
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = 'globe-canvas';
    this.renderer.domElement.setAttribute(
      'aria-label',
      '드래그로 회전하고 클릭으로 판 경계를 선택하는 3D 지구본'
    );
    this.renderer.domElement.setAttribute('role', 'img');
    this.container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(this.camera, this.renderer.domElement);
    this.terrain = new TerrainMesh(model);
    this.overlay = new PlateOverlay(this.scene, boundaries);
    this.markers = new EventMarkers(this.scene, catalog, model);

    this.plateMarker = new Mesh(
      new TorusGeometry(0.022, 0.0032, 6, 28),
      new MeshBasicMaterial({
        color: '#ffe2a8',
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      })
    );
    this.plateMarker.visible = false;
    this.plateMarker.renderOrder = 7;
    this.scene.add(this.plateMarker);

    this.scene.add(this.terrain.mesh);
    this.addAtmosphere();
    this.addLights();
    this.addStars();
    this.addPointerHandlers();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.active = true;
    this.renderer.setAnimationLoop(this.animate);
  }

  private addLights(): void {
    this.scene.add(new AmbientLight(0x93b9c9, 0.5));
    this.scene.add(new HemisphereLight(0x9fd4ea, 0x1a3038, 0.55));
    this.sun = new DirectionalLight(0xfff0d8, 2.1);
    this.sun.position.set(5, 2.8, 4.2);
    this.scene.add(this.sun);
    const rim = new DirectionalLight(0x4d8bcf, 0.6);
    rim.position.set(-5, -1.5, -4);
    this.scene.add(rim);
    const fill = new DirectionalLight(0x86bdd0, 0.5);
    fill.position.set(-2, -4, 3);
    this.scene.add(fill);
    this.headlight = new DirectionalLight(0x9fd4ea, 0.25);
    this.headlight.target = this.headlightTarget;
    this.headlightTarget.position.set(0, 0, 0);
    this.scene.add(this.headlightTarget, this.headlight);
  }

  private addAtmosphere(): void {
    const material = new ShaderMaterial({
      transparent: true,
      blending: AdditiveBlending,
      side: FrontSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.58 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
          gl_FragColor = vec4(0.28, 0.68, 0.92, 1.0) * intensity;
        }
      `
    });
    const atmosphere = new Mesh(new SphereGeometry(1.18, 64, 48), material);
    atmosphere.name = 'atmosphere';
    atmosphere.renderOrder = -1;
    this.scene.add(atmosphere);
  }

  private addStars(): void {
    let seed = 481516;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const positions: number[] = [];
    for (let index = 0; index < 520; index += 1) {
      const theta = random() * Math.PI * 2;
      const cosPhi = random() * 2 - 1;
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const radius = 18 + random() * 28;
      positions.push(
        Math.cos(theta) * sinPhi * radius,
        cosPhi * radius,
        Math.sin(theta) * sinPhi * radius
      );
    }
    const pointGeometry = new BufferGeometry();
    pointGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: 0xbedff5,
      size: 0.065,
      transparent: true,
      opacity: 0.58,
      sizeAttenuation: true,
      depthWrite: false
    });
    const stars = new Points(pointGeometry, material);
    stars.name = 'stars';
    stars.frustumCulled = false;
    this.scene.add(stars);
  }

  private addPointerHandlers(): void {
    const element = this.renderer.domElement;
    element.addEventListener('pointerdown', (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    element.addEventListener('pointerup', (event) => {
      if (!this.pointerDown) return;
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      this.pointerDown = null;
      if (Math.hypot(dx, dy) > 6) return;
      const pick = this.pick(event.clientX, event.clientY);
      if (pick) this.callbacks.onPick?.(pick);
    });
    element.addEventListener('dblclick', (event) => {
      const pick = this.pick(event.clientX, event.clientY);
      if (pick) this.callbacks.onDoubleClick?.(pick);
    });
  }

  private pick(clientX: number, clientY: number): GlobePick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.terrain.mesh, false);
    if (hits.length === 0) return null;
    const point = hits[0].point;
    const latLon = vectorToLatLon(point);
    return { lat: latLon.lat, lon: latLon.lon };
  }

  private readonly animate = (): void => {
    if (!this.active || document.hidden) return;
    const delta = Math.min(0.06, this.clock.getDelta());
    this.rig.update(delta);
    this.headlight.position.copy(this.camera.position);
    const lightDirection = this.camera.position.clone().normalize();
    lightDirection.applyAxisAngle(new Vector3(0, 1, 0), -0.35);
    lightDirection.y += 0.45;
    lightDirection.normalize();
    this.sun.position.copy(lightDirection.multiplyScalar(9));
    this.markers.update(this.time);
    this.renderer.render(this.scene, this.camera);
  };

  setTime(myr: number): void {
    this.time = Math.max(0, Math.min(MAX_TIME_MYR, myr));
    this.terrain.update(this.time, {
      crustAge: this.layers.crustAge,
      plateColors: this.layers.plateColors
    });
    this.markers.update(this.time);
    this.updatePlateMarkerPosition();
  }

  setLayers(layers: LayerState): void {
    this.layers = layers;
    this.overlay.setLayers(layers);
    this.markers.setLayers(layers);
    this.terrain.setLayers({ crustAge: layers.crustAge, plateColors: layers.plateColors });
    this.terrain.update(this.time, {
      crustAge: layers.crustAge,
      plateColors: layers.plateColors
    });
  }

  setSelection(cluster: BoundaryCluster | null): void {
    this.overlay.setSelected(cluster);
    this.overlay.setLayers(this.layers);
    if (cluster) this.setPlateMarker(null, null);
  }

  setPlateMarker(lat: number | null, lon: number | null, color = '#ffe2a8'): void {
    if (lat === null || lon === null) {
      this.plateMarker.visible = false;
      this.plateMarkerPoint = null;
      return;
    }
    this.plateMarkerPoint = { lat, lon };
    (this.plateMarker.material as MeshBasicMaterial).color.set(color);
    this.plateMarker.visible = true;
    this.updatePlateMarkerPosition(true);
  }

  private updatePlateMarkerPosition(force = false): void {
    if (!this.plateMarker.visible || !this.plateMarkerPoint) return;
    void force;
    const point = this.model.surfacePoint(
      this.plateMarkerPoint.lat,
      this.plateMarkerPoint.lon,
      this.time,
      0.024
    );
    this.plateMarker.position.copy(point);
    const direction = new Vector3(point.x, point.y, point.z).normalize();
    this.plateMarker.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction);
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    this.rig.setReducedMotion(reducedMotion);
    this.markers.setReducedMotion(reducedMotion);
    if (reducedMotion) this.rig.setAutoRotate(false);
  }

  setAutoRotate(enabled: boolean): void {
    this.rig.setAutoRotate(enabled);
  }

  focus(lat: number, lon: number, distance = 2.45, instant = false): void {
    this.rig.focus(lat, lon, distance, instant || this.reducedMotion);
  }

  resetView(instant = false): void {
    this.rig.resetView(instant || this.reducedMotion);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      this.clock.getDelta();
      this.renderer.setAnimationLoop(this.animate);
    } else {
      this.renderer.setAnimationLoop(null);
    }
  }

  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
  }

  getSurfacePoint(lat: number, lon: number, offset = 0.01): import('three').Vector3 {
    return this.model.surfacePoint(lat, lon, this.time, offset);
  }

  getCameraDistance(): number {
    return this.camera.position.length();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.overlay.dispose();
    this.markers.dispose();
    this.plateMarker.geometry.dispose();
    (this.plateMarker.material as MeshBasicMaterial).dispose();
    this.terrain.mesh.geometry.dispose();
    (this.terrain.mesh.material as import('three').MeshStandardMaterial).dispose();
    this.container.removeChild(this.renderer.domElement);
    this.renderer.dispose();
  }
}
