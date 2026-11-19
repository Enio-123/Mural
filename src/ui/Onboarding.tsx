import { useState } from 'react';
import { setPrefs, usePrefs } from '../lib/prefs';
import type { Interest } from '../lib/interests';
import { InterestPicker } from './Interests';
import { BrandMark } from './icons';

const MIN = 3;

/** Primeira abertura: escolher os assuntos. */
export function Onboarding() {
  const p = usePrefs();
  const [sel, setSel] = useState<string[]>(p.interests);
  const [custom, setCustom] = useState<Interest[]>(p.custom);
  const missing = Math.max(0, MIN - sel.length);

  return (
    <div className="onboard">
      <BrandMark className="onboard-mark" />
      <h1>Do que você gosta?</h1>
      <p className="muted" style={{ margin: 0 }}>
        Escolha pelo menos {MIN} assuntos. O Mural monta as notícias com eles e vai aprendendo com o que você abre. Isso fica guardado só neste celular, e dá pra mudar depois em Ajustes.
      </p>
      <InterestPicker
        selected={sel}
        custom={custom}
        onChange={(s, c) => {
          setSel(s);
          setCustom(c);
        }}
      />
      <div className="foot">
        <button
          className="btn primary block"
          disabled={missing > 0}
          onClick={() => setPrefs({ interests: sel, custom: custom.filter((c) => sel.includes(c.id)), onboarded: true })}
        >
          {missing > 0 ? `Escolha mais ${missing}` : 'Começar'}
        </button>
      </div>
    </div>
  );
}
