import { persisted } from './store';

/**
 * O que o app aprende com o que você lê. Fica só no aparelho.
 * Chaves: "i:<assunto>" e "s:<fonte>". Peso 1 é neutro, vai de 0.2 a 3.
 */
export const weights = persisted<Record<string, number>>('pesos', {});
export const readIds = persisted<string[]>('lidos', []);

const MIN = 0.2;
const MAX = 3;

export function weightOf(key: string): number {
  return weights.get()[key] ?? 1;
}

export function bump(key: string, delta: number): void {
  weights.set((w) => {
    const cur = w[key] ?? 1;
    const next = Math.min(MAX, Math.max(MIN, cur + delta));
    return { ...w, [key]: Math.round(next * 100) / 100 };
  });
}

export function scale(key: string, factor: number): void {
  weights.set((w) => {
    const cur = w[key] ?? 1;
    const next = Math.min(MAX, Math.max(MIN, cur * factor));
    return { ...w, [key]: Math.round(next * 100) / 100 };
  });
}

export function sourceKey(source: string): string {
  return 's:' + source.trim().toLowerCase();
}

export function markRead(id: string): void {
  readIds.set((ids) => (ids.includes(id) ? ids : [id, ...ids].slice(0, 500)));
}

export function resetLearning(): void {
  weights.set({});
  readIds.set([]);
}
