import { describe, it, expect } from "vitest";
import { isEngineChallenge, fallbackSearch } from "../shared/searchFallback.js";

describe("isEngineChallenge", () => {
  it("spots the DuckDuckGo bot challenge", () => {
    const html = "<p>Unfortunately, bots use DuckDuckGo too.</p>";
    expect(isEngineChallenge("https://html.duckduckgo.com/html/?q=cats", html)).toBe(true);
  });

  it("spots the Brave Search captcha page", () => {
    const html = "Your request has been flagged as being suspicious and Brave Search decided to schedule a captcha";
    expect(isEngineChallenge("https://search.brave.com/search?q=cats", html)).toBe(true);
  });

  it("leaves real results alone", () => {
    expect(isEngineChallenge("https://html.duckduckgo.com/html/?q=cats", "<div class=result>Cats</div>")).toBe(false);
  });

  it("only applies to the engines that block the proxy", () => {
    const html = "flagged as being suspicious";
    expect(isEngineChallenge("https://example.com/", html)).toBe(false);
    expect(isEngineChallenge("not a url", html)).toBe(false);
  });
});

describe("fallbackSearch", () => {
  it("repeats the same query on Bing", () => {
    const next = fallbackSearch("https://html.duckduckgo.com/html/?q=funny%20cats");
    expect(next).toEqual({ name: "Bing", url: "https://www.bing.com/search?q=funny%20cats" });
  });

  it("gives nothing when there is no query", () => {
    expect(fallbackSearch("https://search.brave.com/")).toBeNull();
    expect(fallbackSearch("nonsense")).toBeNull();
  });
});
