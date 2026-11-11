import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootEl = document.getElementById('root')!;
if (!(window as any).__MG_BOOTED__) {
  rootEl.innerHTML = '';
  createRoot(rootEl).render(<App />);
}
