import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getStudyDocument } from "@/features/estudo/queries";
import { VozView } from "@/features/voz/components/VozView";
import { getEngine } from "@/features/voz/engine/index";
import { getCurrentUser, requireUser } from "@/lib/current-user";
import styles from "../page.module.css";

type Props = { params: Promise<{ id: string }> };

// generateMetadata e a página leem o mesmo documento: uma consulta por requisição.
const loadDocument = cache(getStudyDocument);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // Sem sessão a página redireciona para /login; os metadados não consultam o documento nem revelam o título.
  if (!(await getCurrentUser())) return { title: "StudyFlow" };
  const doc = await loadDocument(id);
  return { title: doc ? `Voz — ${doc.descricao} · StudyFlow` : "Registro não encontrado · StudyFlow" };
}

export default async function VozPage({ params }: Props) {
  // A sessão (cookie) já torna a página dinâmica, como em /estudo/[id]: não precisa de connection().
  await requireUser();
  const { id } = await params;
  const doc = await loadDocument(id);

  if (!doc) {
    return (
      <div className={styles.notFound}>
        <h1 className={styles.title}>Registro não encontrado</h1>
        <Link href="/estudo" className={styles.back}>
          ← Estudo
        </Link>
      </div>
    );
  }

  const installed = (await getEngine()) !== null;
  return (
    <>
      <PageHeader title="Voz" subtitle={doc.descricao} />
      {/* `key`: abrir outro Estudo recomeça os campos e a tarefa. */}
      <VozView key={doc.id} studyId={doc.id} descricao={doc.descricao} total={doc.cells.length} installed={installed} />
    </>
  );
}
