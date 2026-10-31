import { PageHeader } from "@/components/layout/PageHeader";
import { listUserSchedules } from "@/features/agenda/actions";
import { ScheduleList } from "@/features/agenda/components/ScheduleList";
import { requireUser } from "@/lib/current-user";

export const metadata = { title: "Agenda · StudyFlow" };

export default async function AgendaPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Agenda" />
      <ScheduleList schedules={await listUserSchedules()} />
    </>
  );
}
