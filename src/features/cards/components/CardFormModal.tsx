"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { generateCardAnswer, generateCardQuestion } from "@/features/ai/actions";
import { createCard, updateCard, type CardResult } from "../actions";
import { parseCardInput, type CardFieldErrors } from "../schema";
import type { CardRow } from "../types";
import styles from "./CardFormModal.module.css";

type CardFormModalProps = {
  open: boolean;
  studyId: string;
  cellId: string | null;
  descricaoEstudo: string;
  initialPergunta?: string;
  editingCard?: CardRow | null;
  onClose: () => void;
  onSaved: (card: CardRow) => void;
  onError: (message: string) => void;
  beforeCreate?: () => Promise<boolean>;
};

export function CardFormModal({
  open,
  studyId,
  cellId,
  descricaoEstudo,
  initialPergunta = "",
  editingCard,
  onClose,
  onSaved,
  onError,
  beforeCreate,
}: CardFormModalProps) {
  const [tema, setTema] = useState(editingCard?.tema ?? descricaoEstudo);
  const [pergunta, setPergunta] = useState(editingCard?.pergunta ?? initialPergunta);
  const [resposta, setResposta] = useState(editingCard?.resposta ?? "");
  const [errors, setErrors] = useState<CardFieldErrors>({});
  const [pending, setPending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const mountedRef = useRef(true);
  const respostaRef = useRef<HTMLTextAreaElement>(null);
  const perguntaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const shouldFocusResposta = Boolean(editingCard?.pergunta ?? initialPergunta);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { tema, pergunta, resposta };
    const parsed = parseCardInput(input);
    if (!parsed.ok) {
      setErrors(parsed.fieldErrors);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      let result: CardResult<CardRow>;
      if (editingCard) {
        result = await updateCard(editingCard.id, parsed.data);
      } else if (cellId) {
        if (beforeCreate && !(await beforeCreate())) {
          onError("Salve o documento antes de criar o card.");
          return;
        }
        result = await createCard(studyId, cellId, parsed.data);
      } else {
        onError("Selecione uma célula para criar o card.");
        return;
      }

      if (result.ok) {
        onSaved(result.data);
      } else if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      } else {
        onError(result.message ?? "Não foi possível salvar o card.");
      }
    } catch {
      onError("Não foi possível salvar o card.");
    } finally {
      setPending(false);
    }
  }

  async function handleAi() {
    if (generating) return;
    setGenerating(true);
    try {
      let clipboard = "";
      try {
        clipboard = (await navigator.clipboard.readText()).trim();
      } catch {
        clipboard = "";
      }
      if (!clipboard) {
        onError("Não foi possível ler a área de transferência. Copie o texto (Ctrl+C) e tente de novo.");
        return;
      }

      const question = await generateCardQuestion(clipboard);
      if (!question.ok) {
        onError(question.message);
        return;
      }
      if (mountedRef.current) setPergunta(question.text);

      const answer = await generateCardAnswer(question.text);
      if (!answer.ok) {
        if (mountedRef.current) setResposta("");
        onError(answer.message);
        return;
      }
      if (mountedRef.current) setResposta(answer.text);
    } catch {
      onError("Não foi possível usar a IA. Tente novamente.");
    } finally {
      if (mountedRef.current) setGenerating(false);
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} title={editingCard ? "Editar card" : "Novo card"} onClose={() => { if (!pending) onClose(); }} initialFocusRef={shouldFocusResposta ? respostaRef : perguntaRef}>
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="card-tema">Tema</label>
          <input
            id="card-tema"
            value={tema}
            maxLength={120}
            required
            aria-invalid={errors.tema ? true : undefined}
            aria-describedby={errors.tema ? "card-tema-error" : undefined}
            onChange={(e) => setTema(e.target.value)}
          />
          {errors.tema && <span id="card-tema-error" className={styles.error}>{errors.tema}</span>}
        </div>

        <div className={styles.field}>
          <label htmlFor="card-pergunta">Pergunta</label>
          {!shouldFocusResposta && <small>Cole o texto com Ctrl+V</small>}
          <textarea
            ref={perguntaRef}
            id="card-pergunta"
            value={pergunta}
            maxLength={5000}
            required
            rows={3}
            aria-invalid={errors.pergunta ? true : undefined}
            onChange={(e) => setPergunta(e.target.value)}
          />
          {errors.pergunta && <span className={styles.error}>{errors.pergunta}</span>}
        </div>

        <div className={styles.field}>
          <label htmlFor="card-resposta">Resposta</label>
          <textarea
            ref={respostaRef}
            id="card-resposta"
            value={resposta}
            maxLength={5000}
            rows={3}
            aria-invalid={errors.resposta ? true : undefined}
            onChange={(e) => setResposta(e.target.value)}
          />
          {errors.resposta && <span className={styles.error}>{errors.resposta}</span>}
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={handleAi} type="button" disabled={generating || pending}>
            {generating ? "Gerando…" : "IA"}
          </Button>
          <div className={styles.right}>
            <Button variant="secondary" onClick={onClose} type="button" disabled={pending}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={pending || generating}>
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}