export function LiveAssessment({ t }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <section className="rounded-lg border border-rehab-line bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t.liveAssessment}</h2>
            <p className="mt-1 text-sm text-rehab-muted">
              Demo Mode uses simulated sensor data and simulated skeleton/posture metrics.
            </p>
          </div>
          <span className="rounded-full bg-rehab-teal px-3 py-1 text-xs font-semibold text-white">
            {t.demoMode}
          </span>
        </div>

        <div className="mt-6 grid min-h-96 place-items-center rounded-lg border border-dashed border-rehab-line bg-slate-50">
          <div className="text-center">
            <div className="mx-auto mb-4 h-32 w-20 rounded-full border-4 border-rehab-teal/40" />
            <p className="font-semibold text-rehab-ink">Demo skeleton area</p>
            <p className="mt-1 text-sm text-rehab-muted">MediaPipe webcam overlay will plug in here later.</p>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <div className="rounded-lg border border-rehab-line bg-white p-6">
          <h3 className="font-semibold">Acquisition Modes</h3>
          <div className="mt-4 space-y-3 text-sm">
            <ModeRow label={t.demoMode} value="Active now" accent="#43AA8B" />
            <ModeRow label={t.realModeLater} value="MediaPipe + ESP32 serial" accent="#577590" />
          </div>
        </div>

        <div className="rounded-lg border border-rehab-line bg-white p-6">
          <h3 className="font-semibold">Live metrics placeholder</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Metric label="Timer" value="00:30" />
            <Metric label="Score" value="--" />
            <Metric label="AP sway" value="--" />
            <Metric label="ML sway" value="--" />
          </div>
        </div>
      </aside>
    </div>
  );
}

function ModeRow({ label, value, accent }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 h-1 w-10 rounded-full" style={{ backgroundColor: accent }} />
      <p className="font-semibold">{label}</p>
      <p className="text-rehab-muted">{value}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-rehab-line p-3">
      <p className="text-rehab-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
