import { StudyView } from "@/features/estudo/components/StudyView";
import { parsePageParam, parseQueryParam } from "@/features/estudo/list";
import { listStudyRecords } from "@/features/estudo/queries";

export const metadata = { title: "Estudo · StudyFlow" };

export default async function EstudoPage({ searchParams }: PageProps<"/estudo">) {
  const params = await searchParams;
  const q = parseQueryParam(params.q);
  const page = await listStudyRecords({ q, page: parsePageParam(params.page) });

  return <StudyView page={page} q={q} />;
}
