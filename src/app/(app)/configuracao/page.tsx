import { connection } from "next/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { AiSettingsForm } from "@/features/ai/components/AiSettingsForm";
import { getAiSettings } from "@/features/ai/queries";

export const metadata = { title: "Configuração · StudyFlow" };

export default async function ConfiguracaoPage() {
  // Lê o banco a cada requisição: sem isto a página seria pré-renderizada no build com os dados do build.
  await connection();
  const settings = await getAiSettings();

  return (
    <>
      <PageHeader title="Configuração" />
      <AiSettingsForm initial={settings} />
    </>
  );
}
