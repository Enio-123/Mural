import { useEffect, useRef, useState } from 'react';

/**
 * Animação de abertura: o celular do desenho se desenha, entram os dois quadrados do xadrez,
 * a estante de livros e os cartões de notícia (o terceiro cortado, como no esboço), e o nome aparece.
 * Toque para pular. Quem pede menos movimento no celular vê só um instante.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches).current;
  const [out, setOut] = useState<'' | 'slow' | 'quick'>('');
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => setOut((o) => o || 'slow'), reduced ? 650 : 2250);
    return () => clearTimeout(t);
  }, [reduced]);

  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => done.current(), out === 'quick' ? 240 : 540);
    return () => clearTimeout(t);
  }, [out]);

  const d = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div className={'splash' + (out ? ' out' : '') + (out === 'quick' ? ' quick' : '')} onClick={() => setOut((o) => o || 'quick')} aria-hidden="true">
      <div className="splash-inner">
        <svg viewBox="0 0 120 200">
          <defs>
            <clipPath id="splash-tela">
              <rect x="14" y="125" width="92" height="62" />
            </clipPath>
          </defs>
          <rect className="t chess" x="14" y="20" width="43" height="43" rx="6" style={d(380)} />
          <rect className="t chess" x="63" y="20" width="43" height="43" rx="6" style={d(480)} />
          <line className="rule r1" x1="14" y1="73" x2="106" y2="73" pathLength={80} />
          <rect className="t book" x="14" y="83" width="18.5" height="28" rx="2.5" style={d(740)} />
          <rect className="t book" x="38.5" y="83" width="18.5" height="28" rx="2.5" style={d(810)} />
          <rect className="t book" x="63" y="83" width="18.5" height="28" rx="2.5" style={d(880)} />
          <rect className="t book" x="87.5" y="83" width="18.5" height="28" rx="2.5" style={d(950)} />
          <line className="rule r2" x1="14" y1="121" x2="106" y2="121" pathLength={80} />
          <g clipPath="url(#splash-tela)">
            <rect className="t news" x="14" y="131" width="34" height="50" rx="5" style={d(1080)} />
            <rect className="t news" x="54" y="131" width="34" height="50" rx="5" style={d(1160)} />
            <rect className="t news" x="94" y="131" width="34" height="50" rx="5" style={d(1240)} />
          </g>
          <path
            className="phone"
            d="M60 4 H100 A16 16 0 0 1 116 20 V180 A16 16 0 0 1 100 196 H20 A16 16 0 0 1 4 180 V20 A16 16 0 0 1 20 4 Z"
            pathLength={560}
          />
        </svg>
        <div className="word">Mural</div>
        <div className="tagline">Notícias, Bluesky, xadrez e livros</div>
      </div>
    </div>
  );
}
