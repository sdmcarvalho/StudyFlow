import { connection } from "next/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { AiSettingsForm } from "@/features/ai/components/AiSettingsForm";
import { getAiSettings } from "@/features/ai/queries";
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm";
import { VoiceSettingsForm } from "@/features/voz/components/VoiceSettingsForm";
import { listInstalledVoices } from "@/features/voz/engine/catalog";
import { getVoiceSettings } from "@/features/voz/queries";
import { CleanupPanel } from "@/features/voz/components/CleanupPanel";
import { requireUser } from "@/lib/current-user";

export const metadata = { title: "Configuração · StudyFlow" };

export default async function ConfiguracaoPage() {
  const user = await requireUser();
  // Lê o banco a cada requisição: sem isto a página seria pré-renderizada no build com os dados do build.
  await connection();
  const settings = await getAiSettings();
  const voiceSettings = await getVoiceSettings();
  const voices = await listInstalledVoices();

  return (
    <>
      <PageHeader title="Configuração" />
      <AiSettingsForm initial={settings} />
      <VoiceSettingsForm initial={voiceSettings} voices={voices} />
      <ChangePasswordForm />
      {/* Só o superusuário recebe o painel: a verificação é aqui, no servidor, e a ação confere de novo. */}
      {user.role === "SUPER" ? <CleanupPanel /> : null}
    </>
  );
}
