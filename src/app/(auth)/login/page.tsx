import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { safeNext } from "@/features/auth/next-url";
import { getCurrentUser } from "@/lib/current-user";

export const metadata = { title: "Entrar · StudyFlow" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const target = typeof next === "string" ? next : undefined;

  // Quem já tem sessão válida não precisa ver o formulário.
  if (await getCurrentUser()) redirect(safeNext(target));

  return <LoginForm next={target} />;
}
