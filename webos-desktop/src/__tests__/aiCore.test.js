import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../shared/wispTransport.js", () => ({ fetchThroughWisp: vi.fn() }));

import { AICore } from "../apps/aiAssistant/aiCore.js";

const reply = (content) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});

describe("AICore remote backends", () => {
  let core;
  beforeEach(() => {
    core = new AICore();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("builds the usual OpenAI-style URL for custom endpoints", () => {
    core.setRemoteConfig({ endpoint: "https://api.example.com", model: "m" });
    expect(core.remoteChatUrl()).toBe("https://api.example.com/v1/chat/completions");
    core.setRemoteConfig({ endpoint: "https://api.example.com/v1", model: "m", autoAppendV1: false });
    expect(core.remoteChatUrl()).toBe("https://api.example.com/v1/chat/completions");
  });

  it("uses the Pollinations address as is, without adding any path", () => {
    core.setRemoteConfig({
      endpoint: AICore.POLLINATIONS_ENDPOINT,
      model: AICore.POLLINATIONS_MODEL,
      autoAppendV1: true,
      chatPath: "",
    });
    expect(core.remoteChatUrl()).toBe("https://text.pollinations.ai/openai");
  });

  it("sends a Pollinations chat and returns its answer", async () => {
    fetch.mockResolvedValue(reply("Hello there"));
    core.setRemoteConfig({ endpoint: AICore.POLLINATIONS_ENDPOINT, model: AICore.POLLINATIONS_MODEL, chatPath: "" });
    const out = await core.generateRemote("hi", "be nice");
    expect(out.text).toBe("Hello there");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://text.pollinations.ai/openai");
    expect(JSON.parse(options.body).model).toBe("openai");
  });

  it("reports an error from a backend that wants a login", async () => {
    fetch.mockResolvedValue({ ok: false, status: 401, text: async () => "Authentication required" });
    core.setRemoteConfig({ endpoint: AICore.REMOTE_DEFAULT_ENDPOINT, model: AICore.REMOTE_DEFAULT_MODEL });
    await expect(core.generateRemote("hi", "s")).rejects.toThrow(/HTTP 401/);
  });

  it("treats a device without WebGPU as unable to run the local model", () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 16, deviceMemory: 16 });
    expect(AICore.canRunLocalModel()).toBe(false);
    expect(AICore.isWeakDevice()).toBe(true);
    vi.stubGlobal("navigator", { gpu: {}, hardwareConcurrency: 16, deviceMemory: 16 });
    expect(AICore.canRunLocalModel()).toBe(true);
    expect(AICore.isWeakDevice()).toBe(false);
    vi.stubGlobal("navigator", { gpu: {}, hardwareConcurrency: 8, deviceMemory: 4 });
    expect(AICore.isWeakDevice()).toBe(true);
  });
});
