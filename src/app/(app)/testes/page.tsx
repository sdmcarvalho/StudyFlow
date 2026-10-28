import { ComingSoon } from "@/components/layout/ComingSoon";
import { BookmarkCheckIcon } from "@/components/ui/icons";
import { requireUser } from "@/lib/current-user";

export const metadata = { title: "Testes · StudyFlow" };

export default async function TestesPage() {
  await requireUser();
  return <ComingSoon title="Testes" icon={<BookmarkCheckIcon />} />;
}
