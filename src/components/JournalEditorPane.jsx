import { useCallback, useEffect, useRef, useState } from "react";
import { ref, update } from "firebase/database";
import { db } from "../../firestore";
import { marked } from "marked";

const AUTOSAVE_INTERVAL_MS = 20000; // 20 seconds

const formatDisplayDateFromTimestamp = (timestamp) => {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const getDisplayDateForNote = (note) => {
  return (
    formatDisplayDateFromTimestamp(note?.displayDateTimestamp) ||
    note?.displayDate ||
    ""
  );
};

const normalizeDateLabelForParsing = (value) => {
  if (!value) {
    return "";
  }

  // Accept both old and new UI formats when converting free-form text to a timestamp.
  const trimmed = value.trim();
  const withoutParenWeekday = trimmed.replace(/\s*\([^)]*\)\s*$/, "");
  const withoutLeadingWeekday = withoutParenWeekday.replace(
    /^[A-Za-z]+,\s+/,
    "",
  );
  return withoutLeadingWeekday;
};

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
  // All notes for the active trip
  notes,
  // Whether note mutations are allowed for the current session.
  canEdit,
  // Whether the editor is currently in full-screen mode.
  isEditorFullScreen,
  // Callback to toggle full-screen mode.
  onToggleFullScreen,
}) {
  // Ref to textarea DOM node for auto-resize behavior.
  const textareaRef = useRef(null);
  const [dateLabel, setDateLabel] = useState(getDisplayDateForNote(activeNote));
  const [location, setLocation] = useState(activeNote?.location || ""); // Start Location from the selected note; fall back to blank if missing.
  const [entryText, setEntryText] = useState(activeNote?.entryText || "");
  const [saveState, setSaveState] = useState("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isExporting, setIsExporting] = useState(false); // used to control export button disabled/loading text
  const [exportError, setExportError] = useState(""); // will show failure message if export fails
  const saveStateRef = useRef(saveState);
  const saveIfNeededRef = useRef(async () => {});

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Snapshot of last persisted values used to detect unsaved edits.
  const lastSavedRef = useRef({
    dateLabel: getDisplayDateForNote(activeNote),
    location: activeNote?.location || "", // Keep last saved location so dirty checks include location edits.
    entryText: activeNote?.entryText || "",
    displayDateTimestamp: activeNote?.displayDateTimestamp || 0,
  });

  // Helper function to determine if there are unsaved changes.
  const hasUnsavedChanges = useCallback(
    (nextDateLabel, nextLocation, nextEntryText) => {
      // Accept nextLocation so location-only edits are detected.
      return (
        nextDateLabel !== lastSavedRef.current.dateLabel ||
        nextLocation !== lastSavedRef.current.location || // Compare location against the saved snapshot.
        nextEntryText !== lastSavedRef.current.entryText
      );
    },
    [],
  );

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
      const nextDateLabel = getDisplayDateForNote(activeNote);
      const nextLocation = activeNote?.location || "";
      const nextEntryText = activeNote?.entryText || "";

      // Sync editable date label with selected note.
      setDateLabel(nextDateLabel);
      // Sync editable location with selected note.
      setLocation(nextLocation);
      // Sync editable body text with selected note.
      setEntryText(nextEntryText);
      // Reset save-status indicators for new note context.
      setSaveState("idle");
      setSaveErrorMessage("");

      // Refresh last-saved snapshot to match selected note values.
      lastSavedRef.current = {
        dateLabel: nextDateLabel,
        location: nextLocation, // Keep snapshot aligned with selected note location.
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
  const markDirtyIfChanged = (nextDateLabel, nextLocation, nextEntryText) => {
    // Include location in the dirty-state calculation inputs.
    // Compare current inputs against last saved snapshot.
    const isDirty = hasUnsavedChanges(
      nextDateLabel,
      nextLocation,
      nextEntryText,
    ); // Reuse one comparison that now checks location too.

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
    if (!canEdit) {
      return;
    }

    // Update local date field immediately as user types.
    setDateLabel(value);
    // Re-evaluate whether unsaved changes now exist.
    markDirtyIfChanged(value, location, entryText); // Preserve current location when re-checking dirty state.
  };

  const handleLocationChange = (value) => {
    // Centralize location edits so location changes can mark the note dirty.
    if (!canEdit) {
      return;
    }

    setLocation(value); // Update local location state immediately while typing.
    markDirtyIfChanged(dateLabel, value, entryText); // Re-check dirty state using the newly typed location.
  };

  /**
   * handleEntryChange updates local markdown text and marks the note as dirty.
   */
  const handleEntryChange = (value) => {
    if (!canEdit) {
      return;
    }

    // Update local markdown body immediately as user types.
    setEntryText(value);
    // Re-evaluate whether unsaved changes now exist.
    markDirtyIfChanged(dateLabel, location, value); // Preserve current location when re-checking dirty state.
  };

  const handleEditorBlur = () => {
    if (!canEdit) {
      return;
    }

    // Do not attempt blur-save unless a concrete trip and note are selected.
    if (!activeTripId || !activeNoteId) {
      // Exit early when there is no valid note target.
      return;
    }
    // Do not issue another request if a save is already in flight.
    if (saveStateRef.current === "saving") {
      // Exit to prevent overlapping writes for the same note.
      return;
    }
    // Do not call save when no unsaved changes exist.
    if (saveStateRef.current !== "dirty") {
      // Exit because there is nothing new to persist.
      return;
    }
    // Do not attempt a blur-save while the browser reports offline state.
    if (!navigator.onLine) {
      // Exit and let interval/manual save handle persistence when online.
      return;
    }
    // Trigger the shared save path so blur-save and manual/interval save stay consistent.
    void saveIfNeededRef.current();
  };

  const saveIfNeeded = async () => {
    if (!canEdit) {
      return;
    }

    // Guard against save attempts when no target note is selected.
    if (!activeTripId || !activeNoteId) {
      return;
    }
    // Has anything changed vs last save?
    const hasChanges = hasUnsavedChanges(dateLabel, location, entryText); // Consider location when deciding whether a save is required.
    // If nothing changed, skip network write and reset status to idle.
    if (!hasChanges) {
      setSaveState("idle");
      return;
    }
    // If something changed ...
    setSaveState("saving");
    setSaveErrorMessage("");

    const normalizedDateLabel = normalizeDateLabelForParsing(dateLabel);
    const parsedDate = Date.parse(normalizedDateLabel);
    // nextTimestamp is the value saved to Firebase. It is either a parseable date or falls back to last saved/current time.
    const nextTimestamp = Number.isNaN(parsedDate)
      ? lastSavedRef.current.displayDateTimestamp || Date.now()
      : parsedDate;
    const nextDisplayDate = formatDisplayDateFromTimestamp(nextTimestamp);
    // Save updated fields to the database, at the exact path for the active note.
    try {
      await update(ref(db, `trips/${activeTripId}/notes/${activeNoteId}`), {
        displayDate: nextDisplayDate,
        location,
        entryText,
        displayDateTimestamp: nextTimestamp,
        updatedAt: Date.now(),
      });
      setDateLabel(nextDisplayDate);
      // Update local saved snapshot so future dirty checks are accurate, i.e.,
      // we know what the last saved values were for comparison against current inputs.
      lastSavedRef.current = {
        dateLabel: nextDisplayDate,
        location, // Store the latest saved location for future dirty comparisons.
        entryText,
        displayDateTimestamp: nextTimestamp,
      };
      setSaveState("saved");
    } catch (error) {
      console.error("Unable to save note.", error);
      setSaveState("error");
      setSaveErrorMessage(
        error?.code
          ? `${error.code}: ${error.message || "Save failed."}`
          : "Save failed.",
      );
    }
  };

  useEffect(() => {
    saveIfNeededRef.current = saveIfNeeded;
  });

  useEffect(() => {
    if (!activeTripId || !activeNoteId) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      // if it's in the middle of saving, don't try to save again
      if (saveStateRef.current === "saving") {
        return;
      }
      // if it's nothing has changed, don't try to save
      if (saveStateRef.current !== "dirty") {
        return;
      }
      // if the user is offline, don't try to save
      if (!navigator.onLine) {
        return;
      }

      void saveIfNeededRef.current();
    }, AUTOSAVE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeTripId, activeNoteId]);

  const getExportableNotes = () => {
    // copy notes array and
    // filter out any notes that have no entry text, then
    // sort by displayDateTimestamp ascending
    return [...notes]
      .filter((note) => (note.entryText || "").trim().length > 0)
      .sort(
        (a, b) => (a.displayDateTimestamp || 0) - (b.displayDateTimestamp || 0),
      );
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
    if (!canEdit) {
      return;
    }

    await saveIfNeeded();
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

  const handleExportClick = () => {
    setIsExporting(true);
    setExportError("");

    try {
      const exportableNotes = getExportableNotes();
      // Convert notes to markdown format, including a header for each note's date and a horizontal rule between notes.
      const markdownContent = exportableNotes
        .map(
          (note) =>
            `## ${note.displayDate || "Untitled date"}\n\n${note.entryText || ""}`,
        )
        .join("\n\n");
      // Convert markdown to HTML using marked library
      const rawHtmlBody = marked.parse(markdownContent);
      // Remove all <a> tags from the HTML body, keeping only the inner text of the links.
      // This prevents external links being included in exported HTML, which will be opened
      // in a browser and could be a security risk....from AI; prob never apply to me
      const htmlBodyWithoutLinks = rawHtmlBody.replace(
        /<a\b[^>]*>(.*?)<\/a>/gi,
        "$1",
      );
      // Wrap the HTML body in a complete HTML document structure with a <head>
      // and <body> section, including some basic styling for readability.
      const htmlDocument = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Trip Export</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; margin: 40px; line-height: 1.5; color: #111; }
      h2 { margin-top: 28px; margin-bottom: 10px; }
      p { margin: 10px 0; }
      ul, ol { margin: 10px 0 10px 24px; }
      table { border-collapse: collapse; margin: 12px 0; width: 100%; }
      th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; vertical-align: top; }
      hr { margin: 24px 0; border: none; border-top: 1px solid #ccc; }
    </style>
  </head>
  <body>
    ${htmlBodyWithoutLinks}
  </body>
</html>`;

      // Create downloadable HTML file content
      const blob = new Blob([htmlDocument], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      // Create an <a> element in JS
      const a = document.createElement("a");
      // set its href to the blob URL and set the download attribute to specify the filename
      a.href = url;
      // Use the trip title as part of the filename, replacing any unsafe characters with hyphens.
      const safeTripName = (activeTrip?.title || "trip").replace(
        /[^\w-]+/g,
        "-",
      );
      a.download = `${safeTripName}-Green-Book.html`;
      document.body.appendChild(a);
      // Programmatically click the <a> element to trigger the download
      a.click();
      // Clean up by removing the temporary anchor and revoking the object URL.
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Unable to export trip.", error);
      setExportError("Unable to export right now. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // Render editor panel and save-state messages.
  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
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
          disabled={
            isExporting || !activeTrip || getExportableNotes().length === 0
          }
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-400"
          onClick={handleExportClick}
        >
          {isExporting ? "Exporting..." : "Download Trip Archive"}
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400 flex-1">
          <span
            style={{
              marginRight: 4,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: isOnline ? "limegreen" : "crimson",
              display: "inline-block",
            }}
          ></span>
          <span>{isOnline ? "Online" : "Offline"}</span>
        </p>
        <button
          type="button"
          onClick={onToggleFullScreen}
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/60 hover:text-white"
        >
          {isEditorFullScreen ? "Disable Full Screen" : "Enable Full Screen"}
        </button>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={
            !canEdit ||
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

      <p
        className={`mb-4 min-h-4 text-xs ${
          saveState === "error"
            ? "text-rose-300"
            : saveState === "saved"
              ? "text-emerald-300"
              : "text-slate-400"
        }`}
      >
        {getSaveStatusLabel() || " "}
      </p>

      {saveErrorMessage ? (
        <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {saveErrorMessage}
        </p>
      ) : null}

      {exportError ? (
        <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {exportError}
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
              disabled={!canEdit}
              onChange={(event) => handleDateChange(event.target.value)}
              // Save immediately when focus leaves the date field.
              onBlur={handleEditorBlur}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/70"
            />
          </label>

          {/* Show a location input directly after Date so users can capture where this memory happened. */}
          <label className="space-y-2 text-sm text-slate-200">
            {/* Reuse the same label styling as Date for visual consistency. */}
            <span>Location</span>{" "}
            {/* Display the field label exactly as requested. */}
            <input
              type="text" // Use a plain text input because locations are free-form text.
              value={location} // Bind input value to local state so React controls the field.
              disabled={!canEdit}
              onChange={(event) => handleLocationChange(event.target.value)} // Use shared location handler so location-only edits enable saving.
              onBlur={handleEditorBlur} // Keep blur behavior consistent with other editor fields.
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/70" // Match existing input styling in this component.
              placeholder="" // Keep default appearance blank by not showing placeholder text.
            />
          </label>

          <label className="flex min-h-0 flex-1 flex-col space-y-2 text-sm text-slate-200">
            <span>Entry</span>
            <textarea
              ref={textareaRef}
              value={entryText}
              disabled={!canEdit}
              onChange={(event) => handleEntryChange(event.target.value)}
              // Save immediately when focus leaves the entry textarea.
              onBlur={handleEditorBlur}
              className="min-h-48  flex-1 resize-none overflow-y-auto rounded-3xl border border-white/10 bg-slate-900/70 px-4 py-4 font-mono text-sm leading-6 text-slate-100 outline-none transition focus:border-cyan-300/70"
              placeholder="Write your markdown journal entry here."
            />
          </label>
        </div>
      )}
    </section>
  );
}

export default JournalEditorPane;
