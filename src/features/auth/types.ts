export type Role = "SUPER" | "USER";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  folderName: string;
};

/** O que o shell (barra superior) precisa saber do usuário. */
export type ShellUser = Pick<SessionUser, "name" | "email" | "role">;

export type AuthResult<T = undefined, K extends string = string> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors?: Partial<Record<K, string>>; message?: string };
