import { useEffect, useRef } from 'react';
import { STUDIO_BODY_HTML } from './studioMarkup';
// @ts-ignore
import { bootAutoMotionStudio } from './studioRuntime.js';

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || initializedRef.current) return;
    initializedRef.current = true;
    (window as any).__MG_BOOTED__ = true;

    host.innerHTML = STUDIO_BODY_HTML;
    bootAutoMotionStudio();
  }, []);

  return <div ref={hostRef} className="min-h-screen w-full" />;
}
