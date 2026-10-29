import { Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, latLonToVector } from '../geo/sphere';

interface FocusState {
  startDirection: Vector3;
  startDistance: number;
  targetDirection: Vector3;
  targetDistance: number;
  elapsed: number;
  duration: number;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CameraRig {
  readonly controls: OrbitControls;
  private focusState: FocusState | null = null;
  private reducedMotion = false;
  private readonly defaultDirection = new Vector3(0.7, 0.45, 1).normalize();
  private readonly defaultDistance = 3.25;
  private readonly onPointerDown = () => {
    this.focusState = null;
  };

  constructor(
    private readonly camera: import('three').PerspectiveCamera,
    private readonly element: HTMLElement
  ) {
    this.controls = new OrbitControls(camera, element);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.75;
    this.controls.minDistance = 1.48;
    this.controls.maxDistance = 5.5;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.autoRotate = false;
    this.controls.target.set(0, 0, 0);
    camera.position.copy(this.defaultDirection).multiplyScalar(this.defaultDistance);
    camera.lookAt(0, 0, 0);
    this.controls.update();
    element.addEventListener('pointerdown', this.onPointerDown, { passive: true });
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) this.controls.autoRotate = false;
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled && !this.reducedMotion;
  }

  focus(lat: number, lon: number, distance = 2.45, instant = false): void {
    const targetDirection = latLonToVector(lat, lon).normalize();
    const targetDistance = clamp(distance, 1.55, 5.2);
    if (instant || this.reducedMotion) {
      this.focusState = null;
      this.camera.position.copy(targetDirection).multiplyScalar(targetDistance);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      return;
    }
    this.focusState = {
      startDirection: this.camera.position.clone().normalize(),
      startDistance: this.camera.position.length(),
      targetDirection,
      targetDistance,
      elapsed: 0,
      duration: 0.8
    };
  }

  resetView(instant = false): void {
    const target = this.defaultDirection.clone().multiplyScalar(this.defaultDistance);
    if (instant || this.reducedMotion) {
      this.camera.position.copy(target);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      return;
    }
    this.focusState = {
      startDirection: this.camera.position.clone().normalize(),
      startDistance: this.camera.position.length(),
      targetDirection: this.defaultDirection.clone(),
      targetDistance: this.defaultDistance,
      elapsed: 0,
      duration: 0.8
    };
  }

  update(deltaSeconds: number): void {
    this.controls.update();
    if (!this.focusState) return;
    this.focusState.elapsed += deltaSeconds;
    const t = clamp(this.focusState.elapsed / this.focusState.duration, 0, 1);
    const eased = easeInOutCubic(t);
    const direction = this.focusState.startDirection
      .clone()
      .lerp(this.focusState.targetDirection, eased);
    if (direction.lengthSq() < 1e-8) {
      direction.copy(this.focusState.targetDirection);
    }
    direction.normalize();
    const distance =
      this.focusState.startDistance +
      (this.focusState.targetDistance - this.focusState.startDistance) * eased;
    this.camera.position.copy(direction).multiplyScalar(distance);
    this.camera.lookAt(0, 0, 0);
    if (t >= 1) this.focusState = null;
  }

  get isFocused(): boolean {
    return this.focusState !== null;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.controls.dispose();
  }
}
