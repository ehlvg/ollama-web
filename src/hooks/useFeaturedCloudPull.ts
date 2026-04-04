import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pullModel } from "@/api";
import { Model } from "@/gotypes";
import { FEATURED_MODELS } from "@/utils/mergeModels";
import { useCloudStatus } from "./useCloudStatus";

export function useFeaturedCloudPull(
  installedModels: Model[] | undefined,
  isLoading: boolean,
) {
  const { cloudDisabled } = useCloudStatus();
  const queryClient = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (cloudDisabled || isLoading || !installedModels || started.current) return;
    started.current = true;

    const installed = new Set(installedModels.map((m) => m.model));
    const missing = FEATURED_MODELS.filter((name) => !installed.has(name));
    if (missing.length === 0) return;

    void (async () => {
      for (const name of missing) {
        try {
          for await (const _ of pullModel(name)) {
          }
        } catch {
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    })();
  }, [cloudDisabled, isLoading, installedModels, queryClient]);
}
