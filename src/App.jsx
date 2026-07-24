import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, db, firebaseInitError } from "../firestore";
import AuthLoadingScreen from "./components/AuthLoadingScreen";
import AuthScreen from "./components/AuthScreen";
import FirebaseSetupErrorScreen from "./components/FirebaseSetupErrorScreen";
import JournalEditorPane from "./components/JournalEditorPane";
import NotesSidebar from "./components/NotesSidebar";
import TripsSidebar from "./components/TripsSidebar";

/**
 * App is the "orchestrator" component for the whole page.
 *
 * It owns shared state that multiple child components need:
 * - auth/session state
 * - selected trip and selected day
 * - arrays of trips and notes loaded from the database
 *
 * Child components render specific parts of the UI and call callbacks
 * provided by App to update this shared state.
 *
 * Think of App as the "single source of truth" for navigation state:
 * - Which trip is active?
 * - Which day is active?
 * - What lists are currently loaded?
 *
 * By keeping this state at one top level, the three columns stay in sync.
 */
function App() {
  // If Firebase init fails, we show a dedicated setup screen.
  const hasFirebaseConfigIssue = Boolean(firebaseInitError || !auth || !db);

  // Auth and auth-form state.
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(!hasFirebaseConfigIssue);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isTripsOpen, setIsTripsOpen] = useState(false);
  const [isGuestView, setIsGuestView] = useState(false);
  const [isEditorFullScreen, setIsEditorFullScreen] = useState(false);

  // Journal navigation state shared across sidebars and editor pane.
  const [trips, setTrips] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeTripId, setActiveTripId] = useState("");
  const [activeNoteId, setActiveNoteId] = useState("");

  /**
   * This effect listens for Firebase Auth session changes.
   * It updates user state and resets trip/note selection after sign-out.
   *
   * Why use an effect here?
   * Firebase auth state changes over time (async external system),
   * so we subscribe once and respond whenever Firebase pushes updates.
   */
  useEffect(() => {
    // Stop immediately when Firebase is unavailable.
    if (hasFirebaseConfigIssue || !auth) {
      // Returning undefined means "no cleanup required" for this early exit.
      return undefined;
    }

    // Firebase notifies us whenever auth state changes (sign in/out/restore).
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Store latest authenticated user object (or null on sign-out).
      setUser(currentUser);
      // Auth check is complete once Firebase replies the first time.
      setAuthLoading(false);

      // When signed out, clear journal-specific state so UI resets cleanly.
      if (!currentUser) {
        // Clear trips list when session ends.
        setTrips([]);
        // Clear notes list when session ends.
        setNotes([]);
        // Remove active trip selection when session ends.
        setActiveTripId("");
        // Remove active note selection when session ends.
        setActiveNoteId("");
      }
    });

    // Unsubscribe from auth listener when dependencies change/unmount.
    return () => unsubscribe();
  }, [hasFirebaseConfigIssue]);

  // Derive full objects for the selected IDs so the editor can render details.
  const activeTrip = trips.find((trip) => trip.id === activeTripId) || null;
  const activeNote = notes.find((note) => note.id === activeNoteId) || null;

  /**
   * handleAuthSubmit signs in using email/password.
   *
   * The form submit handler lives in App (not AuthScreen) so that:
   * - network/auth logic remains centralized,
   * - auth errors can be tracked in one place,
   * - AuthScreen stays mostly presentational.
   */
  const handleAuthSubmit = async (event) => {
    // Prevent full-page browser form submission reload.
    event.preventDefault();
    // Clear previous auth error before new attempt.
    setAuthError("");

    // Guard against missing Firebase auth client.
    if (!auth) {
      // Show actionable message instead of failing silently.
      setAuthError("Firebase is not configured correctly.");
      // Stop handler when auth client is unavailable.
      return;
    }

    try {
      // Existing-user sign-in flow.
      await signInWithEmailAndPassword(auth, email, password);

      // Authenticated users can edit, so leave guest-only mode.
      setIsGuestView(false);

      // Clear password field after successful auth.
      setPassword("");
    } catch (error) {
      // Surface Firebase auth error message to user.
      setAuthError(error.message);
    }
  };

  /**
   * handleSignOut ends the current Firebase Auth session.
   */
  const handleSignOut = async () => {
    // Clear stale auth error before sign-out attempt.
    setAuthError("");

    // Guard when auth client is unavailable.
    if (!auth) {
      // Exit early with no action.
      return;
    }

    try {
      // End active Firebase auth session.
      await signOut(auth);
      // Stay in app shell as guest after sign-out.
      setIsGuestView(true);
    } catch (error) {
      // Show sign-out error in shared auth error area.
      setAuthError(error.message);
    }
  };

  const handleViewJournals = () => {
    setAuthError("");
    setPassword("");
    setIsGuestView(true);
  };

  // First branch: auth status still loading.
  if (authLoading) {
    // While Firebase restores session, show a loading screen to avoid flicker.
    return <AuthLoadingScreen />;
  }

  if (hasFirebaseConfigIssue) {
    // Config/init issues are handled here before any auth/content rendering.
    return (
      <FirebaseSetupErrorScreen
        message={firebaseInitError || "Firebase configuration is missing."}
      />
    );
  }

  if (!user && !isGuestView) {
    // Not signed in: show auth page.
    return (
      <AuthScreen
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        authError={authError}
        onSubmit={handleAuthSubmit}
        onViewJournals={handleViewJournals}
      />
    );
  }

  // Final branch: app shell (authenticated editor or guest read-only mode).
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[2200px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs tracking-[0.3em] text-cyan-200 uppercase">
              Laura and Al's Days of Fun
            </p>
            <h1 className="text-xl font-semibold text-white">
              Shared trip notes
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <p className="hidden text-sm text-slate-300 sm:block">
                  {user.email}
                </p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/60 hover:text-white"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsGuestView(false)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/60 hover:text-white"
              >
                Sign in to edit
              </button>
            )}
          </div>
        </div>
      </header>

      <main
        // Keep responsive grid classes as static strings so Tailwind can generate them.
        // Dynamically toggle between two grid layouts based on sidebar open state.
        // When Days sidebar is closed, the slim rail and Notes sidebar are together (mobile).
        // In fullscreen mode, the editor takes the whole screen and sidebars are hidden.
        className={[
          isEditorFullScreen
            ? "mx-auto grid flex-1 min-h-0 w-full max-w-[2200px] gap-3 p-2 md:p-4 lg:p-6"
            : "mx-auto grid flex-1 min-h-0 w-full max-w-[2200px] gap-4 p-4 md:p-6",
          "lg:grid-rows-1",
          isEditorFullScreen
            ? "grid-cols-1 grid-rows-1 lg:grid-cols-1"
            : isTripsOpen
              ? "grid-cols-1 grid-rows-[auto_auto_auto] lg:grid-cols-[18rem_20rem_minmax(0,1fr)]"
              : "grid-cols-[3.5rem_minmax(0,1fr)] grid-rows-[auto_auto] lg:grid-cols-[3.5rem_20rem_minmax(0,1fr)]",
        ].join(" ")}
      >
        {/* Left column: trips list and trip-level actions. */}
        {/*
          onTripsLoaded and onSelectTrip are callback props.
          TripsSidebar calls them when database data arrives or user selects a trip.
          isEditorFullScreen is passed down so the sidebar can hide itself when the editor is full-screen.
        */}
        {!isEditorFullScreen && (
          <div
            className={
              isTripsOpen
                ? "col-span-1 row-start-1 lg:col-start-1 lg:row-start-1"
                : "col-start-1 row-start-1 lg:col-start-1 lg:row-start-1"
            }
          >
            <TripsSidebar
              activeTripId={activeTripId}
              trips={trips}
              onSelectTrip={setActiveTripId}
              onTripsLoaded={setTrips}
              isTripsOpen={isTripsOpen}
              setIsTripsOpen={setIsTripsOpen}
              canEdit={Boolean(user)}
            />
          </div>
        )}
        {!isEditorFullScreen && (
          <div
            className={
              isTripsOpen
                ? "col-span-1 row-start-2 lg:col-start-2 lg:row-start-1 min-w-0"
                : "col-start-2 row-start-1 min-w-0 lg:col-start-2 lg:row-start-1"
            }
          >
            {/* Middle column: days/notes inside selected trip. */}
            {/*
          NotesSidebar depends on activeTripId.
          When trip changes, it subscribes to that trip's notes path.
          isEditorFullScreen is passed down so the sidebar can hide itself when the editor is full-screen.
        */}
            <NotesSidebar
              activeTripId={activeTripId}
              activeNoteId={activeNoteId}
              notes={notes}
              onSelectNote={setActiveNoteId}
              onNotesLoaded={setNotes}
              canEdit={Boolean(user)}
            />
          </div>
        )}

        {/* Right column: editor for the currently selected day. */}
        {/*
          Editor receives full objects (activeTrip/activeNote), not just IDs,
          so it can render labels immediately without re-looking up data.
        */}
        <div
          className={
            isEditorFullScreen
              ? "col-span-1 row-start-1 min-w-0 h-full min-h-0 w-full mx-auto max-w-none lg:col-start-1 lg:row-start-1"
              : isTripsOpen
                ? "col-span-1 row-start-3 h-full min-h-0 lg:col-start-3 lg:row-start-1"
                : "col-span-2 row-start-2 h-full min-h-0 lg:col-start-3 lg:row-start-1"
          }
        >
          <JournalEditorPane
            activeTripId={activeTripId}
            activeNoteId={activeNoteId}
            activeTrip={activeTrip}
            activeNote={activeNote}
            notes={notes}
            canEdit={Boolean(user)}
            isEditorFullScreen={isEditorFullScreen}
            onToggleFullScreen={() => setIsEditorFullScreen((prev) => !prev)}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
