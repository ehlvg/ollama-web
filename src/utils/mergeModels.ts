import { Model } from "@/gotypes";

export const FEATURED_MODELS = [
  "gpt-oss:120b",
  "kimi-k2.5",
  "nemotron-3-super",
  "glm-5",
  "gpt-oss:20b",
];

function alphabeticalSort(a: Model, b: Model): number {
  return a.model.toLowerCase().localeCompare(b.model.toLowerCase());
}

export function mergeModels(
  localModels: Model[],
  _hideCloudModels: boolean = false,
): Model[] {
  const featuredSet = new Set(FEATURED_MODELS);

  const locals = (localModels || []).map((model) => model);
  const localNonFeatured = locals.filter((m) => !featuredSet.has(m.model));
  localNonFeatured.sort(alphabeticalSort);

  return [
    ...FEATURED_MODELS.map((name) => new Model({ model: name })),
    ...localNonFeatured,
  ];
}
