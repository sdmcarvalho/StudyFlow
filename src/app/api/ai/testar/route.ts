// Testa a conexão com o gateway de IA usando os valores digitados (sem salvar) completados com os salvos.
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

  const resolved = await resolveAiConfig(body, { requireModel: true });
  if (!resolved.ok) return Response.json({ message: resolved.message }, { status: resolved.status });

  return Response.json(await createGatewayClient(resolved.config).testConnection());
}
