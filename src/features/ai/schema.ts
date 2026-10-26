import { z } from "zod";
import type { AiFieldErrors, AiSettingsInput } from "./types";

export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_TIMEOUT = 300;

const MODEL_MAX = 200;
const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;
const TIMEOUT_MIN = 10;
const TIMEOUT_MAX = 600;
const RESERVED_PARAMS = ["model", "messages", "stream"] as const;

const MSG_URL_REQUIRED = "Informe a URL do gateway.";
const MSG_URL_INVALID = "Use uma URL http ou https válida.";
const MSG_TEMPERATURE = `Use um valor entre ${TEMPERATURE_MIN} e ${TEMPERATURE_MAX}.`;
const MSG_TIMEOUT = `Use um valor inteiro entre ${TIMEOUT_MIN} e ${TIMEOUT_MAX}.`;
const MSG_EXTRA_NOT_OBJECT = 'Parâmetros extras devem ser um objeto JSON, por exemplo {"top_p": 0.8}';

export function normalizeBaseUrl(text: string): string | null {
  const trimmed = text.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return trimmed;
}

export type ExtraParamsResult = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

export function parseExtraParams(text: string): ExtraParamsResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `JSON inválido em Parâmetros extras: ${detail}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: MSG_EXTRA_NOT_OBJECT };
  }

  const value = parsed as Record<string, unknown>;
  const reserved = RESERVED_PARAMS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (reserved.length > 0) {
    return { ok: false, message: `Parâmetros extras não podem definir: ${reserved.join(", ")}` };
  }
  return { ok: true, value };
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "…";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

const temperatureSchema = z
  .unknown()
  .transform(toNumber)
  .refine((n) => Number.isFinite(n) && n >= TEMPERATURE_MIN && n <= TEMPERATURE_MAX, MSG_TEMPERATURE);

const timeoutSchema = z
  .unknown()
  .transform(toNumber)
  .refine((n) => Number.isInteger(n) && n >= TIMEOUT_MIN && n <= TIMEOUT_MAX, MSG_TIMEOUT);

const aiSettingsInputSchema = z.object({
  baseUrl: z
    .string({ error: MSG_URL_REQUIRED })
    .trim()
    .min(1, MSG_URL_REQUIRED)
    .transform((value, ctx) => {
      const normalized = normalizeBaseUrl(value);
      if (normalized !== null) return normalized;
      ctx.addIssue({ code: "custom", message: MSG_URL_INVALID });
      return z.NEVER;
    }),
  apiKey: z.string().trim().default(""),
  model: z
    .string()
    .trim()
    .max(MODEL_MAX, `Use no máximo ${MODEL_MAX} caracteres.`)
    .default(""),
  temperature: temperatureSchema,
  timeout: timeoutSchema,
  extraParams: z
    .string()
    .default("")
    .superRefine((value, ctx) => {
      const result = parseExtraParams(value);
      if (!result.ok) ctx.addIssue({ code: "custom", message: result.message });
    }),
});

export type ParseAiSettingsResult = { ok: true; data: AiSettingsInput } | { ok: false; fieldErrors: AiFieldErrors };

export function parseAiSettingsInput(input: unknown): ParseAiSettingsResult {
  const source = typeof input === "object" && input !== null ? input : {};
  const result = aiSettingsInputSchema.safeParse(source);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: AiFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof AiSettingsInput;
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return { ok: false, fieldErrors };
}
