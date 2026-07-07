import { CheckCircle2 } from "lucide-react";
import PageHeader from "./PageHeader";

type SongSummary = { id: number; title: string };
type ActiveService = { id: number; default_translation: string | null; songs: SongSummary[] };

function SettingsView({
  defaultTranslation,
  setDefaultTranslation,
  activeService,
  serviceError,
  onStart,
  onClear,
}: {
  defaultTranslation: string;
  setDefaultTranslation: (t: string) => void;
  activeService: ActiveService | null;
  serviceError: string | null;
  onStart: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Configure today's service." />
      <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Today's Service</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            A reference named without a translation (e.g. "John 3:16") resolves to this translation for today's
            service. Naming one explicitly while speaking ("...in the King James") always overrides it.
          </p>
        </div>

        {activeService ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
            <CheckCircle2 size={16} />
            Service #{activeService.id} active — default {activeService.default_translation ?? "install default"}
          </div>
        ) : (
          <div className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            No active service — every reference uses the install-wide default translation.
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-neutral-600 dark:text-neutral-300">
            Default translation
            <select
              value={defaultTranslation}
              onChange={(e) => setDefaultTranslation(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Install default</option>
              <option>KJV</option>
              <option>ASV</option>
              <option>YLT</option>
              <option>WEB</option>
            </select>
          </label>
          <button
            type="button"
            onClick={onStart}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            {activeService ? "Update Service" : "Start Service"}
          </button>
          {activeService && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Clear Service
            </button>
          )}
        </div>
        {serviceError && <p className="text-sm text-red-500">{serviceError}</p>}
      </section>
    </div>
  );
}

export default SettingsView;
