-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "pasta" TEXT NOT NULL,
    "dataInicial" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "conteudo" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "StudyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudyRecord" ("createdAt", "dataInicial", "deletedAt", "descricao", "id", "pasta", "updatedAt", "userId") SELECT "createdAt", "dataInicial", "deletedAt", "descricao", "id", "pasta", "updatedAt", "userId" FROM "StudyRecord";
DROP TABLE "StudyRecord";
ALTER TABLE "new_StudyRecord" RENAME TO "StudyRecord";
CREATE INDEX "StudyRecord_userId_updatedAt_idx" ON "StudyRecord"("userId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
