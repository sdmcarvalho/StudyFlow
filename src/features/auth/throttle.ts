// Limite de login: 5 falhas por e-mail em 15 minutos, contado em memória (some ao reiniciar o servidor).
// O estado fica em globalThis para sobreviver ao HMR do desenvolvimento.
// A memória é limitada: no máximo MAX_KEYS e-mails e MAX_FAILURES falhas por e-mail, para que
// tentativas com e-mails inventados (sem fim) não façam o servidor crescer sem parar.

export const MAX_FAILURES = 5;
export const MAX_KEYS = 10_000;
const WINDOW_MS = 15 * 60 * 1000;

const globalForThrottle = globalThis as unknown as { authThrottle?: Map<string, number[]> };
const failures = (globalForThrottle.authThrottle ??= new Map<string, number[]>());

const keyOf = (email: string) => email.trim().toLowerCase();

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (list.length > 0) failures.set(key, list);
  else failures.delete(key);
  return list;
}

export function isThrottled(email: string, now: number = Date.now()): boolean {
  return recent(keyOf(email), now).length >= MAX_FAILURES;
}

/** Abre espaço para uma chave nova: tira as expiradas e, se ainda assim estiver cheio, a inserida há mais tempo. */
function makeRoom(now: number): void {
  if (failures.size < MAX_KEYS) return;
  for (const [key, list] of failures) {
    if (list.every((at) => now - at >= WINDOW_MS)) failures.delete(key);
  }
  while (failures.size >= MAX_KEYS) {
    const oldest = failures.keys().next();
    if (oldest.done) break;
    failures.delete(oldest.value);
  }
}

export function recordFailure(email: string, now: number = Date.now()): void {
  const key = keyOf(email);
  const list = recent(key, now);
  if (list.length === 0) makeRoom(now);
  failures.set(key, [...list, now].slice(-MAX_FAILURES));
}

export function clearFailures(email: string): void {
  failures.delete(keyOf(email));
}

/** Só para testes. */
export function resetThrottle(): void {
  failures.clear();
}
