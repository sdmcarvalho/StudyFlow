"use client";

import { Modal } from "@/components/ui/Modal";
import { EMOJIS } from "../emojis";
import styles from "./EmojiDialog.module.css";

type EmojiDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Recebe o emoji escolhido para inserir na célula. */
  onInsert: (emoji: string) => void;
};

export function EmojiDialog({ open, onClose, onInsert }: EmojiDialogProps) {
  return (
    <Modal open={open} title="Inserir emoji" onClose={onClose}>
      <div className={styles.grid} role="group" aria-label="Emojis">
        {EMOJIS.map(({ emoji, name }) => (
          <button
            key={name}
            type="button"
            className={styles.cell}
            title={name}
            aria-label={name}
            onClick={() => {
              onInsert(emoji);
              onClose();
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </Modal>
  );
}
