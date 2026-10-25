import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { EditorView } from "@/features/estudo/editor/components/EditorView";
import { getStudyDocument } from "@/features/estudo/queries";
import styles from "./page.module.css";

// generateMetadata e a página leem o mesmo documento: uma consulta por requisição.
const loadDocument = cache(getStudyDocument);

export async function generateMetadata({ params }: PageProps<"/estudo/[id]">): Promise<Metadata> {
  const { id } = await params;
  const doc = await loadDocument(id);
  return { title: doc ? `${doc.descricao} · StudyFlow` : "Registro não encontrado · StudyFlow" };
}

export default async function EstudoEditorPage({ params }: PageProps<"/estudo/[id]">) {
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

  // `key`: abrir outro Estudo recomeça o editor (células, salvamento e modo).
  return (
    <EditorView key={doc.id} studyId={doc.id} descricao={doc.descricao} pasta={doc.pasta} initialCells={doc.cells} />
  );
}
