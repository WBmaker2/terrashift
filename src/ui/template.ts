export function appTemplate(): string {
  return `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#/explore" aria-label="TerraShift 탐험 화면">
        <span class="brand-mark" aria-hidden="true"><span class="brand-orbit"></span><span class="brand-core"></span></span>
        <span class="brand-text"><strong>TerraShift</strong><small>판구조 시간여행</small></span>
      </a>
      <nav class="route-nav" aria-label="화면 이동">
        <button type="button" class="route-btn" data-route="explore">탐험</button>
        <button type="button" class="route-btn" data-route="missions">미션</button>
        <button type="button" class="route-btn" data-route="teacher">교사</button>
      </nav>
      <div class="topbar-meta">
        <button type="button" class="btn btn-ghost btn-sm" id="share-scenario" title="현재 시나리오 URL 복사">공유</button>
        <span class="badge badge-concept" title="이 앱은 미래의 지진이나 화산을 예측하지 않습니다.">개념 모델 · 예보 아님</span>
        <span class="badge badge-scale" id="scale-badge">고도 40× 과장</span>
        <span class="progress-chip" id="progress-chip">미션 0/6</span>
      </div>
    </header>

    <main class="workspace">
      <section class="explore-layout" id="explore-layout">
        <aside class="panel panel-left" id="left-panel" aria-label="보기 층과 판 목록">
          <div class="panel-scroll">
            <section class="panel-block">
              <div class="panel-heading">
                <div><span class="eyebrow">LAYERS</span><h2>보기 층</h2></div>
                <button type="button" class="icon-btn panel-close" data-close-panel="left" aria-label="층 패널 닫기">×</button>
              </div>
              <div class="layer-list" id="layer-list"></div>
              <div class="geolocate-block">
                <div class="panel-heading" style="margin-top:0.8rem">
                  <div><span class="eyebrow">LOCATE</span><h2>위치 찾기</h2></div>
                </div>
                <div class="geolocate-row">
                  <input id="geo-search" class="geo-input" type="text" placeholder="예: 대한민국, 일본, 미국" aria-label="국가명 검색" />
                  <button type="button" class="btn btn-ghost btn-sm" id="geo-search-btn">이동</button>
                </div>
                <div class="geo-labels">
                  <span class="chip">대한민국</span>
                  <span class="chip">일본</span>
                  <span class="chip">중국</span>
                  <span class="chip">인도</span>
                  <span class="chip">미국</span>
                  <span class="chip">호주</span>
                </div>
                <p class="fine-print">위치 안내용입니다. 판구조 모델과는 별개 레이어입니다.</p>
              </div>
              <div class="compare-panel">
                <div class="panel-heading" style="margin-top:0.8rem">
                  <div><span class="eyebrow">COMPARE</span><h2>경계 비교 모드</h2></div>
                </div>
                <label class="toggle">
                  <input type="checkbox" id="compare-toggle" />
                  <span class="switch" aria-hidden="true"></span>
                  <span>두 경계 나란히 비교</span>
                </label>
                <div class="compare-selects">
                  <select id="compare-a" aria-label="비교 경계 A"></select>
                  <select id="compare-b" aria-label="비교 경계 B"></select>
                </div>
                <label class="toggle">
                  <input type="checkbox" id="compare-sync" checked />
                  <span class="switch" aria-hidden="true"></span>
                  <span>시간 동기화</span>
                </label>
              </div>
            </section>

            <section class="panel-block">
              <div class="panel-heading">
                <div><span class="eyebrow">PLATES</span><h2>판</h2></div>
              </div>
              <div class="plate-list" id="plate-list"></div>
            </section>

            <section class="panel-block">
              <div class="panel-heading">
                <div><span class="eyebrow">READ THE MAP</span><h2>지도 읽기</h2></div>
              </div>
              <details class="map-read" id="map-read" open>
                <summary>지금 화면을 말로 읽기</summary>
                <div id="map-read-body"></div>
              </details>
            </section>

            <section class="panel-block panel-note">
              <div class="legend" id="boundary-legend" aria-label="경계선 범례"></div>
              <div class="legend legend-events" aria-label="사건 표시 범례">
                <span><i class="dot dot-shallow"></i>얕은 지진</span>
                <span><i class="dot dot-intermediate"></i>중간 지진</span>
                <span><i class="dot dot-deep"></i>깊은 지진</span>
                <span><i class="dot dot-volcano"></i>화산</span>
              </div>
              <p class="fine-print">단순화한 수업용 판 모자이크입니다. 실제 측지 자료나 미래 예측이 아닙니다.</p>
            </section>
          </div>
        </aside>

        <section class="stage" id="stage">
          <div class="stage-toolbar">
            <div>
              <span class="eyebrow" id="stage-eyebrow">EXPLORE</span>
              <div class="stage-title" id="stage-title">지구를 돌려 경계를 읽어 보세요</div>
            </div>
            <div class="stage-actions">
              <button type="button" class="icon-btn panel-toggle" id="toggle-left-panel" aria-label="층 패널 열기" aria-expanded="false" aria-controls="left-panel">☰</button>
              <button type="button" class="icon-btn panel-toggle" id="toggle-right-panel" aria-label="경계 패널 열기" aria-expanded="false" aria-controls="right-panel">▤</button>
              <button type="button" class="icon-btn" data-action="snapshot" aria-label="스냅샷 저장">📷</button>
              <button type="button" class="icon-btn" id="reset-camera" aria-label="카메라 초기화">↺</button>
            </div>
          </div>

          <div class="globe-area" id="globe-area">
            <div id="globe-container" class="globe-container"></div>
            <div class="stage-badges" id="stage-badges">
              <span>고도 40× 과장</span>
              <span>개념 모델 · 실제 예보 아님</span>
            </div>
            <div class="stage-hint" id="stage-hint">드래그 회전 · 클릭 경계 선택 · 더블클릭 확대</div>
            <div class="readout" id="readout" aria-live="off"></div>
            <div class="canvas-fallback hidden" id="canvas-fallback">
              <strong>3D 지구본을 표시할 수 없습니다.</strong>
              <span>이 기기에서는 개념 단면도와 지도 읽기 패널을 사용하세요.</span>
            </div>
          </div>

          <div class="cross-section-full hidden" id="cross-section-full">
            <div class="full-section-head">
              <div>
                <span class="eyebrow">CONCEPT CROSS-SECTION</span>
                <h2 id="full-section-title">개념 단면도</h2>
                <p id="full-section-subtitle"></p>
              </div>
              <button type="button" class="btn btn-ghost" id="back-to-globe">← 지구본으로</button>
            </div>
            <div class="full-section-canvas-wrap">
              <canvas id="full-section-canvas" aria-label="선택한 판 경계의 개념 단면도"></canvas>
            </div>
            <div class="full-section-notes">
              <div>
                <span class="eyebrow">WHAT TO NOTICE</span>
                <ul id="full-section-notes-list"></ul>
              </div>
              <p class="fine-print">개념 단면도는 실제 지질 단면이 아니라 과정을 설명하기 위한 그림입니다.</p>
            </div>
          </div>

          <div class="timeline-bar" id="timeline-bar">
            <div class="timeline-top">
              <div class="time-readout">
                <span id="time-label">0 Myr · 현재</span>
                <span class="time-note" id="time-note">모델 시간 · 미래 예측 아님</span>
              </div>
              <div class="timeline-controls">
                <button type="button" class="btn btn-play" id="play-toggle" aria-label="시간 재생">▶ 재생</button>
                <label class="speed-control"><span>속도</span><select id="speed-select" aria-label="재생 속도"></select></label>
                <button type="button" class="btn btn-ghost btn-sm" id="reset-time">현재로</button>
              </div>
            </div>
            <div class="range-row">
              <span class="range-label">0</span>
              <input id="time-range" type="range" min="0" max="200" step="1" value="0" aria-label="모델 시간" aria-valuetext="0 Myr" />
              <span class="range-label">200</span>
            </div>
            <div class="era-marks" aria-hidden="true">
              <span>현재</span><span>50</span><span>100</span><span>150</span><span>모델 미래</span>
            </div>
          </div>

          <nav class="mobile-tabs" id="mobile-tabs" aria-label="모바일 패널 선택">
            <button type="button" data-mobile-tab="time" class="active" aria-pressed="true">시간</button>
            <button type="button" data-mobile-tab="layers" aria-pressed="false">층</button>
            <button type="button" data-mobile-tab="selection" aria-pressed="false" id="mobile-selection-tab">선택</button>
          </nav>
        </section>

        <aside class="panel panel-right" id="right-panel" aria-label="선택한 경계와 미션">
          <div class="panel-scroll">
            <section id="selection-panel"></section>
            <section id="mission-panel" class="hidden"></section>
          </div>
        </aside>
      </section>

      <section class="teacher-layout hidden" id="teacher-layout" aria-label="교사 모드"></section>
    </main>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <div class="sr-only" id="sr-status" aria-live="polite"></div>
    <div class="modal-root" id="modal-root"></div>
    <div class="print-worksheet" id="print-worksheet"></div>
  </div>
  `;
}
