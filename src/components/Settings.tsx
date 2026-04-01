import { useEffect, useState, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { Field, Label, Description } from "@/components/ui/fieldset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ServerIcon,
  KeyIcon,
  CloudIcon,
  XMarkIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/20/solid";
import { Settings as SettingsType } from "@/gotypes";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSettings,
  updateSettings,
  getInferenceCompute,
  fetchHealth,
} from "@/api";
import {
  getOllamaHost,
  setOllamaHost,
  getApiKey,
  setApiKey,
  getCorsProxyUrl,
  setCorsProxyUrl,
} from "@/lib/web-config";

export default function Settings() {
  const queryClient = useQueryClient();
  const [showSaved, setShowSaved] = useState(false);
  const navigate = useNavigate();

  const [ollamaHost, setOllamaHostState] = useState(getOllamaHost);
  const [apiKeyValue, setApiKeyValue] = useState(getApiKey() || "");
  const [corsProxyValue, setCorsProxyValue] = useState(getCorsProxyUrl() || "");
  const [connectionStatus, setConnectionStatus] = useState<
    "checking" | "connected" | "disconnected" | null
  >(null);

  const {
    data: settingsData,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const settings = settingsData?.settings || null;

  const { data: inferenceComputeResponse } = useQuery({
    queryKey: ["inferenceCompute"],
    queryFn: getInferenceCompute,
  });

  const defaultContextLength = inferenceComputeResponse?.defaultContextLength;

  const updateSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1500);
    },
  });

  const handleChange = useCallback(
    (field: keyof SettingsType, value: boolean | string | number) => {
      if (settings) {
        const updatedSettings = new SettingsType({
          ...settings,
          [field]: value,
        });
        updateSettingsMutation.mutate(updatedSettings);
      }
    },
    [settings, updateSettingsMutation],
  );

  const handleResetToDefaults = () => {
    if (settings) {
      const defaultSettings = new SettingsType({
        Expose: false,
        Browser: false,
        Models: "",
        Agent: false,
        Tools: false,
        ContextLength: 4096,
        AutoUpdateEnabled: false,
      });
      updateSettingsMutation.mutate(defaultSettings);
    }
  };

  const handleSaveHost = () => {
    setOllamaHost(ollamaHost);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  };

  const handleSaveApiKey = () => {
    setApiKey(apiKeyValue || null);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  };

  const handleSaveCorsProxy = () => {
    setCorsProxyUrl(corsProxyValue || null);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  };

  const handleTestConnection = async () => {
    setConnectionStatus("checking");
    const isHealthy = await fetchHealth();
    setConnectionStatus(isHealthy ? "connected" : "disconnected");
  };

  useEffect(() => {
    handleTestConnection();
  }, [ollamaHost]);

  if (loading) {
    return null;
  }

  if (error || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-500">Failed to load settings</div>
      </div>
    );
  }

  const isWindows = navigator.platform.toLowerCase().includes("win");

  return (
    <main className="flex h-screen w-full flex-col select-none dark:bg-neutral-900">
      <header
        className="w-full flex flex-none justify-between h-[52px] py-2.5 items-center border-b border-neutral-200 dark:border-neutral-800 select-none"
        onMouseDown={() => window.drag && window.drag()}
        onDoubleClick={() => window.doubleClick && window.doubleClick()}
      >
        <h1
          className={`${isWindows ? "pl-4" : "pl-24"} flex items-center font-rounded text-md font-medium dark:text-white`}
        >
          {isWindows && (
            <button
              onClick={() => navigate({ to: "/" })}
              className="hover:bg-neutral-100 mr-3 dark:hover:bg-neutral-800 rounded-full p-1.5"
            >
              <ArrowLeftIcon className="w-5 h-5 dark:text-white" />
            </button>
          )}
          Settings
        </h1>
        {!isWindows && (
          <button
            onClick={() => navigate({ to: "/" })}
            className="p-1 hover:bg-neutral-100 mr-3 dark:hover:bg-neutral-800 rounded-full"
          >
            <XMarkIcon className="w-6 h-6 dark:text-white" />
          </button>
        )}
      </header>
      <div className="w-full p-6 overflow-y-auto flex-1 overscroll-contain">
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Server Configuration */}
          <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
            <div className="space-y-4 p-4">
              <Field>
                <div className="flex items-start space-x-3">
                  <ServerIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                  <div className="w-full">
                    <Label>Ollama Server</Label>
                    <Description>
                      Address of your Ollama server (default: http://127.0.0.1:11434)
                    </Description>
                    <div className="mt-2 flex items-center space-x-2">
                      <Input
                        value={ollamaHost}
                        onChange={(e) => setOllamaHostState(e.target.value)}
                        placeholder="http://127.0.0.1:11434"
                        className="flex-1"
                      />
                      <Button type="button" color="white" onClick={handleSaveHost}>
                        Save
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center space-x-2">
                      <Button
                        type="button"
                        color="white"
                        onClick={handleTestConnection}
                      >
                        Test Connection
                      </Button>
                      {connectionStatus === "checking" && (
                        <Text className="text-sm text-neutral-500">
                          Checking...
                        </Text>
                      )}
                      {connectionStatus === "connected" && (
                        <div className="flex items-center space-x-1 text-green-600">
                          <CheckCircleIcon className="w-4 h-4" />
                          <Text className="text-sm">Connected</Text>
                        </div>
                      )}
                      {connectionStatus === "disconnected" && (
                        <div className="flex items-center space-x-1 text-red-600">
                          <ExclamationCircleIcon className="w-4 h-4" />
                          <Text className="text-sm">Not connected</Text>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Field>
            </div>
          </div>

          {/* API Key */}
          <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
            <div className="p-4">
              <Field>
                <div className="flex items-start space-x-3">
                  <KeyIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                  <div className="w-full">
                    <Label>API Key (optional)</Label>
                    <Description>
                      For cloud models or servers requiring authentication
                    </Description>
                    <div className="mt-2 flex items-center space-x-2">
                      <Input
                        type="password"
                        value={apiKeyValue}
                        onChange={(e) => setApiKeyValue(e.target.value)}
                        placeholder="Leave empty for local Ollama"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        color="white"
                        onClick={handleSaveApiKey}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </Field>
            </div>
          </div>

          {/* CORS Proxy */}
          <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
            <div className="p-4">
              <Field>
                <div className="flex items-start space-x-3">
                  <CloudIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                  <div className="w-full">
                    <Label>CORS Proxy (for web search)</Label>
                    <Description>
                      For local proxy: http://localhost:8080. Run: npx local-cors-proxy --proxyUrl https://ollama.com/api/ --port 8080
                    </Description>
                    <div className="mt-2 flex items-center space-x-2">
                      <Input
                        value={corsProxyValue}
                        onChange={(e) => setCorsProxyValue(e.target.value)}
                        placeholder="http://localhost:8080"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        color="white"
                        onClick={handleSaveCorsProxy}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </Field>
            </div>
          </div>

          {/* Cloud Models */}
          <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
            <div className="p-4">
              <Field>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-3 flex-1">
                    <CloudIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                    <div>
                      <Label>Enable Cloud Models</Label>
                      <Description>
                        Enable this if using ollama.com cloud models with API key
                      </Description>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Switch
                      checked={settings.TurboEnabled}
                      onChange={(checked) => handleChange("TurboEnabled", checked)}
                    />
                  </div>
                </div>
              </Field>
            </div>
          </div>

          {/* Context Length */}
          <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
            <div className="p-4">
              <Field>
                <Label>Context Length</Label>
                <Description>
                  Context length determines how much of your conversation the
                  LLM can remember.
                </Description>
                <div className="mt-3">
                  <Slider
                    value={settings.ContextLength || defaultContextLength || 4096}
                    onChange={(value) => {
                      handleChange("ContextLength", value);
                    }}
                    options={[
                      { value: 4096, label: "4k" },
                      { value: 8192, label: "8k" },
                      { value: 16384, label: "16k" },
                      { value: 32768, label: "32k" },
                      { value: 65536, label: "64k" },
                      { value: 131072, label: "128k" },
                    ]}
                  />
                </div>
              </Field>
            </div>
          </div>

          {/* Reset button */}
          <div className="mt-6 flex justify-end px-4">
            <Button
              type="button"
              color="white"
              className="px-3"
              onClick={handleResetToDefaults}
            >
              Reset to defaults
            </Button>
          </div>
        </div>

        {/* Saved indicator */}
        {showSaved && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 transition-opacity duration-300 z-50">
            <Badge
              color="green"
              className="!bg-green-500 !text-white dark:!bg-green-600"
            >
              Saved
            </Badge>
          </div>
        )}
      </div>
    </main>
  );
}