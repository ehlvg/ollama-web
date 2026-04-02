import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { getModels, getSettings } from "@/api";
import { useQuery } from "@tanstack/react-query";
import { useCloudStatus } from "@/hooks/useCloudStatus";
import { useFeaturedCloudPull } from "@/hooks/useFeaturedCloudPull";

function RootComponent() {
  // This hook ensures settings are fetched on app startup
  useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  // Fetch cloud status on startup (best-effort)
  useCloudStatus();

  const modelsQuery = useQuery({
    queryKey: ["models", ""],
    queryFn: () => getModels(""),
  });
  useFeaturedCloudPull(modelsQuery.data, modelsQuery.isLoading);

  return (
    <div>
      <Outlet />
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
});
