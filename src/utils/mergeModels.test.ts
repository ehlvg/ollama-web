import { describe, it, expect } from "vitest";
import { Model } from "@/gotypes";
import { mergeModels, FEATURED_MODELS } from "@/utils/mergeModels";
import "@/api";

describe("Model merging logic", () => {
  it("keeps featured cloud catalog models first", () => {
    const localModels: Model[] = [
      new Model({ model: "gpt-oss:120b" }),
      new Model({ model: "llama3.2" }),
      new Model({ model: "mistral" }),
    ];

    const merged = mergeModels(localModels);

    for (let i = 0; i < FEATURED_MODELS.length; i++) {
      expect(merged[i].model).toBe(FEATURED_MODELS[i]);
      expect(merged[i].isCloud()).toBe(true);
    }

    expect(merged[FEATURED_MODELS.length].model).toBe("llama3.2");
    expect(merged[FEATURED_MODELS.length + 1].model).toBe("mistral");
  });

  it("handles empty input", () => {
    const merged = mergeModels([]);

    expect(merged.map((model) => model.model)).toEqual(FEATURED_MODELS);
    expect(merged.every((model) => model.isCloud())).toBe(true);
  });

  it("sorts non-featured local models alphabetically", () => {
    const localModels: Model[] = [
      new Model({ model: "zephyr" }),
      new Model({ model: "alpha" }),
      new Model({ model: "gpt-oss:120b" }),
    ];

    const merged = mergeModels(localModels);

    expect(merged.slice(0, FEATURED_MODELS.length).map((model) => model.model)).toEqual(
      FEATURED_MODELS,
    );
    expect(merged[FEATURED_MODELS.length].model).toBe("alpha");
    expect(merged[FEATURED_MODELS.length + 1].model).toBe("zephyr");
  });
});
