/**
 * AuthScreen is a presentational auth form.
 *
 * Important pattern for beginners:
 * - This component does not own auth form state.
 * - It receives values/setters and submit handler from App via props.
 * - This keeps all auth logic centralized in one place (App).
 *
 * In React terms, this is a "controlled form" UI:
 * parent component owns truth, child component renders and forwards events.
 */
function AuthScreen({
  // Current auth mode passed down from App (signin or signup).
  authMode,
  // Setter from App to switch auth mode.
  setAuthMode,
  // Controlled email value from parent state.
  email,
  // Parent setter for email input changes.
  setEmail,
  // Controlled password value from parent state.
  password,
  // Parent setter for password input changes.
  setPassword,
  // Auth error message created by App logic.
  authError,
  // Form submit handler owned by App.
  onSubmit,
}) {
  // Render presentational auth layout with controlled form props.
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_36%),linear-gradient(180deg,#020617,#0f172a_55%,#111827)] px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col items-stretch justify-center gap-8 lg:flex-row lg:items-center">
        <section className="flex-1 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-sm font-semibold tracking-[0.3em] text-cyan-200 uppercase">
            Laura and Al's Days of Fun
          </p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            An online green book for trips, days, and memories.
          </h1>
          <p className="max-w-xl text-sm leading-7 text-slate-300 md:text-base">
            Sign in to view trips, browse notes, and export everything in Word
            format.
          </p>
        </section>

        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/70 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              {/* The same form supports both sign-in and sign-up flows. */}
              <p className="text-sm font-semibold tracking-[0.24em] text-cyan-200 uppercase">
                {authMode === "signin" ? "Welcome back" : "Create account"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {authMode === "signin" ? "Sign in" : "Sign up"}
              </h2>
            </div>
            <button
              type="button"
              // Switches between sign-in and sign-up mode without leaving page.
              onClick={() =>
                setAuthMode(authMode === "signin" ? "signup" : "signin")
              }
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/60 hover:text-white"
            >
              {authMode === "signin" ? "Need an account?" : "Have an account?"}
            </button>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            {/*
              Inputs are controlled by parent state.
              Typing calls parent setters so App always has latest values.
              Pressing Enter triggers this form submit naturally.
            */}
            <label className="block space-y-2 text-sm text-slate-200">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70"
                placeholder="you@example.com"
              />
            </label>

            <label className="block space-y-2 text-sm text-slate-200">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70"
                placeholder="Minimum 6 characters"
              />
            </label>

            {authError ? (
              // Auth errors are produced in App and displayed here.
              <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {authError}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              {authMode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default AuthScreen;
