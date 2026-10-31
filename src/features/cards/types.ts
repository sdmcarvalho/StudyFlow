export type CardRow = {
  id: string;
  cellId: string;
  tema: string;
  pergunta: string;
  resposta: string;
  createdAt: string; // ISO
};

/** Resumo de um Estudo na tela de Testes (datas ISO). */
export type StudyTestSummary = {
  studyId: string;
  studyName: string;
  lastCardCreated: string | null;
  lastTested: string | null;
  totalCards: number;
  correctAnswers: number;
  totalAttempts: number;
  accuracyPercent: number | null;
};
