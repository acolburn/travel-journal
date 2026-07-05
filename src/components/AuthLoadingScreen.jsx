/**
 * AuthLoadingScreen appears during the short window when Firebase Auth
 * is determining whether a previous session already exists.
 *
 * Without this screen, users may briefly see the sign-in screen even when
 * they are already logged in (visual flicker).
 *
 * This component intentionally has no props/state because it is a pure
 * transient UI state controlled entirely by App's authLoading flag.
 */
function AuthLoadingScreen() {
  // Render a dedicated interim view while auth session status is unknown.
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-300 border-t-transparent" />
        <p className="text-sm tracking-[0.24em] text-slate-300 uppercase">
          Authenticating
        </p>
      </div>
    </div>
  );
}

export default AuthLoadingScreen;
