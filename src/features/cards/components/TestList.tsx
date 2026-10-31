"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDateBR } from "@/lib/dates";
import type { StudyTestSummary } from "../types";
import styles from "./TestList.module.css";
import { TestModal } from "./TestModal";
type TestListProps = {
studies: StudyTestSummary[];
};
export function TestList({ studies }: TestListProps) {
const [activeStudy, setActiveStudy] = useState<StudyTestSummary | null>(null);
const [testMode, setTestMode] = useState<"all" | "half" | "quarter" | null>(null);
const handleStartTest = (study: StudyTestSummary, mode: "all" | "half" | "quarter") => {
setActiveStudy(study);
setTestMode(mode);
};
const handleCloseModal = () => {
setActiveStudy(null);
setTestMode(null);
};
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
<tr key={study.studyId}>
<td className={styles.studyName}>{study.studyName}</td>
<td className={styles.date}>
{study.lastCardCreated ? formatDateBR(study.lastCardCreated) : "—"}
</td>
<td className={styles.date}>
{study.lastTested ? formatDateBR(study.lastTested) : "—"}
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
onClose={handleCloseModal}
/>
)}
</div>
);
}