import { STUDIO_BODY_HTML } from './studioMarkup.js';
import { bootAutoMotionStudio } from './studioRuntime.js';

export function mountStandaloneStudio() {
  if (window.__MG_BOOTED__) return;
  const root = document.getElementById('root');
  if (!root) return;
  window.__MG_BOOTED__ = true;
  if (!root.querySelector('header.top')) {
    root.innerHTML = '<div class="min-h-screen w-full">' + STUDIO_BODY_HTML + '</div>';
  }
  bootAutoMotionStudio();
}

mountStandaloneStudio();
