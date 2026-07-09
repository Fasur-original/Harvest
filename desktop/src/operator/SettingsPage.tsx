import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLlmCleanupStore } from "@/store/llm-cleanup-store";
import { useServiceStore } from "@/store/service-store";
import PageHeader from "./PageHeader";

function SettingsPage() {
  const defaultTranslation = useServiceStore((s) => s.defaultTranslation);
  const setDefaultTranslation = useServiceStore((s) => s.setDefaultTranslation);
  const activeService = useServiceStore((s) => s.activeService);
  const error = useServiceStore((s) => s.error);
  const fetchActiveService = useServiceStore((s) => s.fetchActiveService);
  const startService = useServiceStore((s) => s.startService);
  const clearService = useServiceStore((s) => s.clearService);

  const llmStatus = useLlmCleanupStore();
  const fetchLlmStatus = useLlmCleanupStore((s) => s.fetchStatus);
  const setLlmEnabled = useLlmCleanupStore((s) => s.setEnabled);

  useEffect(() => {
    fetchActiveService();
    fetchLlmStatus();
  }, [fetchActiveService, fetchLlmStatus]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Configure today's service." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today's Service</CardTitle>
          <p className="text-muted-foreground text-sm">
            A reference named without a translation (e.g. "John 3:16") resolves to this translation for today's
            service. Naming one explicitly while speaking ("...in the King James") always overrides it.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {activeService ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
              <CheckCircle2 size={16} />
              Service #{activeService.id} active — default {activeService.default_translation ?? "install default"}
            </div>
          ) : (
            <div className="bg-muted/50 text-muted-foreground rounded-lg px-3 py-2 text-sm">
              No active service — every reference uses the install-wide default translation.
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-muted-foreground text-xs">Default translation</Label>
              <select
                value={defaultTranslation}
                onChange={(e) => setDefaultTranslation(e.target.value)}
                className="border-input bg-transparent h-8 rounded-lg border px-2.5 text-sm"
              >
                <option value="">Install default</option>
                <option>KJV</option>
                <option>ASV</option>
                <option>YLT</option>
                <option>WEB</option>
              </select>
            </div>
            <Button
              onClick={() => {
                startService();
                toast.success(activeService ? "Service updated" : "Service started");
              }}
            >
              {activeService ? "Update Service" : "Start Service"}
            </Button>
            {activeService && (
              <Button
                variant="outline"
                onClick={() => {
                  clearService();
                  toast("Service cleared");
                }}
              >
                Clear Service
              </Button>
            )}
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Cleanup</CardTitle>
          <p className="text-muted-foreground text-sm">
            When regex alone can't find a direct reference, a small local model classifies the transcript into
            verse/song matches before falling back to plain wording search. Every verse it finds is still checked
            against the real Bible data before it's ever shown -- this only affects unclear speech, not accuracy on
            clear references.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ai-cleanup-toggle" className="text-sm font-medium">
              Use AI cleanup for unclear speech
            </Label>
            <Switch
              id="ai-cleanup-toggle"
              checked={llmStatus.manual_enabled}
              disabled={!!llmStatus.auto_disabled_reason}
              onCheckedChange={(checked) => {
                setLlmEnabled(checked);
                toast(checked ? "AI cleanup enabled" : "AI cleanup disabled");
              }}
            />
          </div>
          {llmStatus.auto_disabled_reason && (
            <p className="text-destructive text-xs">
              Automatically disabled: {llmStatus.auto_disabled_reason}. Free up memory and restart the app to
              re-enable.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsPage;
