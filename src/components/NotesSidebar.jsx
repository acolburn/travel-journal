import { useEffect, useState } from "react";
import { onValue, push, ref, remove, set } from "firebase/database";
import { db } from "../../firestore";

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

/**
 * NotesSidebar renders the middle sidebar and keeps notes synced for the active trip.
 *
 * It listens to one path per selected trip:
 * /trips/{activeTripId}/notes
 *
 * Each note/day has fields like displayDate, entryText, and timestamps.
 *
 * Like TripsSidebar, this component forwards loaded data to App,
 * which keeps the source-of-truth array in parent state.
 */
function NotesSidebar({
  // Selected trip id determines which notes path we subscribe to.
  activeTripId,
  // Selected note id used to style active card and preserve selection.
  activeNoteId,
  // Notes list supplied by App state.
  notes,
  // Callback to replace notes list in App.
  onNotesLoaded,
  // Callback to set currently active note id in App.
  onSelectNote,
  // Guests can read notes but cannot mutate data.
  canEdit,
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /**
   * This effect subscribes to `trips/{tripId}/notes` whenever a trip is selected.
   * It sorts days chronologically and ensures one note is selected when possible.
   *
   * When activeTripId changes, React runs cleanup for old subscription
   * and establishes a new one for the new trip path.
   */
  useEffect(() => {
    // No active trip means no notes path to subscribe to.
    if (!activeTripId) {
      return undefined;
    }

    // Build path reference for notes under selected trip.
    const notesRef = ref(db, `trips/${activeTripId}/notes`);

    // Start realtime listener for notes path.
    const unsubscribe = onValue(
      notesRef,
      (snapshot) => {
        // Read raw key/value map from snapshot.
        const rawNotes = snapshot.val() || {};

        // Realtime Database returns key/value object, so map to renderable array.
        const nextNotes = Object.entries(rawNotes)
          .map(([id, value]) => ({
            id,
            ...(value || {}),
          }))
          .sort(
            (a, b) =>
              (a.displayDateTimestamp || 0) - (b.displayDateTimestamp || 0),
          );

        // Push normalized notes array to parent state.
        onNotesLoaded(nextNotes);
        // Clear previous load error after successful read.
        setLoadError("");

        // Keep a valid selection when days list changes.
        if (
          nextNotes.length > 0 &&
          !nextNotes.some((note) => note.id === activeNoteId)
        ) {
          onSelectNote(nextNotes[0].id);
        }

        // Loading completes once first successful snapshot is received.
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load notes.", error);

        // Clear notes list to avoid editing notes from a previous trip state.
        onNotesLoaded([]);
        setLoadError(
          error?.code
            ? `${error.code}: ${error.message || "Unable to load notes."}`
            : "Unable to load notes.",
        );
        // End loading even on error so user can see error message.
        setLoading(false);
      },
    );

    // Remove listener when trip changes or component unmounts.
    return () => unsubscribe();
  }, [activeNoteId, activeTripId, onNotesLoaded, onSelectNote]);

  /**
   * handleAddDay creates a new note in the active trip.
   *
   * A new note starts with empty entryText so editor can open immediately.
   */
  const handleAddDay = async () => {
    if (!canEdit) {
      window.alert("Please sign in to add days.");
      return;
    }

    // Guard against add action without selected trip.
    if (!activeTripId) {
      return;
    }

    // Create timestamp/date defaults for the new note.
    const now = new Date();
    const defaultDisplayDate = formatDisplayDateFromTimestamp(now.getTime());

    try {
      // Generate unique note/day key under selected trip.
      const newNoteRef = push(ref(db, `trips/${activeTripId}/notes`));

      // Persist starter note fields to database.
      await set(newNoteRef, {
        displayDate: defaultDisplayDate,
        displayDateTimestamp: now.getTime(),
        location: "",
        entryText: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Select new note immediately so editor opens it.
      onSelectNote(newNoteRef.key || "");
    } catch (error) {
      console.error("Unable to create day note.", error);
      // Build readable message from Firebase error payload.
      const errorMessage = error?.code
        ? `${error.code}: ${error.message || "Day creation failed."}`
        : "Could not add a day right now. Please try again.";
      // Show immediate feedback for failed create.
      window.alert(errorMessage);
    }
  };

  /**
   * handleDeleteDay removes one day note after confirmation.
   *
   * delete scope is only this note path, not the entire trip.
   */
  const handleDeleteDay = async (noteId, displayDate) => {
    if (!canEdit) {
      window.alert("Please sign in to delete days.");
      return;
    }

    // Require confirmation before deleting user content.
    const confirmed = window.confirm(
      `Delete day "${displayDate || "Untitled day"}"?`,
    );

    // Exit early if user cancels dialog.
    if (!confirmed) {
      return;
    }

    try {
      // Remove only the selected note path.
      await remove(ref(db, `trips/${activeTripId}/notes/${noteId}`));
    } catch (error) {
      console.error("Unable to delete day note.", error);
      // Generic alert keeps delete failure visible to user.
      window.alert("Could not delete this day right now. Please try again.");
    }
  };

  // Empty-trip state: show helpful prompt when nothing is selected.
  if (!activeTripId) {
    return (
      <aside className="flex min-h-80 flex-col rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Days</h2>
          <button
            type="button"
            disabled
            className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-400"
          >
            Add Day
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
          Select a trip to view its days.
        </div>
      </aside>
    );
  }

  // Default state: render notes list for selected trip.
  return (
    <aside className="flex min-h-80 flex-col rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Days</h2>
        <button
          type="button"
          onClick={handleAddDay}
          disabled={!canEdit}
          className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-400"
        >
          Add Day
        </button>
      </div>

      {loadError ? (
        <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {loadError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-300">
          Loading notes...
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
          No days yet for this trip.
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto pr-1">
          {notes.map((note) => {
            const isActive = note.id === activeNoteId;
            const displayedDateLabel =
              formatDisplayDateFromTimestamp(note.displayDateTimestamp) ||
              note.displayDate ||
              "Untitled day";

            return (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                // Entire card is clickable/tappable for easier mobile use.
                onClick={() => onSelectNote(note.id)}
                // Keyboard accessibility: Enter/Space also selects a day.
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectNote(note.id);
                  }
                }}
                // Active state comes from ID comparison (single selected note).
                className={`rounded-2xl border p-3 transition ${
                  isActive
                    ? "border-cyan-300/70 bg-cyan-300/10"
                    : "border-white/10 bg-slate-900/60"
                } cursor-pointer`}
              >
                <div className="w-full text-left">
                  <p className="text-sm font-semibold text-white">
                    {displayedDateLabel}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {note.entryText
                      ? `${note.entryText.slice(0, 70)}${note.entryText.length > 70 ? "..." : ""}`
                      : "Empty note"}
                  </p>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={(event) => {
                      // Prevent delete click from also triggering card selection.
                      event.stopPropagation();
                      handleDeleteDay(note.id, displayedDateLabel);
                    }}
                    className="rounded-full border border-rose-400/30 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-500/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

export default NotesSidebar;
