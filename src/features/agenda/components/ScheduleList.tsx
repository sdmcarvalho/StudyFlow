"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDateBR } from "@/lib/dates";
import type { ScheduleRow } from "../types";
import { ScheduleDeleteModal } from "./ScheduleDeleteModal";
import buttonStyles from "@/components/ui/Button.module.css";
import styles from "./ScheduleList.module.css";

type FilterType = "todos" | "atrasados" | "hoje" | "semana" | "mes";

type ScheduleListProps = {
schedules: ScheduleRow[];
};

export function ScheduleList({ schedules }: ScheduleListProps) {
const router = useRouter();
const [activeFilter, setActiveFilter] = useState<FilterType>("todos");
const [toDelete, setToDelete] = useState<ScheduleRow | null>(null);

const today = new Date();
today.setHours(0, 0, 0, 0);

const startOfWeek = new Date(today);
startOfWeek.setDate(today.getDate() - today.getDay()); // Domingo

const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const filteredSchedules = schedules.filter((schedule) => {
const reviewDate = new Date(schedule.reviewDate + "T00:00:00");
reviewDate.setHours(0, 0, 0, 0);

if (activeFilter === "todos") return true;
if (activeFilter === "atrasados") return reviewDate < today && schedule.status === "Ativo";
if (activeFilter === "hoje") return reviewDate.getTime() === today.getTime();
if (activeFilter === "semana") {
const endOfWeek = new Date(startOfWeek);
endOfWeek.setDate(startOfWeek.getDate() + 6);
return reviewDate >= startOfWeek && reviewDate <= endOfWeek;
}
if (activeFilter === "mes") {
return reviewDate >= startOfMonth && reviewDate.getMonth() === today.getMonth();
}
return true;
});

return (
<div className={styles.container}>
<div className={styles.filters}>
<Button
variant={activeFilter === "atrasados" ? "primary" : "secondary"}
className={activeFilter === "atrasados" ? "" : styles.filterBtn}
onClick={() => setActiveFilter("atrasados")}
>
Atrasados
</Button>
<Button
variant={activeFilter === "hoje" ? "primary" : "secondary"}
className={activeFilter === "hoje" ? "" : styles.filterBtn}
onClick={() => setActiveFilter("hoje")}
>
Hoje
</Button>
<Button
variant={activeFilter === "semana" ? "primary" : "secondary"}
className={activeFilter === "semana" ? "" : styles.filterBtn}
onClick={() => setActiveFilter("semana")}
>
Semana
</Button>
<Button
variant={activeFilter === "mes" ? "primary" : "secondary"}
className={activeFilter === "mes" ? "" : styles.filterBtn}
onClick={() => setActiveFilter("mes")}
>
Mês
</Button>
<Button
variant={activeFilter === "todos" ? "primary" : "secondary"}
className={activeFilter === "todos" ? "" : styles.filterBtn}
onClick={() => setActiveFilter("todos")}
>
Todos
</Button>
</div>

{filteredSchedules.length === 0 ? (
<div className={styles.emptyState}>
<p>Nenhum agendamento encontrado para este filtro.</p>
</div>
) : (
<div className={styles.tableWrapper}>
<table className={styles.table}>
<thead>
<tr>
<th>Data Revisão</th>
<th>Nome do Estudo</th>
<th>Data Criação</th>
<th>Sessão</th>
<th>Status</th>
<th>Ações</th>
</tr>
</thead>
<tbody>
{filteredSchedules.map((schedule) => (
<tr key={schedule.id}>
<td className={styles.date}>{formatDateBR(schedule.reviewDate)}</td>
<td className={styles.studyName}>{schedule.studyName}</td>
<td className={styles.date}>{formatDateBR(schedule.createdAt)}</td>
<td>{schedule.session}</td>
<td>
<span
className={`${styles.status} ${
schedule.status === "Ativo" ? styles.statusActive : styles.statusCompleted
}`}
>
{schedule.status}
</span>
</td>
<td>
<div className={styles.actions}>
{schedule.status === "Ativo" && (
<Link
className={`${buttonStyles.btn} ${buttonStyles.secondary} ${styles.doLink}`}
aria-label={`Fazer teste de ${schedule.studyName}`}
href={`/testes?study=${encodeURIComponent(schedule.studyId)}&schedule=${encodeURIComponent(schedule.id)}`}
>
Fazer
</Link>
)}
<Button
variant="secondary"
className={styles.deleteBtn}
aria-label={`Excluir agendamento de ${schedule.studyName}`}
onClick={() => setToDelete(schedule)}
>
Excluir
</Button>
</div>
</td>
</tr>
))}
</tbody>
</table>
</div>
)}
<ScheduleDeleteModal schedule={toDelete} onClose={() => setToDelete(null)} onDeleted={() => router.refresh()} />
</div>
);
}