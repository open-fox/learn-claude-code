"use client";

import { lazy, Suspense } from "react";

const visualizations: Record<
  string,
  React.LazyExoticComponent<React.ComponentType<any>>
> = {
  s01: lazy(() => import("@/components/visualizations/s01-agent-loop")),
  s02: lazy(() => import("@/components/visualizations/s02-tool-dispatch")),
  s03: lazy(() => import("@/components/visualizations/s03-todo-write")),
  s04: lazy(() => import("@/components/visualizations/s04-subagent")),
  s05: lazy(() => import("@/components/visualizations/s05-skill-loading")),
  s06: lazy(() => import("@/components/visualizations/s06-context-compact")),
  s07: lazy(() => import("@/components/visualizations/s07-task-system")),
  s08: lazy(() => import("@/components/visualizations/s08-background-tasks")),
  s09: lazy(() => import("@/components/visualizations/s09-agent-teams")),
  s10: lazy(() => import("@/components/visualizations/s10-team-protocols")),
  s11: lazy(() => import("@/components/visualizations/s11-autonomous-agents")),
  s12: lazy(
    () => import("@/components/visualizations/s12-worktree-task-isolation")
  ),
};

export function EmbedViz({ version }: { version: string }) {
  const Component = visualizations[version];

  if (!Component) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        No visualization for <code className="ml-1">{version}</code>
      </div>
    );
  }

  const isCompactS01 = version === "s01";

  return (
    <Suspense
      fallback={
        <div className="min-h-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      }
    >
      <Component {...(isCompactS01 ? { compact: true, hideTitle: true } : {})} />
    </Suspense>
  );
}
