// Lista os modelos do gateway de IA usando os valores digitados (sem salvar) completados com os salvos.
import { createGatewayClient } from "@/features/ai/gateway";
import { resolveAiConfig } from "@/features/ai/resolve-config";
import { rejectUnsafePost } from "@/features/ai/route-guard";

export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUnsafePost(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Envie os dados em JSON." }, { status: 400 });
  }

  const resolved = await resolveAiConfig(body, { requireModel: false });
  if (!resolved.ok) return Response.json({ message: resolved.message }, { status: resolved.status });

  try {
    return Response.json({ models: await createGatewayClient(resolved.config).listModels() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ message: `Não foi possível listar os modelos: ${detail}` }, { status: 502 });
  }
}
