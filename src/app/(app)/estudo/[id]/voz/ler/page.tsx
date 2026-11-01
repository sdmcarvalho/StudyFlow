import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getStudyDocument } from "@/features/estudo/queries";
import { ReaderMessage } from "@/features/voz/components/ReaderMessage";
import { ReaderView } from "@/features/voz/components/ReaderView";
import { getEngine } from "@/features/voz/engine/index";
import { resolveReaderRange } from "@/features/voz/reader-cells";
import { getCurrentUser, requireUser } from "@/lib/current-user";
import styles from "../../page.module.css";

type Props = {
  params: Promise<{ id: string }>;
  // Valores crus da URL: texto, lista (`?de=1&de=2`) ou ausente; a validação decide o que vale.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const MSG_NOTHING_TO_READ = "As células escolhidas não têm texto para ler.";

// generateMetadata e a página leem o mesmo documento: uma consulta por requisição.
const loadDocument = cache(getStudyDocument);

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  // Sem sessão a página redireciona para /login; os metadados não consultam o documento nem revelam o título.
  if (!(await getCurrentUser())) return { title: "StudyFlow" };
  const doc = await loadDocument(id);
  return { title: doc ? `Ler — ${doc.descricao} · StudyFlow` : "Registro não encontrado · StudyFlow" };
}

export default async function LerPage({ params, searchParams }: Props) {
  await requireUser();
  const { id } = await params;
  const { de, ate } = await searchParams;
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

  // Intervalo inválido (ou URL forjada): mostra o erro da validação e volta; nunca corrige os valores.
  const range = resolveReaderRange(doc.cells, de, ate);
  if (!range.ok) {
    return (
      <>
        <PageHeader title="Ler" subtitle={doc.descricao} />
        <ReaderMessage studyId={doc.id} messages={range.messages} />
      </>
    );
  }

  if (!range.cells.some((cell) => cell.speakable)) {
    return (
      <>
        <PageHeader title="Ler" subtitle={doc.descricao} />
        <ReaderMessage studyId={doc.id} messages={[MSG_NOTHING_TO_READ]} />
      </>
    );
  }

  const installed = (await getEngine()) !== null;
  return (
    <>
      <PageHeader title="Ler" subtitle={doc.descricao} />
      {/* `key`: outro Estudo ou outro intervalo recomeça a leitura e a tarefa. */}
      <ReaderView
        key={`${doc.id}:${range.cells[0].n}-${range.cells[range.cells.length - 1].n}`}
        studyId={doc.id}
        descricao={doc.descricao}
        cells={range.cells}
        installed={installed}
      />
    </>
  );
}
