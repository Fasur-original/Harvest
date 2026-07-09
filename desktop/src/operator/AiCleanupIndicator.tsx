import { useEffect } from "react";
import { AlertTriangle, Sparkles, SparklesIcon } from "lucide-react";
import { useLlmCleanupStore } from "@/store/llm-cleanup-store";

// Separate from the main WS connection status -- the operator needs to know
// at a glance whether AI cleanup is actually helping right now (disabled by
// the manual toggle, auto-disabled for low RAM, or its last call just timed
// out), rather than silently wondering why matches have gotten sparser.
function AiCleanupIndicator() {
  const status = useLlmCleanupStore();
  const fetchStatus = useLlmCleanupStore((s) => s.fetchStatus);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (status.auto_disabled_reason) {
    return (
      <div
        className="bg-sidebar-accent flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-amber-500 dark:text-amber-400"
        title={status.auto_disabled_reason}
      >
        <AlertTriangle size={14} />
        <span className="truncate">AI cleanup off (low RAM)</span>
      </div>
    );
  }

  if (!status.manual_enabled) {
    return (
      <div className="bg-sidebar-accent text-sidebar-accent-foreground/50 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs">
        <SparklesIcon size={14} />
        <span>AI cleanup off</span>
      </div>
    );
  }

  if (status.last_call_timed_out) {
    return (
      <div className="bg-sidebar-accent flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-amber-500 dark:text-amber-400">
        <AlertTriangle size={14} />
        <span>AI cleanup timed out</span>
      </div>
    );
  }

  return (
    <div className="bg-sidebar-accent flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-green-600 dark:text-green-400">
      <Sparkles size={14} />
      <span>AI cleanup live</span>
    </div>
  );
}

export default AiCleanupIndicator;
