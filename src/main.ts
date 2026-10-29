import './ui/styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';

const root = document.querySelector<HTMLElement>('#app');

const boot = (): void => {
  if (!root) return;
  try {
    new App(root);
  } catch (error) {
    console.error(error);
    root.innerHTML = `
      <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:#041117;color:#eaf6fa;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
        <div style="max-width:520px;line-height:1.7;text-align:center;">
          <h1 style="font-size:22px;">TerraShift를 시작하지 못했습니다.</h1>
          <p style="color:#93b4bf;font-size:13px;">브라우저를 새로고침한 뒤 다시 시도해 주세요. 반복해서 문제가 생기면 교사에게 알려 주세요.</p>
        </div>
      </div>
    `;
  }
};

if (root) {
  requestAnimationFrame(() => {
    window.setTimeout(boot, 0);
  });
}

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}
