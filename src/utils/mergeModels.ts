import { Model } from "@/gotypes";

function alphabeticalSort(a: Model, b: Model): number {
  return a.model.toLowerCase().localeCompare(b.model.toLowerCase());
}

export function mergeModels(
  localModels: Model[],
  hideCloudModels: boolean = false,
): Model[] {
  const allModels = (localModels || []).map((model) => model);

  const cloudModels = allModels.filter((m) => m.isCloud());
  const localNonCloudModels = allModels.filter((m) => !m.isCloud());

  localNonCloudModels.sort(alphabeticalSort);
  cloudModels.sort(alphabeticalSort);

  return hideCloudModels
    ? localNonCloudModels
    : [...cloudModels, ...localNonCloudModels];
}