import type { Role } from "@/features/auth/types";

/** Uma linha da tela Usuários. Contagens: Estudos e Cards não excluídos; Agenda inteira. Nunca carrega conteúdo. */
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  /** ISO 8601. */
  createdAt: string;
  studyCount: number;
  cardCount: number;
  scheduleCount: number;
};
