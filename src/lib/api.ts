import { PONTE } from '../config';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof DOMException && e.name === 'AbortError') return 'Cancelado.';
  if (e instanceof TypeError) return 'Sem conexão com a internet agora.';
  return 'Algo deu errado. Tente de novo.';
}

async function ponteFetch(fn: string, params: Record<string, string>, signal?: AbortSignal): Promise<Response> {
  const qs = new URLSearchParams({ fn, ...params });
  let res: Response;
  try {
    res = await fetch(`${PONTE}?${qs.toString()}`, { signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('offline', 'Sem conexão com a internet agora.');
  }
  if (!res.ok) {
    let message = 'O servidor do Mural não respondeu direito.';
    let code = 'http';
    if ((res.headers.get('content-type') ?? '').includes('json')) {
      try {
        const j = await res.json();
        message = j?.error?.message ?? message;
        code = j?.error?.code ?? code;
      } catch {
        /* resposta estranha */
      }
    }
    throw new ApiError(code, message, res.status);
  }
  return res;
}

export async function ponte<T>(fn: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const res = await ponteFetch(fn, params, signal);
  return (await res.json()) as T;
}

export async function ponteBytes(fn: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await ponteFetch(fn, params, signal);
  return res.arrayBuffer();
}

/** Roda tarefas com no máximo `limit` ao mesmo tempo. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
