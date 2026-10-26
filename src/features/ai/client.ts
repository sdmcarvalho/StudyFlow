// Cliente mínimo para APIs compatíveis com OpenAI (/models e /chat/completions).
// Módulo puro: não toca o banco e recebe o `fetch` por injeção para os testes.

export type AiClientConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  /** Timeout do `chat`, em SEGUNDOS. */
  timeout: number;
  extraParams: Record<string, unknown>;
};

export type TestResult = {
  ok: boolean;
  latencyMs: number;
  reply: string;
  error: string | null;
  status: number | null;
};

export class AiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

const MAX_ERROR_LENGTH = 500;
const MODELS_TIMEOUT_S = 30;
const TEST_TIMEOUT_S = 60;

/** Troca toda ocorrência da chave (se tiver 4+ caracteres) por `***`. */
function redact(text: string, apiKey: string): string {
  const key = apiKey.trim();
  return key.length >= 4 ? text.split(key).join("***") : text;
}

/** Texto seguro para exibir: sem a chave e com no máximo 500 caracteres. */
function safeText(text: string, apiKey: string): string {
  return redact(text, apiKey).slice(0, MAX_ERROR_LENGTH);
}

/** `error.message` do JSON, ou o corpo bruto. */
function extractErrorText(body: string): string {
  try {
    const data: unknown = JSON.parse(body);
    if (data && typeof data === "object") {
      const err = (data as { error?: unknown }).error;
      if (err && typeof err === "object") {
        const message = (err as { message?: unknown }).message;
        if (typeof message === "string" && message) return message;
      }
    }
  } catch {
    // corpo não é JSON: usa o texto bruto
  }
  return body;
}

/** Na Alibaba (DashScope) os modelos Qwen3+ "pensam" por padrão e a chamada demora minutos;
 *  só é enviado para ela porque a OpenAI, por exemplo, recusa parâmetros desconhecidos. */
function providerDefaults(baseUrl: string): Record<string, unknown> {
  return baseUrl.includes("aliyuncs.com") ? { enable_thinking: false } : {};
}

function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

export function createAiClient(config: AiClientConfig, fetchImpl: typeof fetch = fetch) {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = config.apiKey;

  function headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const key = apiKey.trim();
    if (key) h.Authorization = `Bearer ${key}`;
    return h;
  }

  function networkMessage(e: unknown, seconds: number): string {
    if (isTimeout(e)) return `Tempo esgotado (${seconds} s).`;
    const msg = e instanceof Error ? e.message : String(e);
    return safeText(`Erro de rede: ${msg}`, apiKey);
  }

  async function errorText(res: Response): Promise<string> {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // sem corpo legível
    }
    return safeText(extractErrorText(body), apiKey);
  }

  async function httpError(res: Response): Promise<AiError> {
    return new AiError(`HTTP ${res.status}: ${await errorText(res)}`, res.status);
  }

  async function listModels(): Promise<string[]> {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/models`, {
        method: "GET",
        headers: headers(),
        redirect: "error",
        signal: AbortSignal.timeout(MODELS_TIMEOUT_S * 1000),
      });
    } catch (e) {
      throw new AiError(networkMessage(e, MODELS_TIMEOUT_S));
    }
    if (res.status !== 200) throw await httpError(res);
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new AiError("Resposta da API não é JSON.", 200);
    }
    const list = (data as { data?: unknown } | null)?.data;
    if (!Array.isArray(list)) return [];
    return list
      .map((m) => (m as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === "string")
      .sort();
  }

  async function testConnection(): Promise<TestResult> {
    const start = performance.now();
    const elapsed = () => Math.max(0, Math.round(performance.now() - start));
    try {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: "Responda apenas: OK" }],
          ...providerDefaults(baseUrl),
          ...config.extraParams,
          max_tokens: 5, // depois dos extras: eles não podem encarecer o Testar
        }),
        redirect: "error",
        signal: AbortSignal.timeout(TEST_TIMEOUT_S * 1000),
      });
      if (res.status !== 200) {
        return { ok: false, latencyMs: elapsed(), reply: "", error: await errorText(res), status: res.status };
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        return { ok: false, latencyMs: elapsed(), reply: "", error: "Resposta da API não é JSON.", status: 200 };
      }
      const content = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message
        ?.content;
      if (typeof content !== "string") {
        return {
          ok: false,
          latencyMs: elapsed(),
          reply: "",
          error: safeText(`Resposta inesperada da API: ${JSON.stringify(data)}`, apiKey),
          status: 200,
        };
      }
      return { ok: true, latencyMs: elapsed(), reply: content.trim(), error: null, status: 200 };
    } catch (e) {
      return { ok: false, latencyMs: elapsed(), reply: "", error: networkMessage(e, TEST_TIMEOUT_S), status: null };
    }
  }

  async function chat(
    system: string,
    user: string,
    maxTokens?: number,
  ): Promise<{ text: string; finishReason: string }> {
    const body: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...providerDefaults(baseUrl),
      ...config.extraParams,
    };
    if (maxTokens) body.max_tokens = maxTokens;
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(config.timeout * 1000),
      });
    } catch (e) {
      throw new AiError(networkMessage(e, config.timeout));
    }
    if (res.status !== 200) throw await httpError(res);
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new AiError("Resposta da API não é JSON.", 200);
    }
    const choice = (data as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] } | null)
      ?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string") {
      throw new AiError(safeText(`Resposta inesperada da API: ${JSON.stringify(data)}`, apiKey), 200);
    }
    const finish = typeof choice?.finish_reason === "string" && choice.finish_reason ? choice.finish_reason : "stop";
    return { text: content, finishReason: finish };
  }

  return { listModels, testConnection, chat };
}
