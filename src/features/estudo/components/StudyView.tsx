"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { InboxIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { Pagination } from "@/components/ui/Pagination";
import { SearchField } from "@/components/ui/SearchField";
import { Toast, useToast } from "@/components/ui/Toast";
import { deleteStudyRecord, restoreStudyRecord } from "../actions";
import { PAGE_SIZE, buildStudyHref, type ListPage, type StudyRecordRow } from "../list";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { StudyCardList } from "./StudyCardList";
import { StudyFormModal } from "./StudyFormModal";
import { StudyTable } from "./StudyTable";
import styles from "./StudyView.module.css";

const SEARCH_DEBOUNCE_MS = 250;
const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

type StudyViewProps = { page: ListPage; q: string };

export function StudyView({ page, q }: StudyViewProps) {
  const router = useRouter();
  const { toast, show, hide } = useToast();
  const [search, setSearch] = useState(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudyRecordRow | null>(null);
  const [deleting, setDeleting] = useState<StudyRecordRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // A busca vive na URL; o campo só empurra o valor para lá depois de uma pausa na digitação.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => router.replace(buildStudyHref(trimmed, 1)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, q, router]);

  function clearSearch() {
    setSearch("");
    router.replace(buildStudyHref("", 1));
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(record: StudyRecordRow) {
    setEditing(record);
    setFormOpen(true);
  }

  function handleSaved(kind: "created" | "updated") {
    setFormOpen(false);
    router.push(buildStudyHref(q, 1));
    show(kind === "created" ? "Registro criado." : "Registro atualizado.");
  }

  async function undoDelete(id: string) {
    hide();
    const result = await restoreStudyRecord(id);
    if (!result.ok) show(result.message ?? GENERIC_ERROR);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeletePending(true);
    const result = await deleteStudyRecord(target.id);
    setDeletePending(false);
    setDeleting(null);
    if (result.ok) show("Registro excluído.", () => undoDelete(target.id));
    else show(result.message ?? GENERIC_ERROR);
  }

  const hasRecords = page.totalAll > 0;
  const hasResults = page.total > 0;
  const newButton = (
    <Button variant="primary" icon={<PlusIcon />} onClick={openNew}>
      Novo
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Estudo"
        subtitle="Organize seus temas de estudo, acompanhe datas e mantenha tudo em um só lugar."
      />

      <div className={styles.actionBar}>
        {newButton}
        <SearchField value={search} onChange={setSearch} onClear={clearSearch} />
      </div>

      <section className={styles.panel} aria-live="polite">
        {!hasRecords ? (
          <EmptyState
            icon={<InboxIcon />}
            title="Nenhum registro de estudo ainda"
            description="Crie o primeiro tema para começar a organizar seus estudos."
            action={newButton}
          />
        ) : !hasResults ? (
          <EmptyState
            icon={<SearchIcon />}
            title="Nenhum resultado encontrado"
            description={`Não encontramos registros para “${q}”. Tente outro termo.`}
            action={
              <Button variant="secondary" onClick={clearSearch}>
                Limpar pesquisa
              </Button>
            }
          />
        ) : (
          <>
            <StudyTable items={page.items} onEdit={openEdit} onDelete={setDeleting} />
            <StudyCardList items={page.items} onEdit={openEdit} onDelete={setDeleting} />
            <footer className={styles.footer}>
              <span className={styles.count}>
                {q
                  ? `${page.total} resultado${page.total === 1 ? "" : "s"} para “${q}”`
                  : `Mostrando ${page.start + 1}–${Math.min(page.start + PAGE_SIZE, page.total)} de ${page.total} registros`}
              </span>
              <Pagination
                page={page.page}
                totalPages={page.totalPages}
                onPageChange={(next) => router.push(buildStudyHref(q, next))}
              />
            </footer>
          </>
        )}
      </section>

      <StudyFormModal
        open={formOpen}
        record={editing}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        onError={show}
      />
      <DeleteConfirmModal
        record={deleting}
        pending={deletePending}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <Toast message={toast?.message ?? ""} visible={toast !== null} onUndo={toast?.onUndo} />
    </>
  );
}
