import { StudyView } from "@/features/estudo/components/StudyView";
import { ensureUserRoot } from "@/features/estudo/folder-scope";
import { parsePageParam, parseQueryParam } from "@/features/estudo/list";
import { listStudyRecords } from "@/features/estudo/queries";
import { requireUser } from "@/lib/current-user";

export const metadata = { title: "Estudo · StudyFlow" };

export default async function EstudoPage({ searchParams }: PageProps<"/estudo">) {
  const user = await requireUser();
  const params = await searchParams;
  const q = parseQueryParam(params.q);
  const page = await listStudyRecords({ q, page: parsePageParam(params.page) });

  return <StudyView page={page} q={q} baseDir={await ensureUserRoot(user)} />;
}
