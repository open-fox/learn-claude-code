"use client";

import { Play, Pause, SkipBack, SkipForward, RotateCcw } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface StepControlsProps {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  isPlaying: boolean;
  onToggleAutoPlay: () => void;
  stepTitle: string;
  stepDescription: string;
  className?: string;
  compact?: boolean;
}

export function StepControls({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onReset,
  isPlaying,
  onToggleAutoPlay,
  stepTitle,
  stepDescription,
  className,
  compact = false,
}: StepControlsProps) {
  const t = useTranslations("sim");

  const iconSize = compact ? 14 : 16;

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-3", className)}>
      {/* Annotation */}
      <div
        className={cn(
          "rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40",
          compact ? "px-3 py-2" : "px-4 py-3"
        )}
      >
        <div
          className={cn(
            "font-semibold text-blue-900 dark:text-blue-200",
            compact ? "mb-0.5 text-xs" : "mb-1 text-sm"
          )}
        >
          {stepTitle}
        </div>
        <div className={cn("text-blue-700 dark:text-blue-300", compact ? "text-xs leading-5" : "text-sm")}>
          {stepDescription}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
          <button
            onClick={onReset}
            className={cn(
              "rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
              compact ? "p-1" : "p-1.5"
            )}
            title={t("reset")}
            aria-label={t("reset")}
          >
            <RotateCcw size={iconSize} />
          </button>
          <button
            onClick={onPrev}
            disabled={currentStep === 0}
            className={cn(
              "rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
              compact ? "p-1" : "p-1.5"
            )}
            title={t("previous_step")}
            aria-label={t("previous_step")}
          >
            <SkipBack size={iconSize} />
          </button>
          <button
            onClick={onToggleAutoPlay}
            className={cn(
              "rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
              compact ? "p-1" : "p-1.5"
            )}
            title={isPlaying ? t("pause") : t("autoplay")}
            aria-label={isPlaying ? t("pause") : t("autoplay")}
          >
            {isPlaying ? <Pause size={iconSize} /> : <Play size={iconSize} />}
          </button>
          <button
            onClick={onNext}
            disabled={currentStep === totalSteps - 1}
            className={cn(
              "rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
              compact ? "p-1" : "p-1.5"
            )}
            title={t("next_step")}
            aria-label={t("next_step")}
          >
            <SkipForward size={iconSize} />
          </button>
        </div>

        {/* Step indicator */}
        <div className={cn("flex items-center", compact ? "gap-1.5" : "gap-2")}>
          <div className={cn("flex", compact ? "gap-0.5" : "gap-1")}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={cn(
                  compact ? "h-1.5 w-1.5 rounded-full transition-colors" : "h-1.5 w-1.5 rounded-full transition-colors",
                  i === currentStep
                    ? "bg-blue-500"
                    : i < currentStep
                      ? "bg-blue-300 dark:bg-blue-700"
                      : "bg-zinc-200 dark:bg-zinc-700"
                )}
              />
            ))}
          </div>
          <span className={cn("font-mono text-zinc-400", compact ? "text-[10px]" : "text-xs")}>
            {currentStep + 1}/{totalSteps}
          </span>
        </div>
      </div>
    </div>
  );
}
