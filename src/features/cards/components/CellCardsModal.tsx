"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { deleteCard, restoreCard } from "../actions";
import type { CardRow } from "../types";
import styles from "./CellCardsModal.module.css";

type CellCardsModalProps = {
  open: boolean;
  cellId: string;
  cards: CardRow[];
  onClose: () => void;
  onEdit: (card: CardRow) => void;
  onDeleted: (card: CardRow) => void;
  onRestored: (card: CardRow) => void;
  onNotify: (message: string, undo?: () => void) => void;
};

export function CellCardsModal({ open, cards, onClose, onEdit, onDeleted, onRestored, onNotify: show }: CellCardsModalProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function handleDelete(card: CardRow) {
    setPendingDelete(card.id);
    try {
      const result = await deleteCard(card.id);
      if (result.ok) {
        onDeleted(card);
        if (cards.length === 1) onClose();
        show("Card excluído.", () => void handleUndoDelete(card.id));
      } else {
        show(result.message ?? "Não foi possível excluir o card.");
      }
    } catch {
      show("Não foi possível excluir o card.");
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleUndoDelete(cardId: string) {
    try {
      const result = await restoreCard(cardId);
      if (!result.ok) {
        show(result.message ?? "Não foi possível restaurar o card.");
      } else { onRestored(result.data); show("Card restaurado."); }
    } catch {
      show("Não foi possível restaurar o card.");
    }
  }

  if (!open) return null;

  return (
    <>
      <Modal open={open} title="Cards da célula" onClose={onClose}>
        <div className={styles.list}>
          {cards.length === 0 ? (
            <p className={styles.empty}>Nenhum card nesta célula.</p>
          ) : (
            cards.map((card) => (
              <div key={card.id} className={styles.item}>
                <div className={styles.content}>
                  <h3 className={styles.tema}>{card.tema}</h3>
                  <p className={styles.pergunta}>{card.pergunta}</p>
                  <p className={styles.resposta}>{card.resposta || <span className={styles.noAnswer}>Sem resposta</span>}</p>
                </div>
                <div className={styles.actions}>
                  <Button variant="secondary" onClick={() => onEdit(card)}>Editar</Button>
                  <Button 
                    variant="danger" 
                    onClick={() => void handleDelete(card)} 
                    disabled={pendingDelete === card.id}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  );
}