import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudyFormModal } from "@/features/estudo/components/StudyFormModal";

vi.mock("@/features/estudo/actions", () => ({ createStudyRecord: vi.fn(), updateStudyRecord: vi.fn() }));

function renderNew(baseDir: string) {
  render(<StudyFormModal open record={null} baseDir={baseDir} onClose={vi.fn()} onSaved={vi.fn()} onError={vi.fn()} />);
  return screen.getByLabelText("Pasta") as HTMLInputElement;
}

describe("StudyFormModal: pasta inicial de um novo Estudo", () => {
  it("base POSIX recebe '/' no fim", () => {
    expect(renderNew("/var/sf/ana").value).toBe("/var/sf/ana/");
  });

  it("base Windows recebe a barra invertida no fim", () => {
    expect(renderNew("C:\\Estudos").value).toBe("C:\\Estudos\\");
  });

  it("raiz de unidade não ganha barra duplicada", () => {
    expect(renderNew("D:\\").value).toBe("D:\\");
  });
});
