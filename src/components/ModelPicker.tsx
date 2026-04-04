import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  type JSX,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";
import { Model } from "@/gotypes";
import { useSelectedModel } from "@/hooks/useSelectedModel";
import { useQueryClient } from "@tanstack/react-query";
import { getModelUpstreamInfo, pullModel } from "@/api";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

const stalenessCheckCache = new Map<string, number>();

export const ModelPicker = forwardRef<
  HTMLButtonElement,
  {
    chatId?: string;
    onModelSelect?: () => void;
    onEscape?: () => void;
    onDropdownToggle?: (isOpen: boolean) => void;
    isDisabled?: boolean;
  }
>(function ModelPicker(
  { chatId, onModelSelect, onEscape, onDropdownToggle, isDisabled },
  ref,
): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { selectedModel, setSettings, models, loading } = useSelectedModel(
    chatId,
    searchQuery,
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const modelListRef = useRef<{
    scrollToSelectedModel: () => void;
    scrollToTop: () => void;
  }>(null);
  const sheetSearchInputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const [isSheetMounted, setIsSheetMounted] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState<number>(640);
  const [backdropOpacity, setBackdropOpacity] = useState(0);
  const [isSheetAnimating, setIsSheetAnimating] = useState(false);
  const [isSheetTransitionEnabled, setIsSheetTransitionEnabled] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef<number | null>(null);
  const dragLastYRef = useRef<number | null>(null);
  const dragLastTimeRef = useRef<number>(0);

  const checkModelStaleness = async (model: Model) => {
    if (
      !model ||
      !model.model ||
      model.digest === undefined ||
      model.digest === ""
    )
      return;

    // Check cache - only check staleness every 5 minutes per model
    const now = Date.now();
    const lastChecked = stalenessCheckCache.get(model.model);
    if (lastChecked && now - lastChecked < 5 * 60 * 1000) return;
    stalenessCheckCache.set(model.model, now);

    try {
      const upstreamInfo = await getModelUpstreamInfo(model);

      if (upstreamInfo.stale) {
        const currentStaleModels =
          queryClient.getQueryData<Map<string, boolean>>(["staleModels"]) ||
          new Map();
        const newMap = new Map(currentStaleModels);
        newMap.set(model.model, true);
        queryClient.setQueryData(["staleModels"], newMap);
      }
    } catch (error) {
      console.error("Failed to check model staleness:", error);
    }
  };

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (!isMobile) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return;
  }, [isMobile]);

  useEffect(() => {
    if (ref && typeof ref === "object" && ref.current) {
      (ref.current as any).closeDropdown = () => setIsOpen(false);
    }
  }, [ref, setIsOpen]);

  // Focus search when opened and refresh models
  // Clear search when closed
  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
      modelListRef.current?.scrollToSelectedModel();
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (isMobileOpen) {
      setIsSheetMounted(true);
      sheetSearchInputRef.current?.focus();
      modelListRef.current?.scrollToSelectedModel();
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
  }, [isMobileOpen]);

  useEffect(() => {
    if (!isSheetMounted) return;

    const measure = () => {
      const h = sheetRef.current?.getBoundingClientRect().height;
      if (h && Number.isFinite(h)) {
        setSheetHeight(h);
        return h;
      }
      return sheetHeight;
    };

    const h = measure();
    setIsSheetAnimating(true);
    setIsSheetTransitionEnabled(false);
    setSheetTranslateY(h);
    setBackdropOpacity(0);

    const id = window.requestAnimationFrame(() => {
      setIsSheetTransitionEnabled(true);
      setSheetTranslateY(0);
      setBackdropOpacity(1);
    });

    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSheetMounted]);

  const closeMobileSheet = () => {
    if (!isSheetMounted) return;
    setIsSheetAnimating(true);
    setIsSheetTransitionEnabled(true);
    setIsMobileOpen(false);
    setSheetTranslateY(sheetHeight);
    setBackdropOpacity(0);
  };

  // When searching, scroll to top of list
  useEffect(() => {
    if (searchQuery && modelListRef.current) {
      modelListRef.current.scrollToTop();
    }
  }, [searchQuery]);

  useEffect(() => {
    if (selectedModel && !loading) {
      checkModelStaleness(selectedModel);
    }
  }, [selectedModel?.model, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen && !isMobileOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        if (isMobileOpen) {
          closeMobileSheet();
        } else {
          setIsMobileOpen(false);
        }
        onEscape?.();
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isMobileOpen, onEscape]);

  const handleModelSelect = async (model: Model) => {
    if (model.digest === undefined) {
      setPullingModel(model.model);
      try {
        for await (const _event of pullModel(model.model)) {
        }
        await queryClient.invalidateQueries({ queryKey: ["models"] });
      } catch (error) {
        console.error(`Failed to pull model ${model.model}:`, error);
        return;
      } finally {
        setPullingModel(null);
      }
    }

    setSettings({ SelectedModel: model.model });
    setIsOpen(false);
    if (isMobileOpen) closeMobileSheet();
    onModelSelect?.();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={ref}
        type="button"
        title="Select model"
        onClick={() => {
          if (isMobile) {
            const willOpen = !isMobileOpen;
            if (willOpen) {
              setIsMobileOpen(true);
              onDropdownToggle?.(true);
            } else {
              closeMobileSheet();
              onDropdownToggle?.(false);
            }
            return;
          }
          const newState = !isOpen;
          setIsOpen(newState);
          onDropdownToggle?.(newState);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (isMobile) {
              const willOpen = !isMobileOpen;
              if (willOpen) {
                setIsMobileOpen(true);
                onDropdownToggle?.(true);
              } else {
                closeMobileSheet();
                onDropdownToggle?.(false);
              }
              return;
            }
            const newState = !isOpen;
            setIsOpen(newState);
            onDropdownToggle?.(newState);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="flex w-full min-w-0 items-center justify-between select-none gap-2 rounded-full px-3.5 py-1.5 bg-white dark:bg-neutral-700 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-neutral-100 cursor-pointer"
      >
        <span className="truncate min-w-0">
          {isDisabled ? "Loading..." : selectedModel?.model || "Select a model"}
        </span>
        <svg
          className="h-3 w-3 opacity-70 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {!isMobile && isOpen && (
        <div className="absolute right-0 text-[15px] bottom-full mb-2 z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl overflow-hidden bg-white border border-neutral-100 text-neutral-800 shadow-xl shadow-black/5 backdrop-blur-lg dark:border-neutral-600/40 dark:bg-neutral-800 dark:text-white dark:ring-black/20">
          <div className="px-1 py-2 border-b border-neutral-100 dark:border-neutral-700">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find model..."
              autoCorrect="off"
              className="w-full px-2 py-0.5 bg-transparent border-none border-neutral-200 rounded-md outline-none focus:border-neutral-400 dark:border-neutral-600 dark:focus:border-neutral-400"
            />
          </div>

          <ModelList
            ref={modelListRef}
            models={models}
            selectedModel={selectedModel}
            onModelSelect={handleModelSelect}
            isOpen={isOpen}
            pullingModel={pullingModel}
          />
        </div>
      )}

      {isMobile &&
        isSheetMounted &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close model picker"
              className="absolute inset-0 bg-black/40"
              style={{ opacity: backdropOpacity }}
              onClick={() => {
                closeMobileSheet();
                onDropdownToggle?.(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              ref={sheetRef}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              style={{
                transform: `translateY(${sheetTranslateY}px)`,
                transition:
                  isSheetTransitionEnabled && !isDraggingRef.current
                    ? "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                    : "none",
                paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)",
              }}
              onTransitionEnd={(e) => {
                if (e.propertyName !== "transform") return;
                if (!isSheetAnimating) return;
                setIsSheetAnimating(false);
                if (sheetTranslateY >= sheetHeight - 1) {
                  setIsSheetMounted(false);
                  setSheetTranslateY(0);
                  setBackdropOpacity(0);
                  setIsSheetTransitionEnabled(false);
                }
              }}
            >
              <div
                className="flex items-center justify-center pt-3 pb-2"
                style={{ touchAction: "none" }}
                onTouchStart={(e) => {
                  const y = e.touches[0]?.clientY;
                  if (y === undefined) return;
                  isDraggingRef.current = true;
                  setIsSheetTransitionEnabled(false);
                  dragStartYRef.current = y;
                  dragLastYRef.current = y;
                  dragLastTimeRef.current = performance.now();
                }}
                onTouchMove={(e) => {
                  if (!isDraggingRef.current) return;
                  const startY = dragStartYRef.current;
                  if (startY === null) return;
                  const y = e.touches[0]?.clientY;
                  if (y === undefined) return;
                  const delta = Math.max(0, y - startY);
                  setSheetTranslateY(delta);
                  const progress = Math.min(1, delta / Math.max(1, sheetHeight));
                  setBackdropOpacity(Math.max(0, 1 - progress * 0.9));
                  dragLastYRef.current = y;
                  dragLastTimeRef.current = performance.now();
                }}
                onTouchEnd={() => {
                  if (!isDraggingRef.current) return;
                  isDraggingRef.current = false;
                  const now = performance.now();
                  const startY = dragStartYRef.current;
                  const lastY = dragLastYRef.current;
                  const lastT = dragLastTimeRef.current;
                  const dt = Math.max(1, now - lastT);
                  const dy =
                    lastY !== null && startY !== null ? lastY - startY : 0;
                  const v = dy / dt; // px/ms
                  dragStartYRef.current = null;
                  dragLastYRef.current = null;

                  const shouldClose =
                    sheetTranslateY > Math.min(160, sheetHeight * 0.25) || v > 0.9;

                  setIsSheetTransitionEnabled(true);
                  if (shouldClose) {
                    closeMobileSheet();
                    onDropdownToggle?.(false);
                    return;
                  }
                  setSheetTranslateY(0);
                  setBackdropOpacity(1);
                }}
              >
                <div className="h-1.5 w-10 rounded-full bg-neutral-200 dark:bg-neutral-700" />
              </div>
              <div className="px-4 pb-3">
                <div className="text-sm font-medium">Select model</div>
                <div className="mt-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800/60">
                  <input
                    ref={sheetSearchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Find model..."
                    autoCorrect="off"
                    className="w-full bg-transparent outline-none text-[15px]"
                  />
                </div>
              </div>
              <div className="px-2 pb-2">
                <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                  <ModelList
                    ref={modelListRef}
                    models={models}
                    selectedModel={selectedModel}
                    onModelSelect={handleModelSelect}
                    isOpen={isMobileOpen}
                    pullingModel={pullingModel}
                  />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});

export const ModelList = forwardRef(function ModelList(
  {
    models,
    selectedModel,
    onModelSelect,
    isOpen,
    pullingModel,
  }: {
    models: Model[];
    selectedModel: Model | null;
    onModelSelect: (model: Model) => void | Promise<void>;
    isOpen: boolean;
    pullingModel: string | null;
  },
  ref,
): JSX.Element {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useImperativeHandle(ref, () => ({
    scrollToSelectedModel: () => {
      if (!selectedModel || !scrollContainerRef.current) return;
      const selectedIndex = models.findIndex(
        (m) => m.model === selectedModel.model,
      );
      if (selectedIndex !== -1) scrollToItem(selectedIndex);
    },
    scrollToTop: () => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    },
  }));

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || models.length === 0) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev < models.length - 1 ? prev + 1 : 0;
            scrollToItem(next);
            return next;
          });
          break;
        case "ArrowUp":
          event.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : models.length - 1;
            scrollToItem(next);
            return next;
          });
          break;
        case "Enter":
          event.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < models.length) {
            onModelSelect(models[highlightedIndex]);
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, models, highlightedIndex, onModelSelect]);

  // Scroll active item into view
  const scrollToItem = (index: number) => {
    if (scrollContainerRef.current && index >= 0) {
      const container = scrollContainerRef.current;
      const item = container.children[index] as HTMLElement;
      if (item) {
        // Calculate the exact scroll position to center the item
        const containerHeight = container.clientHeight;
        const itemTop = item.offsetTop;
        const itemHeight = item.clientHeight;
        // Position the item in the center of the container
        container.scrollTop = itemTop - containerHeight / 2 + itemHeight / 2;
      }
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      className="h-64 overflow-y-auto overflow-x-hidden"
    >
      {models.length === 0 ? (
        <div className="px-3 py-2 text-neutral-500 dark:text-neutral-400">
          No models found
        </div>
      ) : (
        models.map((model, index) => {
          return (
            <div key={`${model.model}-${model.digest || "no-digest"}-${index}`}>
              <button
                onClick={() => onModelSelect(model)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex w-full items-center gap-2 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 focus:outline-none cursor-pointer ${
                  highlightedIndex === index ||
                  selectedModel?.model === model.model
                    ? "bg-neutral-100 dark:bg-neutral-700/60"
                    : ""
                }`}
              >
                <span className="flex-1 text-left truncate min-w-0">
                  {model.model}
                </span>
                {model.isCloud() && (
                  <svg
                    className="h-3 fill-current text-neutral-500 dark:text-neutral-400"
                    viewBox="0 0 20 15"
                    strokeWidth={1}
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M4.01511 14.5861H14.2304C16.9183 14.5861 19.0002 12.5509 19.0002 9.9403C19.0002 7.30491 16.8911 5.3046 14.0203 5.3046C12.9691 3.23016 11.0602 2 8.69505 2C5.62816 2 3.04822 4.32758 2.72935 7.47455C1.12954 7.95356 0.0766602 9.29431 0.0766602 10.9757C0.0766602 12.9913 1.55776 14.5861 4.01511 14.5861ZM4.02056 13.1261C2.46452 13.1261 1.53673 12.2938 1.53673 11.0161C1.53673 9.91553 2.24207 9.12934 3.51367 8.79302C3.95684 8.68258 4.11901 8.48427 4.16138 8.00729C4.39317 5.3613 6.29581 3.46007 8.69505 3.46007C10.5231 3.46007 11.955 4.48273 12.8385 6.26013C13.0338 6.65439 13.2626 6.7882 13.7488 6.7882C16.1671 6.7882 17.5337 8.19719 17.5337 9.97707C17.5337 11.7526 16.1242 13.1261 14.2852 13.1261H4.02056Z" />
                  </svg>
                )}
                {model.digest === undefined && (
                    <ArrowDownTrayIcon
                      className="h-4 w-4 text-neutral-500 dark:text-neutral-400"
                      strokeWidth={1.75}
                    />
                  )}
                {pullingModel === model.model && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Pulling...
                  </span>
                )}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
});
