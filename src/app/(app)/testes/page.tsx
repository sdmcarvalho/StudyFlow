import { PageHeader } from "@/components/layout/PageHeader";
import { TestList } from "@/features/cards/components/TestList";
import { listUserSchedules } from "@/features/agenda/actions";
import { listStudyTestSummaries } from "@/features/cards/queries";
import { resolveTestTarget } from "@/features/cards/test-target";
import { requireUser } from "@/lib/current-user";

export const metadata = { title: "Testes · StudyFlow" };

export default async function TestesPage({ searchParams }: PageProps<"/testes">) {
  await requireUser();
  const [studies, schedules] = await Promise.all([listStudyTestSummaries(), listUserSchedules()]);
  const { highlightStudyId, scheduleId } = resolveTestTarget(await searchParams, studies, schedules);

  return (
    <>
      <PageHeader title="Testes" />
      <TestList studies={studies} highlightStudyId={highlightStudyId} scheduleId={scheduleId} />
    </>
  );
}
