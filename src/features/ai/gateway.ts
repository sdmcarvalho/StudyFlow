// Fábrica de produção do cliente de IA: toda chamada ao gateway passa pela política de destino (url-policy).
import { createAiClient, type AiClientConfig } from "./client";
import { createSafeFetch } from "./url-policy";

export function createGatewayClient(config: AiClientConfig): ReturnType<typeof createAiClient> {
  return createAiClient(config, createSafeFetch());
}
