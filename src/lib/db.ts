import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

/** Caminhos `file:` são relativos à raiz do projeto, igual ao Prisma CLI (prisma.config.ts). */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida. Copie .env.example para .env.");
  if (!url.startsWith("file:")) return url;
  return pathToFileURL(path.resolve(/*turbopackIgnore: true*/ process.cwd(), url.slice("file:".length))).href;
}

const globalForDb = globalThis as unknown as { db?: PrismaClient };

export const db = globalForDb.db ?? new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl() }) });

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
