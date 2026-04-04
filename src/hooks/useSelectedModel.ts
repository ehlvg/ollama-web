import { useEffect, useMemo, useRef } from "react";
import { useModels } from "./useModels";
import { useChat } from "./useChats";
import { useSettings } from "./useSettings.ts";
import { Model } from "@/gotypes";

export function useSelectedModel(currentChatId?: string, searchQuery?: string) {
  const { settings, setSettings } = useSettings();
  const { data: models = [], isLoading } = useModels(searchQuery || "");
  const { data: chatData, isLoading: isChatLoading } = useChat(
    currentChatId && currentChatId !== "new" ? currentChatId : "",
  );

  const restoredChatRef = useRef<string | null>(null);

  const selectedModel: Model | null = useMemo(() => {
    return (
      models.find((m) => m.model === settings.selectedModel) ||
      models[0] ||
      null
    );
  }, [models, settings.selectedModel]);

  useEffect(() => {
    if (!currentChatId || currentChatId === "new") {
      return;
    }

    if (
      chatData?.chat?.messages &&
      !isChatLoading &&
      restoredChatRef.current !== currentChatId
    ) {
      const messages = [...chatData.chat.messages].reverse();
      for (const message of messages) {
        if (message.model) {
          const chatModelName = message.model;

          if (chatModelName !== settings.selectedModel) {
            setSettings({ SelectedModel: chatModelName });
          }

          restoredChatRef.current = currentChatId;
          return;
        }
      }
      restoredChatRef.current = currentChatId;
    }
  }, [
    currentChatId,
    chatData,
    isChatLoading,
    settings.selectedModel,
    setSettings,
  ]);

  useEffect(() => {
    if (isLoading || models.length === 0 || settings.selectedModel) {
      return;
    }

    const defaultModel =
      models[0];

    if (defaultModel) {
      setSettings({ SelectedModel: defaultModel.model });
    }
  }, [
    isLoading,
    models.length,
    settings.selectedModel,
    models,
    setSettings,
  ]);

  const allModels = useMemo(() => {
    if (!selectedModel || models.find((m) => m.model === selectedModel.model)) {
      return models;
    }

    return [...models, selectedModel];
  }, [models, selectedModel]);

  return {
    selectedModel,
    setSettings,
    models: allModels,
    loading: isLoading,
  };
}
