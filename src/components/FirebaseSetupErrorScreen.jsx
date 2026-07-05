/**
 * FirebaseSetupErrorScreen renders when Firebase initialization fails.
 *
 * This usually means one or more environment variables are missing
 * or the app needs a dev-server restart after changing .env values.
 *
 * This screen is specifically for startup/config problems, not for
 * runtime read/write permission errors after app has loaded.
 */
function FirebaseSetupErrorScreen({ message }) {
  // Render a startup-only error screen with setup instructions.
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.14),transparent_38%),linear-gradient(180deg,#0b1022,#111827)] px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl items-center justify-center">
        <section className="w-full rounded-3xl border border-rose-400/30 bg-slate-950/80 p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <p className="text-sm font-semibold tracking-[0.25em] text-rose-200 uppercase">
            Firebase Setup Needed
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            The app could not start Firebase.
          </h1>
          <p className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {message || "Firebase configuration is missing."}
          </p>
          <p className="mt-5 text-sm leading-7 text-slate-300">
            Create a local <strong>.env</strong> file and set:
            <br />
            VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
            VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_DATABASE_URL,
            VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
            VITE_FIREBASE_APP_ID.
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            After updating env values, restart the dev server.
          </p>
        </section>
      </div>
    </div>
  );
}

export default FirebaseSetupErrorScreen;
