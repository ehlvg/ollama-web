import { Model } from "@/gotypes";

export const FEATURED_MODELS = ["gpt-oss:120b-cloud"];

function alphabeticalSort(a: Model, b: Model): number {
  return a.model.toLowerCase().localeCompare(b.model.toLowerCase());
}

export function mergeModels(
  localModels: Model[],
  hideCloudModels: boolean = false,
): Model[] {
  const featured = FEATURED_MODELS || [];
  const featuredCloud = featured.filter((m) => m.endsWith("cloud"));
  const featuredNonCloud = featured.filter((m) => !m.endsWith("cloud"));

  const featuredSet = new Set(featured);

  const locals = (localModels || []).map((model) => model);
  const localNonFeatured = locals.filter((m) => !featuredSet.has(m.model));

  const localCloud = localNonFeatured.filter((m) => m.isCloud());
  const localNonCloud = localNonFeatured.filter((m) => !m.isCloud());

  localCloud.sort(alphabeticalSort);
  localNonCloud.sort(alphabeticalSort);

  if (hideCloudModels) {
    return [
      ...featuredNonCloud.map((name) => new Model({ model: name })),
      ...localNonCloud,
    ];
  }

  return [
    ...featuredCloud.map((name) => new Model({ model: name })),
    ...featuredNonCloud.map((name) => new Model({ model: name })),
    ...localCloud,
    ...localNonCloud,
  ];
}