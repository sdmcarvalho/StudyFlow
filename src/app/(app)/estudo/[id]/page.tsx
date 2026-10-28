import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { listStudyCards } from "@/features/cards/queries";
import { EditorView } from "@/features/estudo/editor/components/EditorView";
import { getStudyDocument } from "@/features/estudo/queries";
import { isAuthError, requireUser } from "@/lib/current-user";
import styles from "./page.module.css";

// generateMetadata e a página leem o mesmo documento: uma consulta por requisição.
const loadDocument = cache(getStudyDocument);

export async function generateMetadata({ params }: PageProps<"/estudo/[id]">): Promise<Metadata> {
  const { id } = await params;
  let doc;
  try {
    doc = await loadDocument(id);
  } catch (error) {
    // Sem sessão a página redireciona para /login; aqui só não deixa o erro derrubar os metadados.
    if (isAuthError(error)) return { title: "StudyFlow" };
    throw error;
  }
  return { title: doc ? `${doc.descricao} · StudyFlow` : "Registro não encontrado · StudyFlow" };
}

export default async function EstudoEditorPage({ params }: PageProps<"/estudo/[id]">) {
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

  const cards = await listStudyCards(doc.id);
  // `key`: abrir outro Estudo recomeça o editor (células, salvamento e modo).
  return (
    <EditorView key={doc.id} studyId={doc.id} descricao={doc.descricao} pasta={doc.pasta} initialCells={doc.cells} initialCards={cards} />
  );
}
