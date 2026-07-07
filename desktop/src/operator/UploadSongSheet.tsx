import { useState, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, UploadCloud } from "lucide-react";

const API_BASE = "http://localhost:8000";

type ImportResult = {
  imported: { id: number; title: string }[];
  errors: { tab: string; problem: string }[];
};

const exampleRows: [string, string][] = [
  ["Amazing grace, how sweet the sound", ""],
  ["That saved a wretch like me", ""],
  ["I once was lost, but now am found", "3"],
  ["Was blind, but now I see", ""],
];

function FormatGuide() {
  return (
    <details className="group rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-300">
      <summary className="cursor-pointer font-medium text-neutral-700 select-none dark:text-neutral-200">
        Format guide — one tab per song
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p>
          Each tab needs a header row, then one lyric line per row. The tab name becomes the song title.
        </p>
        <div className="overflow-x-auto">
          <table className="border-collapse overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
            <thead>
              <tr className="bg-neutral-200 dark:bg-neutral-700">
                <th className="border border-neutral-300 px-2 py-1 text-left font-semibold dark:border-neutral-600">
                  line_text
                </th>
                <th className="border border-neutral-300 px-2 py-1 text-left font-semibold dark:border-neutral-600">
                  repeat_count
                </th>
              </tr>
            </thead>
            <tbody>
              {exampleRows.map(([text, repeat], i) => (
                <tr key={i} className="bg-white dark:bg-neutral-800">
                  <td className="border border-neutral-300 px-2 py-1 dark:border-neutral-700">{text}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-neutral-400 dark:border-neutral-700">
                    {repeat || "(blank)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <span className="font-semibold">line_text</span> is required.{" "}
          <span className="font-semibold">repeat_count</span> is optional — blank defaults to 1; only fill it in for
          a line sung more than once.
        </p>
      </div>
    </details>
  );
}

function UploadSongSheet() {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/songs/upload`, { method: "POST", body: formData });
      if (!res.ok) {
        setError(`Error ${res.status}`);
        return;
      }
      setResult(await res.json());
    } finally {
      setPending(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) upload(dropped);
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Bulk Upload</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Upload a song sheet workbook to sync the library.
        </p>
      </div>

      <FormatGuide />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-orange-400 bg-orange-50 dark:bg-orange-500/5"
            : "border-neutral-300 dark:border-neutral-700"
        }`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <UploadCloud size={22} />
        </span>
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Drop your spreadsheet here</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Supports .xlsx</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600">
            Browse Files
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) upload(picked);
                e.target.value = "";
              }}
            />
          </label>
          <a
            href={`${API_BASE}/songs/template`}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Download size={14} /> Download Template
          </a>
        </div>
      </div>

      {pending && <p className="text-sm text-neutral-500 dark:text-neutral-400">Uploading…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (result.imported.length > 0 || result.errors.length > 0) && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs">
            {result.imported.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
                <CheckCircle2 size={12} /> {result.imported.length} Ready
              </span>
            )}
            {result.errors.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                <AlertTriangle size={12} /> {result.errors.length} Error{result.errors.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs tracking-wide text-neutral-500 uppercase dark:bg-neutral-800/50 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Song</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {result.imported.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-neutral-100">{s.title}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex w-fit items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
                        <CheckCircle2 size={12} /> Ready
                      </span>
                    </td>
                  </tr>
                ))}
                {result.errors.map((e, i) => (
                  <tr key={`err-${i}`}>
                    <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-neutral-100">{e.tab}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                        title={e.problem}
                      >
                        <AlertTriangle size={12} /> {e.problem}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export default UploadSongSheet;
