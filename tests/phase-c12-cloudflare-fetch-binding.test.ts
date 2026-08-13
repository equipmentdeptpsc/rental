// @vitest-environment node
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workerScript = `
export default {
  async fetch(request) {
    const mode = new URL(request.url).searchParams.get("mode");
    const ambient = fetch;
    try {
      let response;
      if (mode === "member") response = await ({ ambient }).ambient("https://provider.test/emails");
      else if (mode === "bare") response = await ambient("https://provider.test/emails");
      else if (mode === "global") response = await globalThis.fetch("https://provider.test/emails");
      else if (mode === "bound") response = await globalThis.fetch.bind(globalThis)("https://provider.test/emails");
      else response = await ((...args) => globalThis.fetch(...args))("https://provider.test/emails");
      return Response.json({ ok: response.ok });
    } catch (error) {
      return Response.json({ ok: false, name: error?.name ?? "Unknown", category: /this|invocation/i.test(error?.message ?? "") ? "FETCH_BINDING_ERROR" : "OTHER" });
    }
  }
};`;

const runtime = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: "2026-07-27",
  modules: true,
  script: workerScript,
  outboundService: async () => new Response(JSON.stringify({ id: "synthetic-provider-id" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }),
}));

afterAll(() => runtime.dispose());

describe("C12.2.7E.3 Cloudflare fetch receiver audit", () => {
  it.each(["bare", "global", "bound", "wrapper"])("allows the %s Worker fetch shape", async (mode) => {
    const result = await (await runtime.dispatchFetch(`https://worker.test/?mode=${mode}`)).json();
    expect(result).toEqual({ ok: true });
  });

  it("reproduces the provider adapter's member-held ambient fetch failure before network dispatch", async () => {
    const result = await (await runtime.dispatchFetch("https://worker.test/?mode=member")).json();
    expect(result).toEqual({ ok: false, name: "TypeError", category: "FETCH_BINDING_ERROR" });
  });
});

let adapterRuntime: Miniflare;
beforeAll(async () => {
  const bundled = await build({
    stdin: { contents: `
      import { ResendEmailDeliveryProvider } from "./server/notifications/ResendEmailDeliveryProvider.ts";
      export default { async fetch(request) {
        const mode = new URL(request.url).searchParams.get("mode") ?? "accepted";
        const provider = new ResendEmailDeliveryProvider({ apiKey: "synthetic-key", endpoint: "https://provider.test/" + mode, timeoutMs: 25 });
        return Response.json(await provider.send({ from: "sender@example.invalid", to: "recipient@example.invalid",
          recipientName: "Recipient", email: { subject: "Subject", text: "Text", html: "<p>Text</p>" },
          idempotencyKey: "stable-worker-idempotency" }));
      }};`, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "browser", target: "es2022",
  });
  adapterRuntime = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: "2026-07-27",
    modules: true,
    script: bundled.outputFiles[0].text,
    outboundService: async request => {
      const mode = new URL(request.url).pathname.slice(1);
      if (mode === "accepted") return new Response(JSON.stringify({ id: "synthetic-provider-id" }), { status: 200 });
      if (mode === "rate-limited") return new Response("opaque", { status: 429 });
      if (mode === "server-error") return new Response("opaque", { status: 500 });
      return new Response("malformed", { status: 200 });
    },
  }));
});
afterAll(() => adapterRuntime.dispose());

describe("C12.2.7E.3 actual adapter in workerd", () => {
  it.each([
    ["accepted", { accepted: true, provider: "resend", providerMessageId: "synthetic-provider-id" }],
    ["rate-limited", { accepted: false, category: "RateLimited" }],
    ["server-error", { accepted: false, category: "TemporaryProviderFailure" }],
    ["malformed", { accepted: false, category: "ProviderParseError" }],
  ] as const)("maps the synthetic %s response", async (mode, expected) => {
    const result = await (await adapterRuntime.dispatchFetch(`https://worker.test/?mode=${mode}`)).json();
    expect(result).toMatchObject(expected);
  });
});
