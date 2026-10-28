import { authActionMessage } from "@/lib/auth-response";
import { isAuthError } from "@/lib/current-user";
import type { AiClientConfig } from "./client";
import { getAiSettingsWithKey } from "./queries";
import { normalizeBaseUrl, parseExtraParams } from "./schema";

export type ResolveResult = { ok: true; config: AiClientConfig } | { ok: false; status: number; message: string };

const MSG_URL = "Informe uma URL http ou https válida para o gateway.";
const MSG_KEY_WITH_OTHER_URL = "Para testar outra Base URL, digite a API key junto (ou salve antes).";
const MSG_MODEL = "Escolha o modelo antes de testar.";

const bad = (message: string): ResolveResult => ({ ok: false, status: 400, message });

function typedText(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value.trim() : undefined;
}

function typedNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** Junta o que foi digitado (sem salvar) com a configuração salva; o digitado vence.
 *  A chave salva só é usada com a Base URL salva: outra URL exige a chave digitada junto. */
export async function resolveAiConfig(body: unknown, options: { requireModel: boolean }): Promise<ResolveResult> {
  const typed = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  let saved;
  try {
    saved = await getAiSettingsWithKey();
  } catch (error) {
    // Sem sessão válida (ou sem permissão): 401/403 com a mensagem padrão, sem detalhes.
    const message = authActionMessage(error);
    if (message && isAuthError(error)) return { ok: false, status: error.code === "forbidden" ? 403 : 401, message };
    throw error;
  }

  const typedUrl = typedText(typed, "baseUrl");
  const baseUrl = normalizeBaseUrl(typedUrl ?? saved.baseUrl);
  if (baseUrl === null) return bad(MSG_URL);

  const typedKey = typedText(typed, "apiKey") ?? "";
  const urlChanged = typedUrl !== undefined && baseUrl !== normalizeBaseUrl(saved.baseUrl);
  // Sem chave salva não há o que vazar: gateway local sem chave pode ser testado antes de salvar.
  if (urlChanged && typedKey === "" && saved.apiKey !== "") return bad(MSG_KEY_WITH_OTHER_URL);
  const apiKey = typedKey !== "" ? typedKey : saved.apiKey;

  const model = typedText(typed, "model") ?? saved.model;
  if (options.requireModel && model === "") return bad(MSG_MODEL);

  const extra = parseExtraParams(typedText(typed, "extraParams") ?? saved.extraParams);
  if (!extra.ok) return bad(extra.message);

  return {
    ok: true,
    config: {
      baseUrl,
      apiKey,
      model,
      temperature: typedNumber(typed, "temperature") ?? saved.temperature,
      timeout: typedNumber(typed, "timeout") ?? saved.timeout,
      extraParams: extra.value,
    },
  };
}
