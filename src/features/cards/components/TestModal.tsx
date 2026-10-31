"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { checkStudyHasActiveSchedules, completeSchedule, createSchedules } from "@/features/agenda/actions";
import { ScheduleConfirmModal } from "@/features/agenda/components/ScheduleConfirmModal";
import { getCardAccuracy, recordCardResult, updateLastTested } from "../actions";
import type { CardRow } from "../types";
import styles from "./TestModal.module.css";
type TestModalProps = {
studyId: string;
studyName: string;
mode: "all" | "half" | "quarter";
scheduleId?: string | null;
onClose: () => void;
};
type CardState = {
card: CardRow;
showAnswer: boolean;
evaluated: boolean;
correct: boolean | null;
accuracy: number | null;
};
const ACTIVE_WARNING = "Este estudo já possui agendamentos ativos. Confirmar cria novos agendamentos mesmo assim.";
const CHECK_ERROR = "Não foi possível verificar os agendamentos deste estudo.";
const SAVE_WARNING = "Teste concluído, mas não foi possível registrar o resultado no histórico/na agenda.";
// Uma ação que falha ou lança não pode impedir a tela de conclusão: devolve só se deu certo.
async function succeeded(run: () => Promise<{ ok: boolean }>): Promise<boolean> {
try {
return (await run()).ok;
} catch {
return false;
}
}
// Shuffle array randomly
function shuffleArray<T>(array: T[]): T[] {
const shuffled = [...array];
for (let i = shuffled.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
return shuffled;
}
export function TestModal({ studyId, studyName, mode, scheduleId, onClose }: TestModalProps) {
const [cards, setCards] = useState<CardState[]>([]);
const [currentIndex, setCurrentIndex] = useState(0);
const [loading, setLoading] = useState(true);
const [completed, setCompleted] = useState(false);
const [finishing, setFinishing] = useState(false);
const [saveWarning, setSaveWarning] = useState(false);
const [error, setError] = useState<string | null>(null);
const busyRef = useRef(false);
const [checkingSchedules, setCheckingSchedules] = useState(false);
const [confirmOpen, setConfirmOpen] = useState(false);
const [hasActiveSchedules, setHasActiveSchedules] = useState(false);
const [scheduled, setScheduled] = useState(false);
const [scheduleError, setScheduleError] = useState<string | null>(null);
const checkingRef = useRef(false);
const [sessionResults, setSessionResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
// Load cards via API
useEffect(() => {
let cancelled = false;
async function loadCards() {
try {
const response = await fetch(`/api/cards?studyId=${encodeURIComponent(studyId)}`);
if (!response.ok) throw new Error("Falha ao carregar cards");
const allCards: CardRow[] = await response.json();
if (cancelled) return;
// Select cards based on mode
let selectedCards = [...allCards];
if (mode === "half") {
const count = Math.ceil(allCards.length / 2);
selectedCards = shuffleArray(allCards).slice(0, count);
} else if (mode === "quarter") {
const count = Math.ceil(allCards.length / 4);
selectedCards = shuffleArray(allCards).slice(0, count);
} else {
selectedCards = shuffleArray(allCards);
}
setCards(selectedCards.map((card) => ({ card, showAnswer: false, evaluated: false, correct: null, accuracy: null })));
setLoading(false);
} catch (error) {
console.error(error);
setLoading(false);
}
}
loadCards();
return () => {
cancelled = true;
};
}, [studyId, mode]);
const handleShowAnswer = () => {
setCards((prev) =>
prev.map((item, idx) => (idx === currentIndex ? { ...item, showAnswer: true } : item))
);
};
const handleEvaluate = async (correct: boolean) => {
const currentCard = cards[currentIndex];
if (!currentCard || currentCard.evaluated || busyRef.current) return;
busyRef.current = true;
try {
setError(null);
// Record result on server
let result;
try {
result = await recordCardResult(currentCard.card.id, studyId, correct);
} catch {
result = { ok: false as const, message: "Não foi possível registrar o resultado." };
}
if (!result.ok) {
setError(result.message ?? "Não foi possível registrar o resultado.");
return;
}
// Get updated accuracy for this card
let accuracy: number | null = null;
try {
const accuracyResult = await getCardAccuracy(currentCard.card.id);
accuracy = accuracyResult.ok ? accuracyResult.data.accuracyPercent : null;
} catch {
accuracy = null;
}
// Update local state
setCards((prev) =>
prev.map((item, idx) =>
idx === currentIndex ? { ...item, evaluated: true, correct, accuracy } : item
)
);
setSessionResults((prev) => ({
correct: prev.correct + (correct ? 1 : 0),
total: prev.total + 1,
}));
} finally {
busyRef.current = false;
}
};
const handleNext = () => {
if (currentIndex < cards.length - 1) {
setCurrentIndex((prev) => prev + 1);
} else {
// Session completed
finishSession();
}
};
const finishSession = async () => {
if (busyRef.current) return;
busyRef.current = true;
setFinishing(true);
const saved = await Promise.all([
succeeded(() => updateLastTested(studyId)),
scheduleId ? succeeded(() => completeSchedule(scheduleId)) : Promise.resolve(true),
]);
setSaveWarning(saved.includes(false));
setFinishing(false);
setCompleted(true);
};
// Enquanto o salvamento final roda, fechar dispararia o router.refresh() do pai antes das ações terminarem.
const handleClose = () => {
if (finishing) return;
onClose();
};
const handleSchedule = async () => {
if (checkingRef.current || scheduled) return;
checkingRef.current = true;
setCheckingSchedules(true);
setScheduleError(null);
try {
setHasActiveSchedules(await checkStudyHasActiveSchedules(studyId));
setConfirmOpen(true);
} catch {
setScheduleError(CHECK_ERROR);
} finally {
checkingRef.current = false;
setCheckingSchedules(false);
}
};
const handleConfirmSchedule = async (): Promise<{ ok: true } | { ok: false; message: string }> => {
const result = await createSchedules({ studyId, studyName, force: hasActiveSchedules });
if (!result.ok) return { ok: false, message: result.message };
setScheduled(true);
return { ok: true };
};
const currentCard = cards[currentIndex];
const accuracy =
sessionResults.total > 0 ? ((sessionResults.correct / sessionResults.total) * 100).toFixed(1) : null;
if (loading) {
return (
<div className={styles.overlay}>
<div className={styles.modal}>
<p>Carregando cards...</p>
</div>
</div>
);
}
if (cards.length === 0) {
return (
<div className={styles.overlay} onClick={handleClose}>
<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
<div className={styles.header}>
<h2 className={styles.title}>{studyName}</h2>
<button className={styles.closeBtn} onClick={handleClose} disabled={finishing} aria-label="Fechar">
×
</button>
</div>
<p>Nenhum card encontrado para este estudo.</p>
</div>
</div>
);
}
if (completed) {
return (
<div className={styles.overlay} onClick={handleClose}>
<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
<div className={styles.header}>
<h2 className={styles.title}>Teste Concluído</h2>
<button className={styles.closeBtn} onClick={handleClose} disabled={finishing} aria-label="Fechar">
×
</button>
</div>
<div className={styles.completionMessage}>
<h3>Todos os cards foram respondidos!</h3>
<p>
Você acertou {sessionResults.correct} de {sessionResults.total} cards.
</p>
{saveWarning && <p role="status">{SAVE_WARNING}</p>}
{accuracy && (
<div className={styles.accuracyDisplay}>
<div className={styles.accuracyLabel}>Precisão da sessão</div>
<div className={styles.accuracyValue}>{accuracy}%</div>
</div>
)}
{scheduleError && <p role="alert" className={styles.error}>{scheduleError}</p>}
{scheduled && <p role="status">Agendamentos criados.</p>}
<div className={styles.actions}>
<Button variant="secondary" onClick={handleSchedule} disabled={scheduled || checkingSchedules}>
Agendar revisões
</Button>
<Button variant="primary" onClick={onClose}>
Fechar
</Button>
</div>
<ScheduleConfirmModal
open={confirmOpen}
studyId={studyId}
studyName={studyName}
warning={hasActiveSchedules ? ACTIVE_WARNING : undefined}
onClose={() => setConfirmOpen(false)}
onConfirm={handleConfirmSchedule}
/>
</div>
</div>
</div>
);
}
return (
<div className={styles.overlay} onClick={handleClose}>
<div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
<div className={styles.header}>
<h2 className={styles.title}>{studyName}</h2>
<button className={styles.closeBtn} onClick={handleClose} disabled={finishing} aria-label="Fechar">
×
</button>
</div>
<div className={styles.progress}>
Card {currentIndex + 1} de {cards.length}
</div>
<div className={styles.questionCard}>
<div className={styles.questionLabel}>Pergunta</div>
<p className={styles.questionText}>{currentCard.card.pergunta}</p>
</div>
{!currentCard.showAnswer ? (
<div className={styles.actions}>
<Button variant="primary" onClick={handleShowAnswer}>
Ver resposta
</Button>
</div>
) : (
<>
<div className={styles.answerSection}>
<div className={styles.answerCard}>
<div className={styles.answerLabel}>Resposta</div>
<p className={styles.answerText}>{currentCard.card.resposta}</p>
</div>
</div>
{!currentCard.evaluated ? (
<>
{error && <p role="alert" className={styles.error}>{error}</p>}
<div className={styles.actions}>
<Button variant="secondary" onClick={() => handleEvaluate(true)}>
Acertei
</Button>
<Button variant="secondary" onClick={() => handleEvaluate(false)}>
Errei
</Button>
</div>
</>
) : (
<>
<div className={styles.accuracyDisplay}>
<div className={styles.accuracyLabel}>Seu resultado neste card</div>
<div className={styles.accuracyValue}>
{currentCard.correct ? "Acertou" : "Errou"}
</div>
{currentCard.accuracy !== null && (
<div className={styles.accuracyLabel}>
Precisão histórica: {currentCard.accuracy.toFixed(1)}%
</div>
)}
</div>
<div className={styles.actions}>
<Button variant="primary" onClick={handleNext} disabled={finishing}>
{currentIndex < cards.length - 1 ? "Próximo" : "Finalizar"}
</Button>
</div>
</>
)}
</>
)}
</div>
</div>
);
}