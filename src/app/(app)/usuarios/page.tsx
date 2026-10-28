import { connection } from "next/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { listUsers } from "@/features/usuarios/queries";
import { UsersView } from "@/features/usuarios/components/UsersView";
import { requireSuperuser } from "@/lib/current-user";

export const metadata = { title: "Usuários · StudyFlow" };

export default async function UsuariosPage() {
  // Usuário comum recebe 404 aqui, antes de qualquer consulta; sem sessão, vai para /login.
  await requireSuperuser();
  // Lê o banco a cada requisição: sem isto a página seria pré-renderizada no build com os dados do build.
  await connection();
  const users = await listUsers();

  return (
    <>
      <PageHeader title="Usuários" />
      <UsersView users={users} />
    </>
  );
}
