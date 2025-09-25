import { describe, it, expect, beforeEach } from "vitest";
import { helpRegistry } from "./helpRegistry";

describe("help registry", () => {
  it("has unique keys", () => {
    const ks = Object.keys(helpRegistry);
    const set = new Set(ks);
    expect(set.size).toBe(ks.length);
  });
});

describe("[data-help-key] resolution", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  it("resolves nearest ancestor", () => {
    document.body.innerHTML = `<div data-help-key="cards.unknowns"><button id="b"><span>inner</span></button></div>`;
    const el = (document.getElementById("b") as HTMLElement).closest("[data-help-key]") as HTMLElement;
    expect(el.dataset.helpKey).toBe("cards.unknowns");
  });
});
