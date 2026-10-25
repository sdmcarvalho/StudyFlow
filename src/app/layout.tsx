import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyFlow",
  description: "Organize seus temas de estudo, acompanhe datas e mantenha tudo em um só lugar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
