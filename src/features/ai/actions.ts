"use server";

import { revalidatePath } from "next/cache";
import { authActionMessage } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { toPublicSettings } from "./queries";
import { normalizeBaseUrl, parseAiSettingsInput } from "./schema";
import type { AiFieldErrors, AiSettingsPublic } from "./types";
import { checkGatewayUrlSyntax } from "./url-policy";

export type SaveAiSettingsResult =
  | { ok: true; data: AiSettingsPublic }
  | { ok: false; fieldErrors?: AiFieldErrors; message?: string };

const MSG_KEY_FOR_NEW_URL = "Digite a API key da nova URL (a chave salva só vale para a URL salva).";

const SAVE_FAILED = { ok: false, message: "Não foi possível salvar a configuração." } as const;

/** Salva a configuração do usuário atual. `apiKey` vazia mantém a chave guardada, mas só se a Base URL não mudou:
 *  com outra URL a chave salva não pode ir junto (seria enviada ao novo destino), então o salvamento é recusado
 *  sem gravar nada. O retorno nunca contém a chave. */
export async function saveAiSettings(input: unknown): Promise<SaveAiSettingsResult> {
  const parsed = parseAiSettingsInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
  const urlProblem = checkGatewayUrlSyntax(parsed.data.baseUrl);
  if (urlProblem !== null) return { ok: false, fieldErrors: { baseUrl: urlProblem } };

  const { apiKey, ...rest } = parsed.data;
  try {
    const userId = await getCurrentUserId();
    const row = await db.$transaction(async (tx) => {
      const saved = await tx.aiSettings.findUnique({ where: { userId } });
      if (
        saved &&
        saved.apiKey !== "" &&
        apiKey === "" &&
        normalizeBaseUrl(saved.baseUrl) !== normalizeBaseUrl(rest.baseUrl)
      ) {
        return null;
      }
      return tx.aiSettings.upsert({
        where: { userId },
        update: { ...rest, ...(apiKey !== "" ? { apiKey } : {}) },
        create: { userId, ...rest, apiKey },
      });
    });
    if (row === null) return { ok: false, fieldErrors: { apiKey: MSG_KEY_FOR_NEW_URL } };
    revalidatePath("/configuracao");
    return { ok: true, data: toPublicSettings(row) };
  } catch (error) {
    const message = authActionMessage(error);
    return message ? { ok: false, message } : SAVE_FAILED;
  }
}
