import { z } from "zod";

export type CardInput = { tema: string; pergunta: string; resposta: string };
export type CardFieldErrors = Partial<Record<keyof CardInput, string>>;

const schema = z.object({
  tema: z.string({ error: "Informe o tema." }).trim().min(1, "Informe o tema.").max(120, "Use no máximo 120 caracteres."),
  pergunta: z.string({ error: "Informe a pergunta." }).trim().min(1, "Informe a pergunta.").max(5_000, "Use no máximo 5 000 caracteres."),
  resposta: z.string().trim().max(5_000, "Use no máximo 5 000 caracteres.").default(""),
});

export function parseCardInput(input: unknown):
  | { ok: true; data: CardInput }
  | { ok: false; fieldErrors: CardFieldErrors } {
  const result = schema.safeParse(input && typeof input === "object" ? input : {});
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: CardFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof CardInput;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { ok: false, fieldErrors };
}
