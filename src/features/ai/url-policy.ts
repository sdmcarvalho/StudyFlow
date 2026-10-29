// Política de destino do gateway de IA (contra SSRF). Só servidor.
// O servidor faz `fetch` para a Base URL que o usuário digitou; publicado, isso abriria a rede interna da VPS
// (loopback, rede privada, metadados da nuvem). Regras: só https, e o nome tem de resolver SOMENTE para
// endereços públicos. A checagem do DNS acontece no `lookup` da própria conexão (o endereço validado é o
// usado: sem segunda resolução, sem janela de DNS rebinding). `STUDYFLOW_AI_ALLOW_PRIVATE=1` relaxa tudo
// (gateway local no computador de desenvolvimento).
import { promises as dns } from "node:dns";
import { isIPv4, isIPv6, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

export const GATEWAY_BLOCKED_MESSAGE = "Endereço do gateway não permitido.";

const MSG_URL_INVALID = "Use uma URL https válida para o gateway.";

export class BlockedDestinationError extends Error {
  constructor() {
    super(GATEWAY_BLOCKED_MESSAGE);
    this.name = "BlockedDestinationError";
  }
}

export function allowPrivateDestinations(): boolean {
  return process.env.STUDYFLOW_AI_ALLOW_PRIVATE === "1";
}

// ---------------------------------------------------------------- endereços

/** [base, prefixo] dos blocos IPv4 que não são internet pública. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "esta rede"
  ["10.0.0.0", 8], // privado
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (metadados da nuvem)
  ["172.16.0.0", 12], // privado
  ["192.0.0.0", 24], // atribuições do IETF
  ["192.0.2.0", 24], // documentação
  ["192.88.99.0", 24], // relay 6to4 (obsoleto)
  ["192.168.0.0", 16], // privado
  ["198.18.0.0", 15], // testes de desempenho
  ["198.51.100.0", 24], // documentação
  ["203.0.113.0", 24], // documentação
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservado (inclui 255.255.255.255)
];

function v4ToInt(address: string): number {
  return address.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

const BLOCKED_V4_RANGES = BLOCKED_V4.map(([base, prefix]) => {
  const size = 2 ** (32 - prefix);
  const start = v4ToInt(base);
  return { start, end: start + size - 1 };
});

function isBlockedV4Int(value: number): boolean {
  return BLOCKED_V4_RANGES.some(({ start, end }) => value >= start && value <= end);
}

/** Os 8 grupos de 16 bits de um IPv6 já validado por `isIPv6` (aceita o IPv4 pontuado no fim). */
function v6Groups(address: string): number[] {
  let text = address;
  const lastColon = text.lastIndexOf(":");
  const last = text.slice(lastColon + 1);
  if (last.includes(".")) {
    // a.b.c.d no fim vira os dois grupos hexadecimais equivalentes
    const v4 = v4ToInt(last);
    text = `${text.slice(0, lastColon + 1)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const [head, rest] = text.includes("::") ? text.split("::") : [text, ""];
  const parse = (part: string) => (part ? part.split(":").map((g) => parseInt(g, 16)) : []);
  const left = parse(head);
  const right = parse(rest);
  return [...left, ...new Array<number>(Math.max(0, 8 - left.length - right.length)).fill(0), ...right];
}

function isBlockedV6(address: string): boolean {
  const g = v6Groups(address);
  const embeddedV4 = g[6] * 65536 + g[7];
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);

  // IPv4 mapeado (::ffff:a.b.c.d) e traduzido (::ffff:0:a.b.c.d): valem as regras do IPv4.
  if (zero(0, 5) && g[5] === 0xffff) return isBlockedV4Int(embeddedV4);
  if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return isBlockedV4Int(embeddedV4);
  // NAT64 bem conhecido (64:ff9b::/96): o IPv4 embutido decide. O de uso local (64:ff9b:1::/48) é bloqueado.
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return isBlockedV4Int(embeddedV4);
  // Só unicast global (2000::/3). Fora dele: ::, ::1, IPv4-compatível, ULA fc00::/7, link-local fe80::/10,
  // site-local fec0::/10, multicast ff00::/8, 64:ff9b:1::/48, 100::/64 etc.
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo 2001::/32 (embute IPv4)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentação
  if (g[0] === 0x2002) return true; // 6to4 2002::/16 (embute IPv4)
  if (g[0] === 0x3fff && g[1] < 0x1000) return true; // documentação 3fff::/20
  return false;
}

/** `true` quando o literal IPv4/IPv6 NÃO é internet pública. Aceita colchetes e zona (`%eth0`).
 *  Texto que não é IP também conta como bloqueado (na dúvida, não conecta). */
export function isBlockedAddress(address: string): boolean {
  let text = address.trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  if (isIPv4(text)) return isBlockedV4Int(v4ToInt(text));
  if (isIPv6(text)) return isBlockedV6(text);
  return true;
}

// ---------------------------------------------------------------- URL

/** Problema da URL do gateway (mensagem para o usuário), ou `null` se ela pode ser usada.
 *  Só a sintaxe: o nome ainda passa pela checagem do DNS na hora de conectar. */
export function checkGatewayUrlSyntax(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return MSG_URL_INVALID;
  }
  const relaxed = allowPrivateDestinations();
  if (relaxed) return parsed.protocol === "https:" || parsed.protocol === "http:" ? null : MSG_URL_INVALID;
  if (parsed.protocol !== "https:") return parsed.protocol === "http:" ? GATEWAY_BLOCKED_MESSAGE : MSG_URL_INVALID;

  const host = parsed.hostname.toLowerCase();
  if (host === "" || host.endsWith(".")) return GATEWAY_BLOCKED_MESSAGE;
  if (host === "localhost" || host.endsWith(".localhost")) return GATEWAY_BLOCKED_MESSAGE;
  // `new URL` já normaliza 2130706433, 0x7f.1 etc. para a forma pontuada, e IPv6 vem entre colchetes.
  const bare = host.startsWith("[") ? host.slice(1, -1) : host;
  if ((isIPv4(bare) || isIPv6(bare)) && isBlockedAddress(bare)) return GATEWAY_BLOCKED_MESSAGE;
  return null;
}

// ---------------------------------------------------------------- lookup

export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;

const defaultResolve: Resolver = (host) => dns.lookup(host, { all: true, order: "verbatim" });

function notFound(hostname: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND", hostname });
}

/** `lookup` compatível com `net.connect`: resolve UMA vez, recusa a resposta inteira se qualquer endereço for
 *  bloqueado e entrega à conexão exatamente o(s) endereço(s) validado(s). */
export function createSafeLookup(resolve: Resolver = defaultResolve): LookupFunction {
  return function lookup(hostname, options, callback) {
    // Em erro o Node chama o callback só com o erro (como o `dns.lookup` original).
    const fail = (error: Error) => (callback as (error: Error) => void)(error);
    const wanted = options?.family as number | string | undefined;
    const family = wanted === 4 || wanted === "IPv4" ? 4 : wanted === 6 || wanted === "IPv6" ? 6 : 0;
    resolve(hostname).then(
      (answers) => {
        if (!allowPrivateDestinations() && answers.some((a) => isBlockedAddress(a.address))) {
          fail(new BlockedDestinationError());
          return;
        }
        const usable = family ? answers.filter((a) => a.family === family) : answers;
        if (usable.length === 0) {
          fail(notFound(hostname));
          return;
        }
        const list = usable.map((a) => ({ address: a.address, family: a.family }));
        if (options?.all) callback(null, list);
        else callback(null, list[0].address, list[0].family);
      },
      (error: Error) => fail(error),
    );
  };
}

// ---------------------------------------------------------------- fetch

let sharedDispatcher: Agent | undefined;

function dispatcherFor(resolve: Resolver | undefined): Agent {
  if (resolve) return new Agent({ connect: { lookup: createSafeLookup(resolve) } });
  sharedDispatcher ??= new Agent({ connect: { lookup: createSafeLookup() } });
  return sharedDispatcher;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  // Um `Request` levaria método/corpo/cabeçalhos próprios; o cliente de IA só passa a URL.
  throw new TypeError("createSafeFetch aceita só a URL (texto ou URL).");
}

/** `fetch` do pacote `undici` com a política de destino: checagem da URL antes de conectar (o undici não chama
 *  o `lookup` para IP literal), `lookup` validado na conexão e redirecionamento sempre recusado.
 *  `options.resolve` existe para os testes trocarem o DNS. */
export function createSafeFetch(options: { resolve?: Resolver } = {}): typeof fetch {
  const dispatcher = dispatcherFor(options.resolve);
  const safeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (checkGatewayUrlSyntax(url) !== null) throw new BlockedDestinationError();
    try {
      const response = await undiciFetch(url, {
        ...(init as Parameters<typeof undiciFetch>[1]),
        redirect: "error", // um 3xx poderia apontar para um IP literal, que o `lookup` não vê
        dispatcher,
      });
      return response as unknown as Response;
    } catch (error) {
      const cause = (error as { cause?: unknown } | null)?.cause;
      if (cause instanceof BlockedDestinationError) throw cause;
      throw error;
    }
  };
  return safeFetch as typeof fetch;
}
