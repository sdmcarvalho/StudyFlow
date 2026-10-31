"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { getCardAccuracy, recordCardResult, updateLastTested } from "../actions";
import type { CardRow } from "../types";
import styles from "./TestModal.module.css";
type TestModalProps = {
studyId: string;
studyName: string;
mode: "all" | "half" | "quarter";
onClose: () => void;
};
type CardState = {
card: CardRow;
showAnswer: boolean;
evaluated: boolean;
correct: boolean | null;
accuracy: number | null;
};
export function TestModal({ studyId, studyName, mode, onClose }: TestModalProps) {
const [cards, setCards] = useState<CardState[]>([]);
const [currentIndex, setCurrentIndex] = useState(0);
const [loading, setLoading] = useState(true);
const [completed, setCompleted] = useState(false);
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
// Shuffle array randomly
function shuffleArray<T>(array: T[]): T[] {
const shuffled = [...array];
for (let i = shuffled.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
return shuffled;
}
const handleShowAnswer = () => {
setCards((prev) =>
prev.map((item, idx) => (idx === currentIndex ? { ...item, showAnswer: true } : item))
);
};
const handleEvaluate = async (correct: boolean) => {
const currentCard = cards[currentIndex];
if (!currentCard || currentCard.evaluated) return;
// Record result on server
const result = await recordCardResult(currentCard.card.id, studyId, correct);
if (!result.ok) {
console.error(result.message);
return;
}
// Get updated accuracy for this card
const accuracyResult = await getCardAccuracy(currentCard.card.id);
const accuracy = accuracyResult.ok ? accuracyResult.data.accuracyPercent : null;
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
await updateLastTested(studyId);
setCompleted(true);
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
<div className={styles.overlay} onClick={onClose}>
<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
<div className={styles.header}>
<h2 className={styles.title}>{studyName}</h2>
<button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
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
<div className={styles.overlay} onClick={onClose}>
<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
<div className={styles.header}>
<h2 className={styles.title}>Teste Concluído</h2>
<button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
×
</button>
</div>
<div className={styles.completionMessage}>
<h3>Todos os cards foram respondidos!</h3>
<p>
Você acertou {sessionResults.correct} de {sessionResults.total} cards.
</p>
{accuracy && (
<div className={styles.accuracyDisplay}>
<div className={styles.accuracyLabel}>Precisão da sessão</div>
<div className={styles.accuracyValue}>{accuracy}%</div>
</div>
)}
<Button variant="primary" onClick={onClose}>
Fechar
</Button>
</div>
</div>
</div>
);
}
return (
<div className={styles.overlay} onClick={onClose}>
<div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
<div className={styles.header}>
<h2 className={styles.title}>{studyName}</h2>
<button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
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
<div className={styles.actions}>
<Button variant="secondary" onClick={() => handleEvaluate(true)}>
Acertei
</Button>
<Button variant="secondary" onClick={() => handleEvaluate(false)}>
Errei
</Button>
</div>
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
<Button variant="primary" onClick={handleNext}>
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