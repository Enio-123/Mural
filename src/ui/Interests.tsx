import { useState } from 'react';
import { customInterest, INTERESTS, type Interest } from '../lib/interests';
import { Icon } from './icons';

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** Lista de assuntos para ligar e desligar, mais um campo para criar um assunto seu. */
export function InterestPicker({
  selected,
  custom,
  onChange,
}: {
  selected: string[];
  custom: Interest[];
  onChange: (selected: string[], custom: Interest[]) => void;
}) {
  const [txt, setTxt] = useState('');
  const all = [...INTERESTS, ...custom];

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], custom);

  const add = () => {
    const t = txt.trim();
    if (t.length < 2) return;
    const fresh = customInterest(t);
    const same = all.find((i) => i.id === fresh.id || plain(i.label) === plain(t));
    if (same) {
      if (!selected.includes(same.id)) onChange([...selected, same.id], custom);
    } else onChange([...selected, fresh.id], [...custom, fresh]);
    setTxt('');
  };

  return (
    <>
      <div className="chips wrap" role="group" aria-label="Assuntos">
        {all.map((i) => (
          <button key={i.id} className="chip" aria-pressed={selected.includes(i.id)} onClick={() => toggle(i.id)}>
            {i.label}
          </button>
        ))}
      </div>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input"
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          placeholder="Outro assunto, ex.: Minecraft"
          maxLength={60}
          aria-label="Outro assunto"
          enterKeyHint="done"
        />
        <button className="btn ghost" type="submit" disabled={txt.trim().length < 2}>
          <Icon name="plus" /> Adicionar
        </button>
      </form>
    </>
  );
}
