import { pushToDisplay, type DisplayContent } from "../lib/display-bus";

const SAMPLE_VERSE: DisplayContent = {
  kind: "verse",
  text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. — John 3:16 (KJV)",
};

const SAMPLE_SONG_LINE: DisplayContent = {
  kind: "song",
  text: "Amazing grace, how sweet the sound, that saved a wretch like me.",
};

function OperatorConsole() {
  return (
    <main className="flex h-screen flex-col gap-4 bg-neutral-100 p-6 dark:bg-neutral-900">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        Harvest — Operator Console
      </h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Phase 01 mechanics check — hardcoded content only, no matching yet.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => pushToDisplay(SAMPLE_VERSE)}
          className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
        >
          Show Sample Verse
        </button>
        <button
          type="button"
          onClick={() => pushToDisplay(SAMPLE_SONG_LINE)}
          className="rounded-lg bg-neutral-800 px-4 py-2 font-medium text-white hover:bg-neutral-700"
        >
          Show Sample Song Line
        </button>
      </div>
    </main>
  );
}

export default OperatorConsole;
