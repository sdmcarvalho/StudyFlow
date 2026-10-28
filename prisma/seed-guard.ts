import { db } from "../src/lib/db";

/**
 * Apaga os dados de estudo do usuário antes do seed recriar os exemplos. Se ele já tem qualquer
 * Estudo, Card, resultado ou agenda (inclusive da lixeira), recusa — esses são dados reais — a menos
 * que `force` seja verdadeiro (SEED_FORCE=1, só para bancos de teste). Tudo numa transação, na ordem
 * das chaves estrangeiras: ou apaga tudo, ou nada.
 */
export async function clearUserDataForSeed(userId: string, options: { force: boolean }): Promise<void> {
  const where = { userId };
  const [studies, cards, results, schedules] = await Promise.all([
    db.studyRecord.count({ where }),
    db.card.count({ where }),
    db.cardResult.count({ where }),
    db.schedule.count({ where }),
  ]);

  if (!options.force && studies + cards + results + schedules > 0) {
    throw new Error(
      `O seed apagaria os dados reais deste usuário (${studies} estudos, ${cards} cards, ${results} resultados, ` +
        `${schedules} agendamentos). Use SEED_FORCE=1 só em bancos de teste.`,
    );
  }

  await db.$transaction([
    db.cardResult.deleteMany({ where }),
    db.schedule.deleteMany({ where }),
    db.card.deleteMany({ where }),
    db.studyRecord.deleteMany({ where }), // todas, inclusive as da lixeira
  ]);
}
