// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// O motor falso da Voz (STUDYFLOW_VOZ_ENGINE=fake) só existe para testes e e2e. O e2e roda `next start`
// (NODE_ENV=production), então o NODE_ENV não serve de trava: a garantia é a produção nunca definir a variável.
describe("ecosystem.config.js", () => {
  const source = fs.readFileSync(path.resolve("ecosystem.config.js"), "utf8");

  it("nunca define STUDYFLOW_VOZ_ENGINE (o motor falso não pode ser configurado em produção)", () => {
    expect(source).not.toContain("STUDYFLOW_VOZ_ENGINE");
  });

  it("o arquivo lido é mesmo o do PM2 do StudyFlow", () => {
    expect(source).toContain('name: "studyflow"');
  });
});
