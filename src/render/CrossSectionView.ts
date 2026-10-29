import type { CrossSectionModel } from '../geo/crossSection';

export interface CrossSectionRenderOptions {
  compact?: boolean;
  reducedMotion?: boolean;
}

const DEPTH_COLORS = ['#ff7043', '#ffc857', '#9a86ff'];

export class CrossSectionView {
  private model: CrossSectionModel | null = null;
  private options: CrossSectionRenderOptions = {};
  private readonly resizeObserver: ResizeObserver;
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available');
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
  }

  setModel(model: CrossSectionModel | null, options: CrossSectionRenderOptions = {}): void {
    this.model = model;
    this.options = options;
    this.draw();
  }

  draw(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (
      this.canvas.width !== Math.round(width * dpr) ||
      this.canvas.height !== Math.round(height * dpr)
    ) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    const ctx = this.context;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, width, height);
    if (!this.model) {
      ctx.fillStyle = 'rgba(220, 240, 247, 0.72)';
      ctx.font = '600 15px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('경계를 선택하면 개념 단면도가 나타납니다.', width / 2, height / 2);
      return;
    }
    this.drawSchematic(ctx, width, height, this.model);
    this.drawHeader(ctx, width, this.model);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#071b23');
    gradient.addColorStop(0.48, '#0a2732');
    gradient.addColorStop(0.5, '#14231f');
    gradient.addColorStop(1, '#120b0a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(127, 196, 214, 0.08)';
    ctx.lineWidth = 1;
    for (let y = 12; y < height; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  private drawHeader(ctx: CanvasRenderingContext2D, width: number, model: CrossSectionModel): void {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(217, 242, 248, 0.78)';
    ctx.font = `700 ${this.options.compact ? 9 : 11}px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    ctx.fillText('개념 단면도 · 실제 지질 단면이 아님', 12, 17);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 226, 168, 0.86)';
    ctx.fillText(model.timeLabelKo, width - 12, 17);
    ctx.restore();
  }

  private drawSchematic(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: CrossSectionModel
  ): void {
    const compact = this.options.compact ?? false;
    const kind = model.kind;
    if (kind === 'inactive' || kind === 'transform') {
      if (kind === 'transform') this.drawTransform(ctx, width, height, model, compact);
      else this.drawInactive(ctx, width, height, model, compact);
      return;
    }
    if (kind === 'ridge') {
      this.drawRidge(ctx, width, height, compact);
      return;
    }
    if (kind === 'rift') {
      this.drawRift(ctx, width, height, model, compact);
      return;
    }
    if (kind === 'continental-continental') {
      this.drawCollision(ctx, width, height, model, compact);
      return;
    }
    this.drawSubduction(ctx, width, height, model, compact);
  }

  private drawSubduction(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: CrossSectionModel,
    compact: boolean
  ): void {
    const pad = compact ? 12 : 28;
    const left = pad;
    const right = width - pad;
    const seaLevel = height * 0.36;
    const moho = height * 0.62;
    const bottom = height - (compact ? 8 : 22);
    const center = width * 0.5;
    const bothOcean = model.oceanSide === 'both';
    const oceanLeft = model.oceanSide === 'left' || bothOcean;
    const oceanRight = model.oceanSide === 'right' || bothOcean;
    const overridingRight = model.oceanSide === 'right' ? false : true;
    const arcX = overridingRight ? center + width * 0.2 : center - width * 0.2;
    const arcY = seaLevel - clampPx(model.features.arcHeightKm * 4.5, 5, compact ? 24 : 46);
    const trenchDepth = clampPx(model.features.trenchDepthKm * 3.2, 10, compact ? 26 : 54);
    const mountainHeight = bothOcean
      ? 0
      : clampPx(model.features.mountainHeightKm * 7.2, 8, compact ? 38 : 72);
    const seafloor = seaLevel + trenchDepth * 0.55;
    const slabEndX = overridingRight ? center + width * 0.14 : center - width * 0.14;

    this.drawMantle(ctx, left, right, moho, bottom);
    if (bothOcean) {
      this.drawWater(ctx, left, center, seaLevel, seafloor, compact);
      this.drawWater(ctx, center, right, seaLevel, seafloor, compact);
    } else if (oceanLeft) {
      this.drawWater(ctx, left, center, seaLevel, seafloor, compact);
    } else if (oceanRight) {
      this.drawWater(ctx, center, right, seaLevel, seafloor, compact);
    }

    ctx.save();
    ctx.beginPath();
    if (bothOcean) {
      ctx.moveTo(left, seafloor);
      ctx.lineTo(center - width * 0.04, seafloor);
      ctx.lineTo(center - width * 0.012, seafloor + trenchDepth * 0.25);
      ctx.lineTo(center, seafloor + trenchDepth * 0.65);
      ctx.lineTo(center + width * 0.012, seafloor + trenchDepth * 0.25);
      ctx.lineTo(center + width * 0.04, seafloor);
      const arcWidth = width * 0.075;
      ctx.lineTo(arcX - arcWidth, seafloor);
      ctx.quadraticCurveTo(arcX - arcWidth * 0.32, arcY, arcX, arcY);
      ctx.quadraticCurveTo(arcX + arcWidth * 0.32, arcY, arcX + arcWidth, seafloor);
      ctx.lineTo(right, seafloor);
    } else if (oceanLeft) {
      ctx.moveTo(left, seafloor);
      ctx.lineTo(center - width * 0.04, seafloor);
      ctx.lineTo(center - width * 0.012, seafloor + trenchDepth * 0.25);
      ctx.lineTo(center, seafloor + trenchDepth * 0.65);
      ctx.lineTo(center + width * 0.02, seafloor);
      ctx.lineTo(center + width * 0.1, seaLevel - mountainHeight * 0.12);
      ctx.lineTo(center + width * 0.22, seaLevel - mountainHeight);
      ctx.lineTo(center + width * 0.32, seaLevel - mountainHeight * 0.22);
      ctx.lineTo(right, seaLevel + 3);
    } else {
      ctx.moveTo(right, seafloor);
      ctx.lineTo(center + width * 0.04, seafloor);
      ctx.lineTo(center + width * 0.012, seafloor + trenchDepth * 0.25);
      ctx.lineTo(center, seafloor + trenchDepth * 0.65);
      ctx.lineTo(center - width * 0.02, seafloor);
      ctx.lineTo(center - width * 0.1, seaLevel - mountainHeight * 0.12);
      ctx.lineTo(center - width * 0.22, seaLevel - mountainHeight);
      ctx.lineTo(center - width * 0.32, seaLevel - mountainHeight * 0.22);
      ctx.lineTo(left, seaLevel + 3);
    }
    ctx.lineTo(right, moho);
    ctx.lineTo(left, moho);
    ctx.closePath();
    const crustGradient = ctx.createLinearGradient(0, seaLevel - mountainHeight, 0, moho);
    crustGradient.addColorStop(0, '#75604a');
    crustGradient.addColorStop(0.6, '#4b3b2e');
    crustGradient.addColorStop(1, '#2d2722');
    ctx.fillStyle = crustGradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 236, 208, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    this.drawSlab(ctx, center, seafloor, slabEndX, bottom, model.features.slabDepthKm, compact);
    this.drawConvergenceArrows(ctx, oceanLeft, left, right, center, seaLevel, compact);
    this.drawVolcano(ctx, arcX, arcY, seaLevel, compact);
    this.drawMagmaPath(ctx, center, seafloor, arcX, arcY + (compact ? 3 : 6), compact);
    this.drawEarthquakeDots(ctx, center, seafloor, slabEndX, bottom, compact);

    const fs = compact ? 9 : 11;
    const oceanColor = 'rgba(170, 232, 245, 0.9)';
    const landColor = 'rgba(255, 225, 189, 0.9)';
    this.label(
      ctx,
      left + 8,
      seaLevel + (compact ? 16 : 30),
      model.leftPlateKo,
      'left',
      fs,
      oceanLeft && !model.leftTypeKo.includes('대륙') ? oceanColor : landColor
    );
    this.label(
      ctx,
      right - 8,
      seaLevel + (compact ? 16 : 30),
      model.rightPlateKo,
      'right',
      fs,
      oceanRight && !model.rightTypeKo.includes('대륙') ? oceanColor : landColor
    );
    this.label(
      ctx,
      center + (oceanLeft ? 22 : -22),
      seafloor + (compact ? 18 : 32),
      '해구',
      oceanLeft ? 'left' : 'right',
      fs,
      '#f6c28b'
    );
    this.label(
      ctx,
      arcX,
      arcY - (compact ? 12 : 18),
      model.kind === 'oceanic-oceanic' ? '섬호 · 화산' : '화산호',
      'center',
      fs,
      '#ffb184'
    );
    if (!compact) {
      this.label(
        ctx,
        center + (oceanLeft ? -40 : 40),
        (seafloor + bottom) / 2,
        '섭입하는 해양판',
        oceanLeft ? 'right' : 'left',
        fs,
        'rgba(190, 210, 225, 0.88)'
      );
      this.label(ctx, width / 2, bottom - 10, '맨틀', 'center', fs, 'rgba(207, 180, 164, 0.72)');
      if (!bothOcean) {
        this.label(
          ctx,
          overridingRight ? right - width * 0.14 : left + width * 0.14,
          seaLevel - mountainHeight * 0.55,
          '산맥',
          'center',
          fs,
          'rgba(255, 225, 189, 0.8)'
        );
      }
    }
    if (model.leftTypeKo || model.rightTypeKo) {
      this.label(
        ctx,
        left + 8,
        height - 12,
        `${model.leftTypeKo} · ${model.rightTypeKo}`,
        'left',
        compact ? 8 : 10,
        'rgba(180, 208, 216, 0.62)'
      );
    }
  }

  private drawCollision(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: CrossSectionModel,
    compact: boolean
  ): void {
    const pad = compact ? 12 : 28;
    const left = pad;
    const right = width - pad;
    const seaLevel = height * 0.38;
    const moho = height * 0.64;
    const bottom = height - (compact ? 8 : 22);
    const center = width / 2;
    const mountain = clampPx(model.features.mountainHeightKm * 8.5, 10, compact ? 42 : 78);
    this.drawMantle(ctx, left, right, moho, bottom);

    ctx.beginPath();
    ctx.moveTo(left, seaLevel - 4);
    ctx.bezierCurveTo(
      center - width * 0.3,
      seaLevel - mountain * 0.3,
      center - width * 0.18,
      seaLevel - mountain,
      center,
      seaLevel - mountain * 0.82
    );
    ctx.bezierCurveTo(
      center + width * 0.18,
      seaLevel - mountain,
      center + width * 0.3,
      seaLevel - mountain * 0.3,
      right,
      seaLevel - 4
    );
    ctx.lineTo(right, moho);
    ctx.lineTo(left, moho);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, seaLevel - mountain, 0, moho);
    gradient.addColorStop(0, '#8b7051');
    gradient.addColorStop(0.55, '#5e4836');
    gradient.addColorStop(1, '#332821');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 236, 208, 0.42)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = 'rgba(222, 188, 144, 0.35)';
    ctx.lineWidth = 1.2;
    for (let index = 0; index < 4; index += 1) {
      const y = seaLevel + 20 + index * (compact ? 12 : 20);
      ctx.beginPath();
      ctx.moveTo(center - width * 0.25, y);
      ctx.quadraticCurveTo(center, y + 7, center + width * 0.25, y);
      ctx.stroke();
    }
    ctx.restore();

    this.drawCollisionArrows(ctx, left, right, seaLevel - mountain * 0.7, compact);
    this.drawEarthquakeDots(
      ctx,
      center - 30,
      seaLevel + 14,
      center + 30,
      seaLevel + (compact ? 34 : 58),
      compact
    );
    this.label(
      ctx,
      center,
      seaLevel - mountain * 0.9,
      '습곡 산맥 · 고원',
      'center',
      compact ? 9 : 12,
      '#ffe2b6'
    );
    this.label(
      ctx,
      left + 8,
      seaLevel + 18,
      model.leftPlateKo,
      'left',
      compact ? 9 : 11,
      'rgba(255, 225, 189, 0.88)'
    );
    this.label(
      ctx,
      right - 8,
      seaLevel + 18,
      model.rightPlateKo,
      'right',
      compact ? 9 : 11,
      'rgba(255, 225, 189, 0.88)'
    );
    if (!compact) {
      this.label(
        ctx,
        center,
        bottom - 12,
        `두꺼워진 지각 · 약 ${Math.round(model.features.crustThicknessKm)} km`,
        'center',
        10,
        'rgba(235, 205, 170, 0.76)'
      );
      this.label(
        ctx,
        center + width * 0.34,
        seaLevel + 40,
        '맨틀',
        'center',
        10,
        'rgba(207, 180, 164, 0.6)'
      );
    }
  }

  private drawRidge(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    compact: boolean
  ): void {
    const pad = compact ? 12 : 28;
    const left = pad;
    const right = width - pad;
    const seaLevel = height * 0.37;
    const moho = height * 0.66;
    const bottom = height - (compact ? 8 : 22);
    const center = width / 2;
    const ridgeHeight = compact ? 12 : 22;
    this.drawMantle(ctx, left, right, moho, bottom);
    this.drawWater(ctx, left, right, seaLevel, seaLevel + (compact ? 30 : 52), compact);

    ctx.beginPath();
    ctx.moveTo(left, seaLevel + (compact ? 28 : 44));
    ctx.quadraticCurveTo(
      center - width * 0.24,
      seaLevel + (compact ? 20 : 34),
      center - width * 0.14,
      seaLevel - ridgeHeight * 0.35
    );
    ctx.quadraticCurveTo(
      center - width * 0.05,
      seaLevel - ridgeHeight,
      center,
      seaLevel - ridgeHeight * 0.45
    );
    ctx.quadraticCurveTo(
      center + width * 0.05,
      seaLevel - ridgeHeight,
      center + width * 0.14,
      seaLevel - ridgeHeight * 0.35
    );
    ctx.quadraticCurveTo(
      center + width * 0.24,
      seaLevel + (compact ? 20 : 34),
      right,
      seaLevel + (compact ? 28 : 44)
    );
    ctx.lineTo(right, moho);
    ctx.lineTo(left, moho);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, seaLevel - ridgeHeight, 0, moho);
    gradient.addColorStop(0, '#5d4a3b');
    gradient.addColorStop(0.5, '#3c3129');
    gradient.addColorStop(1, '#221b18');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 222, 170, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 123, 69, 0.8)';
    ctx.lineWidth = compact ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(center, seaLevel - ridgeHeight * 0.4);
    ctx.lineTo(center, seaLevel + (compact ? 20 : 32));
    ctx.stroke();
    ctx.restore();

    this.drawUpwellingArrows(ctx, center, seaLevel + (compact ? 25 : 40), bottom, compact);
    this.drawNewCrustStripes(ctx, center, seaLevel, compact);
    this.label(
      ctx,
      center,
      seaLevel - ridgeHeight - 8,
      '해령 · 열곡',
      'center',
      compact ? 9 : 11,
      '#ffd18e'
    );
    this.label(
      ctx,
      left + 8,
      seaLevel + 10,
      '새 해양 지각',
      'left',
      compact ? 8 : 10,
      'rgba(255, 193, 139, 0.82)'
    );
    this.label(
      ctx,
      right - 8,
      seaLevel + 10,
      '새 해양 지각',
      'right',
      compact ? 8 : 10,
      'rgba(255, 193, 139, 0.82)'
    );
    if (!compact) {
      this.label(ctx, center, bottom - 12, '맨틀 상승', 'center', 10, 'rgba(240, 170, 130, 0.76)');
    }
  }

  private drawRift(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: CrossSectionModel,
    compact: boolean
  ): void {
    const pad = compact ? 12 : 28;
    const left = pad;
    const right = width - pad;
    const seaLevel = height * 0.36;
    const moho = height * 0.65;
    const bottom = height - (compact ? 8 : 22);
    const center = width / 2;
    const riftWidth = clampPx(model.features.riftWidthKm * 0.55, 18, compact ? 80 : 150);
    const riftDepth = clampPx(model.features.riftDepthKm * 10, 6, compact ? 30 : 62);
    this.drawMantle(ctx, left, right, moho, bottom);

    ctx.beginPath();
    ctx.moveTo(left, seaLevel - 4);
    ctx.quadraticCurveTo(
      center - riftWidth * 0.8,
      seaLevel - 20,
      center - riftWidth * 0.42,
      seaLevel - 14
    );
    ctx.lineTo(center - riftWidth * 0.18, seaLevel + riftDepth);
    ctx.quadraticCurveTo(
      center,
      seaLevel + riftDepth + 8,
      center + riftWidth * 0.18,
      seaLevel + riftDepth
    );
    ctx.lineTo(center + riftWidth * 0.42, seaLevel - 14);
    ctx.quadraticCurveTo(center + riftWidth * 0.8, seaLevel - 20, right, seaLevel - 4);
    ctx.lineTo(right, moho);
    ctx.lineTo(left, moho);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, seaLevel - 20, 0, moho);
    gradient.addColorStop(0, '#8b7051');
    gradient.addColorStop(0.6, '#5c4634');
    gradient.addColorStop(1, '#31261f');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 228, 189, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (model.features.riftDepthKm > 2.2) {
      ctx.save();
      ctx.fillStyle = 'rgba(38, 134, 162, 0.5)';
      ctx.beginPath();
      ctx.moveTo(center - riftWidth * 0.18, seaLevel + riftDepth);
      ctx.quadraticCurveTo(
        center,
        seaLevel + riftDepth + 8,
        center + riftWidth * 0.18,
        seaLevel + riftDepth
      );
      ctx.lineTo(center + riftWidth * 0.28, seaLevel + 2);
      ctx.lineTo(center - riftWidth * 0.28, seaLevel + 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    this.drawUpwellingArrows(ctx, center, seaLevel + riftDepth + 10, bottom, compact);
    this.drawRiftArrows(ctx, center, riftWidth, seaLevel - 36, compact);
    this.label(
      ctx,
      center,
      seaLevel + riftDepth + (compact ? 16 : 27),
      '열곡',
      'center',
      compact ? 9 : 11,
      '#ffd18e'
    );
    this.label(
      ctx,
      center - riftWidth * 0.58,
      seaLevel - 24,
      '어깨 융기',
      'center',
      compact ? 8 : 10,
      'rgba(255, 216, 164, 0.8)'
    );
    this.label(
      ctx,
      center + riftWidth * 0.58,
      seaLevel - 24,
      '어깨 융기',
      'center',
      compact ? 8 : 10,
      'rgba(255, 216, 164, 0.8)'
    );
    this.label(
      ctx,
      left + 8,
      seaLevel + 18,
      model.leftPlateKo,
      'left',
      compact ? 9 : 10,
      'rgba(255, 225, 189, 0.78)'
    );
    this.label(
      ctx,
      right - 8,
      seaLevel + 18,
      model.rightPlateKo,
      'right',
      compact ? 9 : 10,
      'rgba(255, 225, 189, 0.78)'
    );
    if (!compact) {
      this.label(ctx, center, bottom - 12, '맨틀 상승', 'center', 10, 'rgba(240, 170, 130, 0.76)');
      if (model.features.riftDepthKm > 2.2) {
        this.label(
          ctx,
          center,
          seaLevel - 2,
          '바다가 들어오는 중',
          'center',
          9,
          'rgba(159, 224, 240, 0.92)'
        );
      }
    }
  }

  private drawTransform(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: CrossSectionModel,
    compact: boolean
  ): void {
    const pad = compact ? 12 : 28;
    const left = pad;
    const right = width - pad;
    const top = height * 0.2;
    const moho = height * 0.63;
    const bottom = height - (compact ? 8 : 22);
    const center = width / 2;
    this.drawMantle(ctx, left, right, moho, bottom);

    ctx.fillStyle = '#4a3a2e';
    ctx.fillRect(left, top, right - left, moho - top);
    ctx.strokeStyle = 'rgba(255, 236, 208, 0.35)';
    ctx.strokeRect(left, top, right - left, moho - top);

    const offset = clampPx(model.features.offsetKm * 0.12, 4, compact ? 18 : 34);
    ctx.save();
    ctx.fillStyle = 'rgba(202, 157, 103, 0.7)';
    ctx.fillRect(left, top + 26, center - left - offset, compact ? 8 : 12);
    ctx.fillRect(center + offset, top + 26, right - center - offset, compact ? 8 : 12);
    ctx.fillStyle = 'rgba(202, 157, 103, 0.42)';
    ctx.fillRect(left, top + 48, center - left + offset, compact ? 6 : 8);
    ctx.fillRect(center - offset, top + 48, right - center + offset, compact ? 6 : 8);
    ctx.restore();

    ctx.strokeStyle = '#cfc0ff';
    ctx.lineWidth = compact ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(center, top + 8);
    ctx.lineTo(center + 5, bottom - 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(207, 192, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center + 12, top + 8);
    ctx.lineTo(center + 17, bottom - 10);
    ctx.stroke();

    this.drawFaultArrows(ctx, center, top + (compact ? 20 : 38), compact);
    const start = top + (compact ? 38 : 58);
    const end = compact ? moho : bottom - 28;
    for (let index = 0; index < 7; index += 1) {
      const y = start + ((end - start) * index) / 6;
      ctx.fillStyle = DEPTH_COLORS[index % DEPTH_COLORS.length];
      ctx.beginPath();
      ctx.arc(center + 4 + (index % 2) * 5, y, compact ? 1.6 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    this.label(ctx, center, top - 8, '변환 단층', 'center', compact ? 10 : 12, '#ded0ff');
    this.label(
      ctx,
      left + 10,
      top + (compact ? 12 : 18),
      model.leftPlateKo,
      'left',
      compact ? 8 : 10,
      'rgba(255, 225, 189, 0.8)'
    );
    this.label(
      ctx,
      right - 10,
      top + (compact ? 12 : 18),
      model.rightPlateKo,
      'right',
      compact ? 8 : 10,
      'rgba(255, 225, 189, 0.8)'
    );
    this.label(
      ctx,
      center,
      bottom - 10,
      '얕은 지진 · 화산 거의 없음',
      'center',
      compact ? 8 : 10,
      'rgba(222, 208, 255, 0.8)'
    );
    if (!compact) {
      this.label(ctx, center, moho + 20, '맨틀', 'center', 10, 'rgba(207, 180, 164, 0.6)');
    }
  }

  private drawInactive(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: CrossSectionModel,
    compact: boolean
  ): void {
    const pad = compact ? 12 : 28;
    const left = pad;
    const right = width - pad;
    const top = height * 0.34;
    const moho = height * 0.64;
    const bottom = height - (compact ? 8 : 22);
    this.drawMantle(ctx, left, right, moho, bottom);
    ctx.fillStyle = '#4a3a2e';
    ctx.fillRect(left, top, right - left, moho - top);
    ctx.strokeStyle = 'rgba(255, 236, 208, 0.28)';
    ctx.strokeRect(left, top, right - left, moho - top);
    this.label(
      ctx,
      width / 2,
      top - 10,
      '활동이 약한 경계',
      'center',
      compact ? 9 : 11,
      'rgba(220, 236, 242, 0.84)'
    );
    this.label(
      ctx,
      width / 2,
      bottom - 12,
      `${model.leftPlateKo} · ${model.rightPlateKo}`,
      'center',
      compact ? 8 : 10,
      'rgba(200, 216, 222, 0.6)'
    );
  }

  private drawMantle(
    ctx: CanvasRenderingContext2D,
    left: number,
    right: number,
    moho: number,
    bottom: number
  ): void {
    const gradient = ctx.createLinearGradient(0, moho, 0, bottom);
    gradient.addColorStop(0, '#4b2a21');
    gradient.addColorStop(0.5, '#2a1714');
    gradient.addColorStop(1, '#160d0b');
    ctx.fillStyle = gradient;
    ctx.fillRect(left, moho, right - left, bottom - moho);
    ctx.strokeStyle = 'rgba(255, 191, 150, 0.12)';
    ctx.lineWidth = 1;
    for (let index = 1; index < 4; index += 1) {
      const y = moho + ((bottom - moho) * index) / 4;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.bezierCurveTo(
        left + (right - left) * 0.3,
        y - 8,
        left + (right - left) * 0.7,
        y + 8,
        right,
        y
      );
      ctx.stroke();
    }
  }

  private drawWater(
    ctx: CanvasRenderingContext2D,
    left: number,
    right: number,
    seaLevel: number,
    seafloor: number,
    compact: boolean
  ): void {
    const gradient = ctx.createLinearGradient(0, seaLevel, 0, seafloor);
    gradient.addColorStop(0, 'rgba(55, 143, 173, 0.65)');
    gradient.addColorStop(1, 'rgba(12, 57, 76, 0.8)');
    ctx.fillStyle = gradient;
    ctx.fillRect(left, seaLevel, right - left, seafloor - seaLevel);
    ctx.strokeStyle = 'rgba(159, 224, 240, 0.55)';
    ctx.lineWidth = compact ? 1 : 1.4;
    ctx.beginPath();
    ctx.moveTo(left, seaLevel);
    ctx.lineTo(right, seaLevel);
    ctx.stroke();
  }

  private drawSlab(
    ctx: CanvasRenderingContext2D,
    center: number,
    seafloor: number,
    endX: number,
    bottom: number,
    slabDepthKm: number,
    compact: boolean
  ): void {
    const depthFraction = Math.min(1, slabDepthKm / 700);
    const endY = seafloor + (bottom - seafloor) * Math.max(0.22, depthFraction * 0.82);
    ctx.save();
    ctx.strokeStyle = 'rgba(170, 185, 198, 0.92)';
    ctx.lineWidth = compact ? 5 : 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(center, seafloor + 2);
    ctx.quadraticCurveTo(
      center + (endX - center) * 0.35,
      seafloor + (endY - seafloor) * 0.42,
      endX,
      endY
    );
    ctx.stroke();
    ctx.strokeStyle = 'rgba(222, 232, 240, 0.35)';
    ctx.lineWidth = compact ? 1 : 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawMagmaPath(
    ctx: CanvasRenderingContext2D,
    center: number,
    seafloor: number,
    arcX: number,
    arcY: number,
    compact: boolean
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 112, 61, 0.85)';
    ctx.lineWidth = compact ? 1.6 : 2.6;
    ctx.setLineDash([compact ? 3 : 5, compact ? 3 : 4]);
    ctx.beginPath();
    ctx.moveTo(center + (arcX - center) * 0.18, seafloor + (compact ? 30 : 48));
    ctx.quadraticCurveTo(arcX, arcY + (compact ? 20 : 34), arcX, arcY);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(255, 128, 58, 0.22)';
    ctx.beginPath();
    ctx.arc(arcX, arcY, compact ? 8 : 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawVolcano(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    seaLevel: number,
    compact: boolean
  ): void {
    const height = compact ? 12 : 20;
    const width = compact ? 16 : 26;
    ctx.save();
    ctx.fillStyle = '#9b6a4a';
    ctx.beginPath();
    ctx.moveTo(x - width / 2, seaLevel);
    ctx.lineTo(x, y - height * 0.4);
    ctx.lineTo(x + width / 2, seaLevel);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 200, 130, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 105, 48, 0.9)';
    ctx.beginPath();
    ctx.ellipse(x, y - height * 0.4, width * 0.12, height * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawEarthquakeDots(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    compact: boolean
  ): void {
    for (let index = 0; index < 9; index += 1) {
      const t = index / 8;
      const x = startX + (endX - startX) * t + Math.sin(index * 2.1) * 8;
      const y = startY + (endY - startY) * t;
      ctx.fillStyle = DEPTH_COLORS[index % DEPTH_COLORS.length];
      ctx.beginPath();
      ctx.arc(x, y, compact ? 1.6 : 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawUpwellingArrows(
    ctx: CanvasRenderingContext2D,
    center: number,
    startY: number,
    bottom: number,
    compact: boolean
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 142, 78, 0.82)';
    ctx.lineWidth = compact ? 1.4 : 2;
    for (const offset of [-1, 0, 1]) {
      const x = center + offset * (compact ? 18 : 30);
      const start = bottom - 10;
      const end = startY + 10 + Math.abs(offset) * (compact ? 8 : 14);
      ctx.beginPath();
      ctx.moveTo(x, start);
      ctx.lineTo(x, end);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, end);
      ctx.lineTo(x - 3, end + 6);
      ctx.lineTo(x + 3, end + 6);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 142, 78, 0.82)';
      ctx.fill();
    }
    ctx.restore();
  }

  private drawNewCrustStripes(
    ctx: CanvasRenderingContext2D,
    center: number,
    seaLevel: number,
    compact: boolean
  ): void {
    ctx.save();
    ctx.lineWidth = compact ? 1 : 1.5;
    for (let index = 1; index <= 3; index += 1) {
      const offset = index * (compact ? 18 : 30);
      ctx.strokeStyle = `rgba(255, 126, 68, ${0.5 - index * 0.1})`;
      ctx.beginPath();
      ctx.moveTo(center - offset, seaLevel + 12);
      ctx.lineTo(center - offset - 7, seaLevel + (compact ? 22 : 32));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(center + offset, seaLevel + 12);
      ctx.lineTo(center + offset + 7, seaLevel + (compact ? 22 : 32));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawConvergenceArrows(
    ctx: CanvasRenderingContext2D,
    oceanLeft: boolean,
    left: number,
    right: number,
    center: number,
    seaLevel: number,
    compact: boolean
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 224, 184, 0.65)';
    ctx.fillStyle = 'rgba(255, 224, 184, 0.65)';
    ctx.lineWidth = compact ? 1.2 : 1.6;
    const y = seaLevel - (compact ? 12 : 20);
    const oceanStart = oceanLeft ? left + 20 : right - 20;
    const oceanEnd = oceanLeft ? center - 24 : center + 24;
    this.arrow(ctx, oceanStart, y, oceanEnd, y, compact ? 4 : 6);
    const landStart = oceanLeft ? right - 20 : left + 20;
    const landEnd = oceanLeft ? center + 32 : center - 32;
    this.arrow(ctx, landStart, y, landEnd, y, compact ? 4 : 6);
    ctx.restore();
  }

  private drawCollisionArrows(
    ctx: CanvasRenderingContext2D,
    left: number,
    right: number,
    y: number,
    compact: boolean
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 224, 184, 0.66)';
    ctx.fillStyle = 'rgba(255, 224, 184, 0.66)';
    ctx.lineWidth = compact ? 1.2 : 1.6;
    this.arrow(ctx, left + 18, y, left + (right - left) * 0.32, y, compact ? 4 : 6);
    this.arrow(ctx, right - 18, y, right - (right - left) * 0.32, y, compact ? 4 : 6);
    ctx.restore();
  }

  private drawRiftArrows(
    ctx: CanvasRenderingContext2D,
    center: number,
    riftWidth: number,
    y: number,
    compact: boolean
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 224, 184, 0.66)';
    ctx.fillStyle = 'rgba(255, 224, 184, 0.66)';
    ctx.lineWidth = compact ? 1.2 : 1.6;
    this.arrow(ctx, center - riftWidth * 0.2, y, center - riftWidth * 0.72, y, compact ? 4 : 6);
    this.arrow(ctx, center + riftWidth * 0.2, y, center + riftWidth * 0.72, y, compact ? 4 : 6);
    ctx.restore();
  }

  private drawFaultArrows(
    ctx: CanvasRenderingContext2D,
    center: number,
    y: number,
    compact: boolean
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(222, 208, 255, 0.78)';
    ctx.fillStyle = 'rgba(222, 208, 255, 0.78)';
    ctx.lineWidth = compact ? 1.2 : 1.6;
    this.arrow(ctx, center - 34, y - 8, center - 10, y - 8, compact ? 4 : 6);
    this.arrow(ctx, center + 34, y + 8, center + 10, y + 8, compact ? 4 : 6);
    ctx.restore();
  }

  private arrow(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    head: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - 0.5), y2 - head * Math.sin(angle - 0.5));
    ctx.lineTo(x2 - head * Math.cos(angle + 0.5), y2 - head * Math.sin(angle + 0.5));
    ctx.closePath();
    ctx.fill();
  }

  private label(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    align: 'left' | 'right' | 'center',
    size: number,
    color: string
  ): void {
    ctx.save();
    ctx.font = `600 ${size}px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(text);
    const padding = 4;
    const boxWidth = metrics.width + padding * 2;
    const boxHeight = size + padding * 1.4;
    let boxX = x - padding;
    if (align === 'center') boxX = x - boxWidth / 2;
    if (align === 'right') boxX = x - boxWidth + padding;
    ctx.fillStyle = 'rgba(4, 16, 21, 0.55)';
    this.roundedRect(ctx, boxX, y - boxHeight / 2, boxWidth, boxHeight, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  private roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
  }
}

function clampPx(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
