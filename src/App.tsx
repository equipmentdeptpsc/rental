function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white p-6">
      <div className="text-center max-w-xl border border-slate-800 rounded-2xl bg-slate-900/50 p-8 shadow-2xl backdrop-blur-md">
        <div className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/20 mb-4">
          v4.0 Active
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          ERMS <span className="text-emerald-400">Project</span>
        </h1>
        <p className="mt-4 text-base text-slate-400 leading-relaxed">
          Senior Architect verification check: If you see a dark background layout with crisp green text accents, your React 19 + Tailwind CSS v4 environment is fully functional.
        </p>
      </div>
    </div>
  );
}

export default App;