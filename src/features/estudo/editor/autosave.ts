import type { Cell } from "@/features/estudo/content-schema";

export type SaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "retrying"
  | "failed";

export type AutosaveState = { status: SaveStatus; savedAt: Date | null };

export type AutosaveOptions = {
  save: (cells: Cell[]) => Promise<boolean>;
  onState: (state: AutosaveState) => void;
  delayMs?: number;
  retryDelaysMs?: number[];
  now?: () => Date;
};

export type Autosave = {
  change(cells: Cell[]): void;
  saveNow(): Promise<boolean>;
  hasPending(): boolean;
  dispose(): void;
};

const DEFAULT_DELAY_MS = 2000;
const DEFAULT_RETRY_DELAYS_MS = [5000, 10000, 20000];

export function createAutosave(options: AutosaveOptions): Autosave {
  const {
    save,
    onState,
    delayMs = DEFAULT_DELAY_MS,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    now = () => new Date(),
  } = options;

  let status: SaveStatus = "idle";
  let savedAt: Date | null = null;
  let latest: Cell[] = [];
  let version = 0;
  let savedVersion = 0;
  let retryCount = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<boolean> | null = null;
  let disposed = false;

  function setStatus(next: SaveStatus) {
    status = next;
    onState({ status, savedAt });
  }

  function clearTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function schedule(ms: number) {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void send(false);
    }, ms);
  }

  async function attempt(): Promise<boolean> {
    try {
      return (await save(latest)) === true;
    } catch {
      return false;
    }
  }

  function send(manual: boolean): Promise<boolean> {
    const sentVersion = version;
    setStatus("saving");
    const run = (async () => {
      const ok = await attempt();
      inFlight = null;
      if (disposed) return ok;
      settle(ok, sentVersion, manual);
      return ok;
    })();
    inFlight = run;
    return run;
  }

  function settle(ok: boolean, sentVersion: number, manual: boolean) {
    const superseded = version !== sentVersion;
    if (ok) {
      savedVersion = sentVersion;
      retryCount = 0;
      if (superseded) {
        setStatus("dirty");
        schedule(delayMs);
        return;
      }
      savedAt = now();
      setStatus("saved");
      return;
    }
    if (superseded) {
      setStatus("dirty");
      schedule(delayMs);
      return;
    }
    if (!manual && retryCount < retryDelaysMs.length) {
      const wait = retryDelaysMs[retryCount];
      retryCount += 1;
      setStatus("retrying");
      schedule(wait);
      return;
    }
    setStatus("failed");
  }

  function change(cells: Cell[]) {
    if (disposed) return;
    latest = cells;
    version += 1;
    retryCount = 0;
    clearTimer();
    setStatus("dirty");
    if (inFlight === null) schedule(delayMs);
  }

  async function saveNow(): Promise<boolean> {
    for (;;) {
      if (disposed) return false;
      clearTimer();
      if (inFlight !== null) {
        await inFlight;
        continue;
      }
      if (version === savedVersion) return true;
      return send(true);
    }
  }

  function hasPending(): boolean {
    return status !== "idle" && status !== "saved";
  }

  function dispose() {
    disposed = true;
    clearTimer();
  }

  return { change, saveNow, hasPending, dispose };
}
