import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { requireUser } from "@/lib/current-user";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // O layout não reexecuta em navegação do cliente: cada página também chama requireUser().
  const user = await requireUser();
  return <AppShell user={{ name: user.name, email: user.email, role: user.role }}>{children}</AppShell>;
}
