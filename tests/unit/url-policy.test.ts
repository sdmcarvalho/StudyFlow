// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BlockedDestinationError,
  GATEWAY_BLOCKED_MESSAGE,
  allowPrivateDestinations,
  checkGatewayUrlSyntax,
  createSafeLookup,
  isBlockedAddress,
} from "@/features/ai/url-policy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("BlockedDestinationError", () => {
  it("usa a mensagem padrão", () => {
    const error = new BlockedDestinationError();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Endereço do gateway não permitido.");
    expect(GATEWAY_BLOCKED_MESSAGE).toBe("Endereço do gateway não permitido.");
    expect(error.name).toBe("BlockedDestinationError");
  });
});

describe("allowPrivateDestinations", () => {
  it("só vale com STUDYFLOW_AI_ALLOW_PRIVATE=1", () => {
    vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE", "");
    expect(allowPrivateDestinations()).toBe(false);
    vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE", "true");
    expect(allowPrivateDestinations()).toBe(false);
    vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE", "1");
    expect(allowPrivateDestinations()).toBe(true);
  });
});

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "240.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
  ])("bloqueia %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    // IPv4 mapeado na forma hexadecimal (é como `new URL` normaliza)
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:a9fe:a9fe",
    "0:0:0:0:0:ffff:7f00:1",
    "[::ffff:7f00:1]",
    "[::1]",
    // IPv4 traduzido (::ffff:0:0/96), compatível (::/96) e NAT64 com IPv4 privado
    "::ffff:0:127.0.0.1",
    "::ffff:0:7f00:1",
    "::127.0.0.1",
    "::7f00:1",
    "64:ff9b::127.0.0.1",
    "64:ff9b::a00:1",
    "64:ff9b:1::1",
    // 6to4, Teredo, documentação, site-local antigo, zona de link-local
    "2002:7f00:1::1",
    "2002:808:808::1",
    "2001:0:4136:e378::1",
    "2001:db8::1",
    "fec0::1",
    "fe80::1%eth0",
    // IPv4 reservados extras
    "192.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    // Não é IP: na dúvida, bloqueia
    "exemplo.com",
    "",
  ])("bloqueia a forma escondida %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.1",
    "172.15.255.255",
    "100.63.255.255",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
    "::ffff:808:808",
    "64:ff9b::8.8.8.8",
    "[2606:4700:4700::1111]",
  ])("permite %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("checkGatewayUrlSyntax", () => {
  it.each(["https://api.openai.com/v1", "https://dashscope.aliyuncs.com/compatible-mode/v1", "https://8.8.8.8/v1"])(
    "aceita %s",
    (url) => {
      expect(checkGatewayUrlSyntax(url)).toBeNull();
    },
  );

  it.each([
    "http://api.openai.com",
    "https://localhost:11434",
    "https://LOCALHOST/",
    "https://localhost./",
    "https://foo.localhost/",
    "https://api.openai.com./v1",
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://0x7f.1/",
    "https://[::1]/",
    "https://10.1.2.3/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:7f00:1]/",
    "https://[fe80::1]/",
    "https://169.254.169.254/latest/meta-data",
    "ftp://x",
    "texto solto",
  ])("recusa %s", (url) => {
    const message = checkGatewayUrlSyntax(url);
    expect(message).not.toBeNull();
    expect(typeof message).toBe("string");
  });

  it("endereço bloqueado devolve a mensagem padrão", () => {
    expect(checkGatewayUrlSyntax("https://127.0.0.1/")).toBe(GATEWAY_BLOCKED_MESSAGE);
    expect(checkGatewayUrlSyntax("https://localhost/")).toBe(GATEWAY_BLOCKED_MESSAGE);
  });

  it("com STUDYFLOW_AI_ALLOW_PRIVATE=1 aceita http e endereços privados", () => {
    vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE", "1");
    expect(checkGatewayUrlSyntax("http://localhost:11434")).toBeNull();
    expect(checkGatewayUrlSyntax("https://127.0.0.1/")).toBeNull();
    expect(checkGatewayUrlSyntax("ftp://x")).not.toBeNull();
    expect(checkGatewayUrlSyntax("texto solto")).not.toBeNull();
  });
});

type LookupResult = { error: NodeJS.ErrnoException | null; address: unknown; family: unknown };

function runLookup(
  lookup: ReturnType<typeof createSafeLookup>,
  hostname: string,
  options: { all?: boolean; family?: number },
): Promise<LookupResult> {
  return new Promise((resolve) => {
    lookup(hostname, options, (error: NodeJS.ErrnoException | null, address?: unknown, family?: unknown) => {
      resolve({ error, address, family });
    });
  });
}

describe("createSafeLookup", () => {
  it("endereço público: array com all=true e (endereço, família) com all falso", async () => {
    const resolver = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const lookup = createSafeLookup(resolver);

    const all = await runLookup(lookup, "gw.exemplo.com", { all: true });
    expect(all.error).toBeNull();
    expect(all.address).toEqual([{ address: "8.8.8.8", family: 4 }]);

    const one = await runLookup(lookup, "gw.exemplo.com", { all: false });
    expect(one.error).toBeNull();
    expect(one.address).toBe("8.8.8.8");
    expect(one.family).toBe(4);

    const omitted = await runLookup(lookup, "gw.exemplo.com", {});
    expect(omitted.address).toBe("8.8.8.8");
  });

  it("o resolvedor é chamado uma única vez por conexão, com o nome pedido", async () => {
    const resolver = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const lookup = createSafeLookup(resolver);
    await runLookup(lookup, "gw.exemplo.com", { all: true });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith("gw.exemplo.com");
  });

  it("resposta com endereço público E privado é recusada inteira", async () => {
    const lookup = createSafeLookup(async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    for (const all of [true, false]) {
      const result = await runLookup(lookup, "gw.exemplo.com", { all });
      expect(result.error).toBeInstanceOf(BlockedDestinationError);
      expect(result.error?.message).toBe(GATEWAY_BLOCKED_MESSAGE);
    }
  });

  it.each([["127.0.0.1", 4], ["::1", 6], ["::ffff:7f00:1", 6], ["169.254.169.254", 4]])(
    "loopback/privado %s é recusado",
    async (address, family) => {
      const lookup = createSafeLookup(async () => [{ address, family }]);
      const result = await runLookup(lookup, "gw.exemplo.com", { all: true });
      expect(result.error).toBeInstanceOf(BlockedDestinationError);
    },
  );

  it("resposta vazia vira erro (nada a conectar)", async () => {
    const lookup = createSafeLookup(async () => []);
    const result = await runLookup(lookup, "gw.exemplo.com", { all: true });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.address).toBeUndefined();
  });

  it("falha do resolvedor chega com o erro original", async () => {
    const original = Object.assign(new Error("getaddrinfo ENOTFOUND gw.exemplo.com"), { code: "ENOTFOUND" });
    const lookup = createSafeLookup(async () => {
      throw original;
    });
    const result = await runLookup(lookup, "gw.exemplo.com", { all: true });
    expect(result.error).toBe(original);
  });

  it("com STUDYFLOW_AI_ALLOW_PRIVATE=1 o endereço privado passa", async () => {
    vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE", "1");
    const lookup = createSafeLookup(async () => [{ address: "10.0.0.1", family: 4 }]);
    const result = await runLookup(lookup, "gw.interno", { all: true });
    expect(result.error).toBeNull();
    expect(result.address).toEqual([{ address: "10.0.0.1", family: 4 }]);
  });

  it("respeita options.family filtrando a resposta", async () => {
    const lookup = createSafeLookup(async () => [
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "1.1.1.1", family: 4 },
    ]);
    const result = await runLookup(lookup, "gw.exemplo.com", { all: false, family: 4 });
    expect(result.address).toBe("1.1.1.1");
    expect(result.family).toBe(4);
  });
});
