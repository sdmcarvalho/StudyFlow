import { z } from "zod";

export type LoginInput = { email: string; senha: string; next?: string };
export type CreateUserInput = { nome: string; email: string; senha: string };
export type ResetPasswordInput = { novaSenha: string };
export type ChangePasswordInput = { senhaAtual: string; novaSenha: string; confirmacao: string };

export type ParseResult<T> = { ok: true; data: T } | { ok: false; fieldErrors: Partial<Record<keyof T, string>> };

const SENHA_MIN = 8;
const SENHA_MAX_BYTES = 72; // limite do bcrypt
const NOME_MIN = 2;
const NOME_MAX = 80;
const EMAIL_MAX = 254; // limite do endereço SMTP; também barra entradas gigantes antes de qualquer trabalho
const LOGIN_SENHA_MAX = 1024; // só no login; a regra de 72 bytes vale para senhas novas

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const email = z
  .string({ error: "Informe um e-mail válido." })
  .max(EMAIL_MAX, `Use no máximo ${EMAIL_MAX} caracteres.`)
  .transform(normalizeEmail)
  .pipe(z.email("Informe um e-mail válido."));

const novaSenha = (required: string) =>
  z
    .string({ error: required })
    .min(SENHA_MIN, `Use pelo menos ${SENHA_MIN} caracteres.`)
    .refine((value) => /\p{L}/u.test(value), "Use pelo menos uma letra.")
    .refine((value) => /\d/.test(value), "Use pelo menos um número.")
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= SENHA_MAX_BYTES,
      `Use no máximo ${SENHA_MAX_BYTES} bytes (acentos contam mais de um).`,
    );

const loginSchema = z.object({
  email,
  senha: z
    .string({ error: "Informe a senha." })
    .min(1, "Informe a senha.")
    .max(LOGIN_SENHA_MAX, `Use no máximo ${LOGIN_SENHA_MAX} caracteres.`),
  next: z.string().optional().catch(undefined),
});

const createUserSchema = z.object({
  nome: z
    .string({ error: "Informe o nome." })
    .trim()
    .min(NOME_MIN, `Use pelo menos ${NOME_MIN} caracteres.`)
    .max(NOME_MAX, `Use no máximo ${NOME_MAX} caracteres.`),
  email,
  senha: novaSenha("Informe a senha."),
});

const resetPasswordSchema = z.object({
  novaSenha: novaSenha("Informe a nova senha."),
});

const changePasswordSchema = z
  .object({
    senhaAtual: z.string({ error: "Informe a senha atual." }).min(1, "Informe a senha atual."),
    novaSenha: novaSenha("Informe a nova senha."),
    confirmacao: z.string({ error: "Confirme a nova senha." }),
  })
  .refine((value) => value.confirmacao === value.novaSenha, {
    path: ["confirmacao"],
    message: "A confirmação não confere com a nova senha.",
  });

// Primeiro erro de cada campo vence, no mesmo formato de parseStudyRecordInput.
function parse<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const source = typeof input === "object" && input !== null ? input : {};
  const result = schema.safeParse(source);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Partial<Record<keyof T, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof T;
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return { ok: false, fieldErrors };
}

export const parseLoginInput = (input: unknown) => parse<LoginInput>(loginSchema, input);
export const parseCreateUserInput = (input: unknown) => parse<CreateUserInput>(createUserSchema, input);
export const parseResetPasswordInput = (input: unknown) => parse<ResetPasswordInput>(resetPasswordSchema, input);
export const parseChangePasswordInput = (input: unknown) => parse<ChangePasswordInput>(changePasswordSchema, input);
