import { useEffect, useRef } from "react";
import { useState } from "react";
import { ref, update } from "firebase/database";
import { db } from "../../firestore";

/**
 * JournalEditorPane renders the right column containing the active note fields.
 *
 * This component uses manual-save behavior:
 * - User edits local state first.
 * - Save button writes to Realtime Database.
 * - UI tracks save status: idle -> dirty -> saving -> saved/error.
 *
 * Why local state at all if we already have activeNote from parent?
 * Because form inputs need immediate per-keystroke updates that can diverge
 * from server data until user explicitly clicks Save.
 */
function JournalEditorPane({
  // Active trip id determines save path parent segment.
  activeTripId,
  // Active note id determines exact save target.
  activeNoteId,
  // Active trip object used for title display context.
  activeTrip,
  // Active note object provides initial editor values.
  activeNote,
}) {
  // Ref to textarea DOM node for auto-resize behavior.
  const textareaRef = useRef(null);
  const [dateLabel, setDateLabel] = useState(activeNote?.displayDate || "");
  const [entryText, setEntryText] = useState(activeNote?.entryText || "");
  const [saveState, setSaveState] = useState("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");

  // Snapshot of last persisted values used to detect unsaved edits.
  const lastSavedRef = useRef({
    dateLabel: activeNote?.displayDate || "",
    entryText: activeNote?.entryText || "",
    displayDateTimestamp: activeNote?.displayDateTimestamp || 0,
  });

  /**
   * This effect auto-resizes the textarea as text changes.
   * It keeps long content scrollable by capping maximum visible height.
   *
   * This is a UI convenience effect only; it does not modify database state.
   */
  useEffect(() => {
    // Skip when textarea DOM node is not mounted yet.
    if (!textareaRef.current) {
      return;
    }

    // Reset height first so scrollHeight reflects current text accurately.
    textareaRef.current.style.height = "auto";
    // Clamp dynamic height so textarea does not grow without limit.
    const nextHeight = Math.min(textareaRef.current.scrollHeight, 700);
    // Apply computed height for smoother typing experience.
    textareaRef.current.style.height = `${nextHeight}px`;
  }, [entryText, activeNote]);

  /**
   * Reset local editor state when a different note becomes active.
   *
   * requestAnimationFrame defers updates to the next paint cycle,
   * which avoids awkward timing when parent state is switching selection.
   *
   * This keeps form fields aligned with selected note when user changes day.
   */
  useEffect(() => {
    // Schedule reset one paint later to avoid transient selection timing issues.
    const frameId = window.requestAnimationFrame(() => {
      // Compute safe fallback values when no active note exists.
      const nextDateLabel = activeNote?.displayDate || "";
      const nextEntryText = activeNote?.entryText || "";

      // Sync editable date label with selected note.
      setDateLabel(nextDateLabel);
      // Sync editable body text with selected note.
      setEntryText(nextEntryText);
      // Reset save-status indicators for new note context.
      setSaveState("idle");
      setSaveErrorMessage("");

      // Refresh last-saved snapshot to match selected note values.
      lastSavedRef.current = {
        dateLabel: nextDateLabel,
        entryText: nextEntryText,
        displayDateTimestamp: activeNote?.displayDateTimestamp || 0,
      };
    });

    // Cancel pending frame callback if selection changes before it runs.
    return () => window.cancelAnimationFrame(frameId);
  }, [activeNoteId, activeNote]);

  /**
   * markDirtyIfChanged compares current inputs to the last saved snapshot.
   * If values differ, we enable Save button by moving to "dirty" state.
   *
   * If values match, button becomes disabled via "idle" state.
   */
  const markDirtyIfChanged = (nextDateLabel, nextEntryText) => {
    // Compare current inputs against last saved snapshot.
    const isDirty =
      nextDateLabel !== lastSavedRef.current.dateLabel ||
      nextEntryText !== lastSavedRef.current.entryText;

    // Dirty means save button should be enabled; idle means disabled.
    setSaveState(isDirty ? "dirty" : "idle");

    // Clear prior save error once user edits again.
    if (isDirty && saveErrorMessage) {
      setSaveErrorMessage("");
    }
  };

  /**
   * handleDateChange updates local date text and marks the note as dirty.
   */
  const handleDateChange = (value) => {
    // Update local date field immediately as user types.
    setDateLabel(value);
    // Re-evaluate whether unsaved changes now exist.
    markDirtyIfChanged(value, entryText);
  };

  /**
   * handleEntryChange updates local markdown text and marks the note as dirty.
   */
  const handleEntryChange = (value) => {
    // Update local markdown body immediately as user types.
    setEntryText(value);
    // Re-evaluate whether unsaved changes now exist.
    markDirtyIfChanged(dateLabel, value);
  };

  /**
   * handleSaveClick writes the current editor values to Realtime Database.
   *
   * Save guards:
   * - no active trip/note -> return
   * - no changes vs last saved snapshot -> return
   *
   * This avoids unnecessary network writes.
   */
  const handleSaveClick = async () => {
    // Guard against save attempts when no target note is selected.
    if (!activeTripId || !activeNoteId) {
      return;
    }

    // Compute whether there is anything new to persist.
    const hasChanges =
      dateLabel !== lastSavedRef.current.dateLabel ||
      entryText !== lastSavedRef.current.entryText;

    // Skip write when values already match last saved snapshot.
    if (!hasChanges) {
      setSaveState("idle");
      return;
    }

    // Enter saving state to disable button and show progress text.
    setSaveState("saving");
    // Clear previous save error before new write attempt.
    setSaveErrorMessage("");

    // Parse human-readable date label into numeric timestamp.
    const parsedDate = Date.parse(dateLabel);
    // Accepts either parseable date text or falls back to previous/current time.
    const nextTimestamp = Number.isNaN(parsedDate)
      ? lastSavedRef.current.displayDateTimestamp || Date.now()
      : parsedDate;

    try {
      // Persist updated fields to exact note path in database.
      await update(ref(db, `trips/${activeTripId}/notes/${activeNoteId}`), {
        displayDate: dateLabel,
        entryText,
        displayDateTimestamp: nextTimestamp,
        updatedAt: Date.now(),
      });

      // Update local saved snapshot so future dirty checks are accurate.
      lastSavedRef.current = {
        dateLabel,
        entryText,
        displayDateTimestamp: nextTimestamp,
      };

      // Mark operation complete for status label/button logic.
      setSaveState("saved");
    } catch (error) {
      // Log full error for developer debugging.
      console.error("Unable to save note.", error);
      // Set explicit error status for user-facing message color/state.
      setSaveState("error");
      // Build detailed message when Firebase error code is available.
      setSaveErrorMessage(
        error?.code
          ? `${error.code}: ${error.message || "Save failed."}`
          : "Save failed.",
      );
    }
  };

  /**
   * getSaveStatusLabel converts saveState enum into user-facing text.
   *
   * Keeping this in one function prevents duplicated conditional text in JSX.
   */
  const getSaveStatusLabel = () => {
    // State branch for unsaved local edits.
    if (saveState === "dirty") {
      return "Unsaved changes";
    }

    // State branch for in-progress write.
    if (saveState === "saving") {
      return "Saving...";
    }

    // State branch for successful write completion.
    if (saveState === "saved") {
      return "Saved";
    }

    // State branch for failed write attempt.
    if (saveState === "error") {
      return "Save failed";
    }

    // Fallback for idle/unknown states (show no status line).
    return "";
  };

  // Render editor panel and save-state messages.
  return (
    <section className="flex min-h-112 flex-col rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-cyan-200 uppercase">
            Active note
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            {activeTrip ? activeTrip.title || "Untitled trip" : "Select a trip"}
          </h2>
        </div>
        <button
          type="button"
          disabled
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-400"
        >
          Download Trip Archive
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">Manual save mode</p>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={
            !activeNote ||
            saveState === "saving" ||
            saveState === "idle" ||
            saveState === "saved"
          }
          className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs font-semibold text-cyan-200 transition enabled:hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
        >
          {saveState === "saving" ? "Saving..." : "Save Note"}
        </button>
      </div>

      {getSaveStatusLabel() ? (
        <p
          className={`mb-4 text-xs ${
            saveState === "error"
              ? "text-rose-300"
              : saveState === "saved"
                ? "text-emerald-300"
                : "text-slate-400"
          }`}
        >
          {getSaveStatusLabel()}
        </p>
      ) : null}

      {saveErrorMessage ? (
        <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {saveErrorMessage}
        </p>
      ) : null}

      {!activeNote ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
          Pick a day from the middle column to view its markdown entry.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <label className="space-y-2 text-sm text-slate-200">
            <span>Date label</span>
            <input
              type="text"
              value={dateLabel}
              onChange={(event) => handleDateChange(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/70"
            />
          </label>

          <label className="flex min-h-0 flex-1 flex-col space-y-2 text-sm text-slate-200">
            <span>Markdown entry</span>
            <textarea
              ref={textareaRef}
              value={entryText}
              onChange={(event) => handleEntryChange(event.target.value)}
              className="min-h-48 max-h-175 flex-1 resize-none overflow-y-auto rounded-3xl border border-white/10 bg-slate-900/70 px-4 py-4 font-mono text-sm leading-6 text-slate-100 outline-none transition focus:border-cyan-300/70"
              placeholder="Write your markdown journal entry here."
            />
          </label>
        </div>
      )}
    </section>
  );
}

export default JournalEditorPane;
