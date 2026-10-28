import { describe, expect, it } from "vitest";
import { slugFolderName, uniqueFolderName } from "@/features/auth/folder-name";

describe("slugFolderName", () => {
  it("remove acentos", () => {
    expect(slugFolderName("José da Silva")).toBe("Jose da Silva");
  });

  it("cai em usuario quando nada sobra ou o nome é reservado", () => {
    expect(slugFolderName("***")).toBe("usuario");
    expect(slugFolderName("CON")).toBe("usuario");
  });

  it("tira ponto final e colapsa espaços", () => {
    expect(slugFolderName("Ana.")).toBe("Ana");
    expect(slugFolderName("  Ana    Maria  ")).toBe("Ana Maria");
  });

  it("limita a 40 caracteres sem deixar espaço no fim", () => {
    const result = slugFolderName("a".repeat(39) + " bbbb");
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith(" ")).toBe(false);
  });
});

describe("uniqueFolderName", () => {
  it("devolve o nome quando livre", () => {
    expect(uniqueFolderName("Ana", ["Bia"])).toBe("Ana");
  });

  it("compara sem diferenciar maiúsculas e acrescenta sufixo", () => {
    expect(uniqueFolderName("Ana", ["ana"])).toBe("Ana 2");
    expect(uniqueFolderName("Ana", ["Ana", "ana 2"])).toBe("Ana 3");
  });
});
