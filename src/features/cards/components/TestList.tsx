"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatDateTimeBR } from "@/lib/dates";
import type { StudyTestSummary } from "../types";
import styles from "./TestList.module.css";
import { TestModal } from "./TestModal";
type TestListProps = {
studies: StudyTestSummary[];
highlightStudyId?: string | null;
scheduleId?: string | null;
};
export function TestList({ studies, highlightStudyId = null, scheduleId = null }: TestListProps) {
const router = useRouter();
const highlightedRow = useRef<HTMLTableRowElement | null>(null);
const [activeStudy, setActiveStudy] = useState<StudyTestSummary | null>(null);
const [testMode, setTestMode] = useState<"all" | "half" | "quarter" | null>(null);
const handleStartTest = (study: StudyTestSummary, mode: "all" | "half" | "quarter") => {
setActiveStudy(study);
setTestMode(mode);
};
const handleCloseModal = () => {
setActiveStudy(null);
setTestMode(null);
// O teste muda "Último teste" e a precisão: busca os dados atualizados do servidor.
router.refresh();
};

useEffect(() => {
highlightedRow.current?.scrollIntoView?.({ block: "center" });
}, [highlightStudyId]);
if (studies.length === 0) {
return (
<div className={styles.container}>
<p>Nenhum estudo com cards cadastrados encontrado.</p>
</div>
);
}
return (
<div className={styles.container}>
<div className={styles.tableWrapper}>
<table className={styles.table}>
<thead>
<tr>
<th>Nome do estudo</th>
<th>Último card criado</th>
<th>Último teste</th>
<th>% de acertos</th>
<th>Número de cards</th>
<th>Ações</th>
</tr>
</thead>
<tbody>
{studies.map((study) => (
<tr
key={study.studyId}
ref={study.studyId === highlightStudyId ? highlightedRow : undefined}
data-highlighted={study.studyId === highlightStudyId ? "true" : undefined}
className={study.studyId === highlightStudyId ? styles.highlighted : undefined}
>
<td className={styles.studyName}>{study.studyName}</td>
<td className={styles.date}>
{study.lastCardCreated ? formatDateTimeBR(study.lastCardCreated) : "—"}
</td>
<td className={styles.date}>
{study.lastTested ? formatDateTimeBR(study.lastTested) : "—"}
</td>
<td className={styles.accuracy}>
{study.accuracyPercent !== null
? `${study.accuracyPercent.toFixed(2)}%`
: "—"}
</td>
<td className={styles.cardCount}>{study.totalCards}</td>
<td>
<div className={styles.actions}>
<Button
variant="secondary"
onClick={() => handleStartTest(study, "all")}
>
Todos
</Button>
<Button
variant="secondary"
onClick={() => handleStartTest(study, "half")}
>
50%
</Button>
<Button
variant="secondary"
onClick={() => handleStartTest(study, "quarter")}
>
25%
</Button>
</div>
</td>
</tr>
))}
</tbody>
</table>
</div>
{activeStudy && testMode && (
<TestModal
studyId={activeStudy.studyId}
studyName={activeStudy.studyName}
mode={testMode}
scheduleId={activeStudy.studyId === highlightStudyId ? scheduleId : null}
onClose={handleCloseModal}
/>
)}
</div>
);
}