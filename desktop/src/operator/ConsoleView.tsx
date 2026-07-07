import LiveTranscript from "./LiveTranscript";
import MatchOptions, { type Candidate } from "./MatchOptions";
import PageHeader from "./PageHeader";
import ReadingQueue from "./ReadingQueue";
import SuggestedMatch, { type SuggestionMessage } from "./SuggestedMatch";
import type { ConfirmablePayload } from "./types";

function ConsoleView({
  lastMessage,
  send,
  translation,
  transcriptLines,
  suggestion,
  candidates,
  onConfirm,
  onDismissSuggestion,
  onDismissCandidates,
}: {
  lastMessage: unknown;
  send: (data: unknown) => void;
  translation: string;
  transcriptLines: string[];
  suggestion: SuggestionMessage | null;
  candidates: Candidate[] | null;
  onConfirm: (payload: ConfirmablePayload) => void;
  onDismissSuggestion: () => void;
  onDismissCandidates: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Live Console" subtitle="Matches from the live transcript, confirmed one at a time." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <ReadingQueue lastMessage={lastMessage} send={send} translation={translation} />
        <div className="flex flex-col gap-6">
          <LiveTranscript lines={transcriptLines} />
          <SuggestedMatch suggestion={suggestion} onConfirm={onConfirm} onDismiss={onDismissSuggestion} />
          <MatchOptions candidates={candidates} onConfirm={onConfirm} onDismiss={onDismissCandidates} />
        </div>
      </div>
    </div>
  );
}

export default ConsoleView;
