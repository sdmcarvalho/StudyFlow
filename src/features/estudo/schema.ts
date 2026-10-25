import { z } from "zod";
import { isValidIsoDate } from "@/lib/dates";

export type StudyRecordInput = {
  descricao: string;
  pasta: string;
  dataInicial: string;
};

export type FieldErrors = Partial<Record<keyof StudyRecordInput, string>>;

const DESCRICAO_MAX = 80;
const PASTA_MAX = 40;

const studyRecordInputSchema = z.object({
  descricao: z
    .string({ error: "Informe uma descrição." })
    .trim()
    .min(1, "Informe uma descrição.")
    .max(DESCRICAO_MAX, `Use no máximo ${DESCRICAO_MAX} caracteres.`),
  pasta: z
    .string({ error: "Informe uma pasta." })
    .trim()
    .min(1, "Informe uma pasta.")
    .max(PASTA_MAX, `Use no máximo ${PASTA_MAX} caracteres.`),
  dataInicial: z
    .string({ error: "Informe uma data válida." })
    .trim()
    .refine(isValidIsoDate, "Informe uma data válida."),
});

export type ParseResult = { ok: true; data: StudyRecordInput } | { ok: false; fieldErrors: FieldErrors };

export function parseStudyRecordInput(input: unknown): ParseResult {
  const source = typeof input === "object" && input !== null ? input : {};
  const result = studyRecordInputSchema.safeParse(source);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof StudyRecordInput;
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return { ok: false, fieldErrors };
}
