import { ComingSoon } from "@/components/layout/ComingSoon";
import { CalendarIcon } from "@/components/ui/icons";
import { requireUser } from "@/lib/current-user";

export const metadata = { title: "Agenda · StudyFlow" };

export default async function AgendaPage() {
  await requireUser();
  return <ComingSoon title="Agenda" icon={<CalendarIcon />} />;
}
