import { Activity, BarChart3, Bell, ChevronDown, ClipboardCheck, Home, Info, Settings, UsersRound } from "lucide-react";

const icons = {
  dashboard: Home,
  patients: UsersRound,
  balanceAssessment: ClipboardCheck,
  progressAnalytics: BarChart3,
  about: Info,
  settings: Settings,
};

export function AppShell({
  pages,
  activePage,
  onPageChange,
  t,
  children,
  focused = false,
  onExitFocus,
}) {
  return (
    <div className="min-h-screen bg-rehab-bg text-rehab-ink">
      {!focused ? (
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-rehab-line bg-white px-5 py-6 lg:block">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-rehab-teal text-white">
              <Activity size={22} />
            </div>
            <div>
              <p className="text-lg font-semibold">{t.appName}</p>
              <p className="text-xs font-medium text-rehab-muted">{t.productSubtitle}</p>
            </div>
          </div>
        </div>

        <nav className="space-y-1">
          {pages.map((page) => {
            const Icon = icons[page];
            const isActive = activePage === page;

            return (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                  isActive
                    ? "bg-rehab-teal text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-rehab-ink"
                }`}
              >
                <Icon size={18} />
                {t[page]}
              </button>
            );
          })}
        </nav>

        <div className="absolute inset-x-5 bottom-5 rounded-lg border border-rehab-line bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.clinicalWorkspace}</p>
          <p className="mt-2 text-sm font-semibold text-rehab-ink">BalanceRehab MVP</p>
          <p className="mt-2 text-xs leading-5 text-rehab-muted">
            {t.appShellDescription}
          </p>
        </div>
      </aside>
      ) : null}

      <main className={focused ? "" : "lg:pl-72"}>
        {!focused ? (
        <header className="sticky top-0 z-10 border-b border-rehab-line bg-white/90 px-5 py-4 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              {focused ? (
                <button
                  type="button"
                  onClick={onExitFocus}
                  className="rounded-lg border border-rehab-line bg-white px-3 py-2 text-sm font-semibold text-rehab-ink transition hover:bg-slate-50"
                >
                  {t.backToWorkspace}
                </button>
              ) : null}
              <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rehab-teal">{t.clinicalRehabilitation}</p>
              <h1 className="text-2xl font-semibold">{t[activePage]}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="relative grid h-10 w-10 place-items-center rounded-lg border border-rehab-line bg-white text-rehab-muted transition hover:bg-slate-50 hover:text-rehab-ink"
                aria-label={t.notifications}
              >
                <Bell size={18} />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rehab-orange" />
              </button>

              <button
                type="button"
                className="flex items-center gap-3 rounded-lg border border-rehab-line bg-white px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-rehab-blue text-sm font-semibold text-white">
                  HK
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold text-rehab-ink">{t.clinicianName}</p>
                  <p className="text-xs text-rehab-muted">{t.clinicianRole}</p>
                </div>
                <ChevronDown size={16} className="text-rehab-muted" />
              </button>
            </div>
          </div>
        </header>
        ) : null}

        <div className={focused ? "p-0" : "px-5 py-6 lg:px-8"}>{children}</div>
      </main>
    </div>
  );
}
