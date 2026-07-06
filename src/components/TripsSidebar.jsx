import { useEffect, useState } from "react";
import { onValue, push, ref, remove, set } from "firebase/database";
import { db } from "../../firestore";

/**
 * TripsSidebar renders the left sidebar and keeps trips synced from Realtime Database.
 *
 * Data flow in this component:
 * 1) Subscribe to /trips with onValue.
 * 2) Convert Firebase object map to array for rendering.
 * 3) Send that array up to App with onTripsLoaded.
 * 4) Handle local UI actions (add/delete) and write changes back to database.
 *
 * Important concept: this component does not keep the master trips array.
 * It reports loaded data upward via onTripsLoaded, and App stores it.
 */
function TripsSidebar({
  // Signed-in user object; used as a guard before subscribing.
  user,
  // Currently selected trip id from App.
  activeTripId,
  // Renderable trips list from App state.
  trips,
  // Callback to change selected trip in App.
  onSelectTrip,
  // Callback to replace trips list in App.
  onTripsLoaded,
  // Whether the sidebar is open or closed
  isTripsOpen,
  // Setter to toggle sidebar open/closed
  setIsTripsOpen,
}) {
  const [loading, setLoading] = useState(true);
  const [deletingTripId, setDeletingTripId] = useState("");
  const [loadError, setLoadError] = useState("");

  /**
   * This effect subscribes to the root `trips` path whenever a signed-in user exists.
   * It updates parent state through `onTripsLoaded` and keeps one trip selected.
   *
   * Realtime Database returns object data like:
   * {
   *   "tripKey1": {...},
   *   "tripKey2": {...}
   * }
   * so we transform that object into an array before rendering.
   *
   * Why `user` in dependencies?
   * We only want a live trips subscription while signed in.
   * When user changes/signs out, React cleans up old listener automatically.
   */
  useEffect(() => {
    // Skip database listener when no authenticated user exists.
    if (!user) {
      return undefined;
    }

    // Reference to root trips path in Realtime Database.
    const tripsRef = ref(db, "trips");

    // Start realtime subscription for trips path.
    const unsubscribe = onValue(
      tripsRef,
      (snapshot) => {
        // Raw snapshot is an object map keyed by Firebase-generated ids.
        const rawTrips = snapshot.val() || {};

        // Convert key/value map -> array, then sort newest first.
        const nextTrips = Object.entries(rawTrips)
          .map(([id, value]) => ({
            id,
            ...(value || {}),
          }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Push normalized list to App (single source of truth).
        onTripsLoaded(nextTrips);
        // Clear previous load error after successful snapshot.
        setLoadError("");

        // If selected trip no longer exists, auto-select first available trip.
        if (
          nextTrips.length > 0 &&
          !nextTrips.some((trip) => trip.id === activeTripId)
        ) {
          onSelectTrip(nextTrips[0].id);
        }

        // Loading is complete after first successful data callback.
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load trips.", error);

        // We clear list to avoid showing stale data as if it were current.
        onTripsLoaded([]);
        setLoadError(
          error?.code
            ? `${error.code}: ${error.message || "Unable to load trips."}`
            : "Unable to load trips.",
        );
        // Even on failure, stop loading spinner to show error state.
        setLoading(false);
      },
    );

    // Clean up listener to avoid duplicate subscriptions and memory leaks.
    return () => unsubscribe();
  }, [activeTripId, onSelectTrip, onTripsLoaded, user]);

  // flips Trips sidebar open/closed
  const toggleSidebar = () => {
    setIsTripsOpen((prev) => !prev);
  };

  /**
   * handleAddTrip creates a new trip node in the root `trips` path.
   *
   * The generated key from push() becomes the trip "id" used by UI.
   */
  const handleAddTrip = async () => {
    // Prompt keeps this milestone simple; can later be replaced by custom modal.
    const tripTitleInput = window.prompt("Trip title:", "New Trip");

    // Cancel means user closed prompt; do nothing.
    if (tripTitleInput === null) {
      return;
    }

    // Use fallback title for blank input.
    const tripTitle = tripTitleInput.trim() || "Untitled trip";

    try {
      // push() creates a new unique child key under /trips.
      const newTripRef = push(ref(db, "trips"));

      // Persist initial trip fields in database.
      await set(newTripRef, {
        title: tripTitle,
        description: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Select immediately so middle/right columns update right after creation.
      onSelectTrip(newTripRef.key || "");
    } catch (error) {
      console.error("Unable to create trip.", error);
      // Build human-readable error text for alert dialog.
      const errorMessage = error?.code
        ? `${error.code}: ${error.message || "Trip creation failed."}`
        : "Could not create a trip right now. Please try again.";
      // Immediate user feedback for failed create.
      window.alert(errorMessage);
    }
  };

  /**
   * handleDeleteTrip removes a trip node and everything under it.
   *
   * In Realtime Database, deleting /trips/{tripId} also deletes
   * all nested children (including notes under that trip).
   */
  const handleDeleteTrip = async (tripId, tripTitle) => {
    // Confirm destructive operation before deleting data.
    const confirmed = window.confirm(
      `Delete trip "${tripTitle || "Untitled trip"}" and all its days?`,
    );

    // Exit if user cancels confirmation dialog.
    if (!confirmed) {
      return;
    }

    // Track which card is currently deleting to disable its button.
    setDeletingTripId(tripId);

    // Optimistic update: remove immediately in UI for faster feel.
    // If backend remove fails, we restore previousTrips in catch block.
    // Keep old list for rollback if delete request fails.
    const previousTrips = trips;
    // Remove trip immediately from UI for responsive feel.
    const remainingTrips = trips.filter((trip) => trip.id !== tripId);
    // Push optimistic list to App state.
    onTripsLoaded(remainingTrips);

    // If deleted trip was active, move selection to another available trip.
    if (activeTripId === tripId) {
      onSelectTrip(remainingTrips[0]?.id || "");
    }

    try {
      // Remove trip node and nested children in one operation.
      await remove(ref(db, `trips/${tripId}`));
    } catch (error) {
      console.error("Unable to delete trip.", error);

      // Roll back optimistic UI if backend deletion fails.
      onTripsLoaded(previousTrips);

      if (activeTripId === tripId) {
        // Restore previous selection when rollback occurs.
        onSelectTrip(tripId);
      }

      // Build readable error text for failed delete.
      const errorMessage = error?.code
        ? `${error.code}: ${error.message || "Trip deletion failed."}`
        : error?.message ||
          "Could not delete this trip right now. Please try again.";
      // Alert user with delete failure details.
      window.alert(errorMessage);
    } finally {
      // Always clear deleting flag so button can recover.
      setDeletingTripId("");
    }
  };

  // Render trips sidebar UI for all load/data/error states.
  return (
    <aside
      className={`${
        isTripsOpen ? "w-full min-h-80 p-4" : "w-14 min-h-80 p-2"
      } flex flex-col rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-black/20 backdrop-blur`}
    >
      <div
        className={`mb-4 flex items-center ${isTripsOpen ? "justify-between gap-3" : "justify-center"}`}
      >
        {/* Hamburger button is always visible, even when sidebar is closed. In
        open state, you also see Add Trip. */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300"
          aria-label="Toggle trips sidebar"
        >
          <span className="sr-only">Toggle trips sidebar</span>
          {/* Hamburger menu icon (three horizontal lines); surrounding with a
          button makes it clickable/tappable */}
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        {/* When sidebar is closed, only the hamburger button and a slim rail is
        visible. When open, you also see the Add Trip button, etc. */}
        {isTripsOpen ? (
          <button
            type="button"
            onClick={handleAddTrip}
            className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-400"
          >
            Add Trip
          </button>
        ) : null}
      </div>

      {isTripsOpen ? (
        <>
          {loadError ? (
            <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {loadError}
            </p>
          ) : null}

          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-300">
              Loading trips...
            </div>
          ) : trips.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
              No trips yet. The next milestone will add trip creation.
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto pr-1">
              {trips.map((trip) => {
                const isActive = trip.id === activeTripId;

                return (
                  <div
                    key={trip.id}
                    className={`rounded-2xl border p-3 transition ${
                      isActive
                        ? "border-cyan-300/70 bg-cyan-300/10"
                        : "border-white/10 bg-slate-900/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTrip(trip.id)}
                      className="w-full text-left"
                    >
                      <p className="text-sm font-semibold text-white">
                        {trip.title || "Untitled trip"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {trip.description || "Tap to open the trip journal."}
                      </p>
                    </button>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={deletingTripId === trip.id}
                        onClick={() => handleDeleteTrip(trip.id, trip.title)}
                        className="rounded-full border border-rose-400/30 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-500/20"
                      >
                        {deletingTripId === trip.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </aside>
  );
}

export default TripsSidebar;
