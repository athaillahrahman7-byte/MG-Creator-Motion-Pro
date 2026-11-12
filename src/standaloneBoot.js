import { STUDIO_BODY_HTML } from './studioMarkup.js?v=20261112_pro5';
import { bootAutoMotionStudio } from './studioRuntime.js?v=20261112_pro5';

export function mountStandaloneStudio() {
  if (window.__MG_BOOTED__) return;
  const root = document.getElementById('root');
  if (!root) return;
  window.__MG_BOOTED__ = true;
  root.innerHTML = '<div class="min-h-screen w-full">' + STUDIO_BODY_HTML + '</div>';
  bootAutoMotionStudio();
}

mountStandaloneStudio();
