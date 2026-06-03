import { useState } from "react";
import { Camera, Database, FileText, Globe2, MonitorCog, RotateCcw, Server, ToggleLeft, Wifi } from "lucide-react";

import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";

function readableStatus(value) {
  const labels = {
    ok: "Connected",
    active: "Active",
    demo_mode: "Demo Mode",
    connected: "Connected",
  };

  return labels[value] ?? "Checking";
}

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rehab-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-rehab-blue">
          <Icon size={18} />
        </div>
        <div>
          <p className="font-semibold text-rehab-ink">{title}</p>
          <p className="mt-1 max-w-xl text-sm leading-5 text-rehab-muted">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SegmentedControl({ options, active }) {
  return (
    <div className="flex rounded-lg border border-rehab-line bg-white p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
            option === active ? "bg-rehab-blue text-white" : "text-rehab-muted hover:bg-slate-50"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Toggle({ active = true }) {
  return (
    <button
      type="button"
      className={`flex h-7 w-12 items-center rounded-full p-1 transition ${active ? "bg-rehab-teal" : "bg-slate-300"}`}
      aria-pressed={active}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow transition ${active ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export function SettingsPage({ t, language, onLanguageChange, status, health, onResetDemoData }) {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-normal text-rehab-ink">Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-rehab-muted">{t.settingsSubtitle}</p>
      </section>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.general} description={t.generalDesc} />
        <div className="mt-5">
          <SettingRow icon={Globe2} title={t.language} description={t.languageDesc}>
            <div className="flex rounded-lg border border-rehab-line bg-white p-1">
              {["en", "fr"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onLanguageChange(option)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                    language === option ? "bg-rehab-blue text-white" : "text-rehab-muted hover:bg-slate-50"
                  }`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow
            icon={ToggleLeft}
            title={t.demoMode}
            description={t.modeDescription}
          >
            <Toggle active={status?.demo_mode ?? true} />
          </SettingRow>

          <SettingRow
            icon={RotateCcw}
            title={t.resetDemoData}
            description={t.resetDemoDataDesc}
          >
            {confirmReset ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                  {t.cancel}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    onResetDemoData();
                    setConfirmReset(false);
                  }}
                >
                  {t.confirmReset}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmReset(true)}>
                {t.resetData}
              </Button>
            )}
          </SettingRow>
        </div>
      </ClinicalCard>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.reports} description={t.reportsSettingsDesc} />
        <div className="mt-5">
          <SettingRow icon={FileText} title={t.pdfLanguage} description={t.pdfLanguageDesc}>
            <SegmentedControl options={["FR", "EN"]} active="FR" />
          </SettingRow>

          <SettingRow icon={FileText} title={t.includeCharts} description={t.includeChartsDesc}>
            <Toggle active />
          </SettingRow>

          <SettingRow icon={FileText} title={t.includeRecommendations} description={t.includeRecommendationsDesc}>
            <Toggle active />
          </SettingRow>
        </div>
      </ClinicalCard>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.system} description={t.systemDesc} />
        <div className="mt-5">
          <SettingRow icon={Server} title={t.apiStatus} description={t.apiStatusDesc}>
            <StatusBadge tone={health?.status === "ok" ? "connected" : "warning"}>{readableStatus(health?.status)}</StatusBadge>
          </SettingRow>

          <SettingRow icon={Database} title={t.databaseStatus} description={t.databaseStatusDesc}>
            <StatusBadge tone={status?.database === "active" ? "active" : "warning"}>{readableStatus(status?.database)}</StatusBadge>
          </SettingRow>

          <SettingRow icon={Camera} title={t.webcamStatus} description={t.webcamStatusDesc}>
            <StatusBadge tone={status?.webcam === "demo_mode" ? "demo" : "connected"}>{readableStatus(status?.webcam)}</StatusBadge>
          </SettingRow>

          <SettingRow icon={MonitorCog} title={t.esp32Status} description={t.esp32StatusDesc}>
            <StatusBadge tone={status?.esp32 === "demo_mode" ? "demo" : "connected"}>{readableStatus(status?.esp32)}</StatusBadge>
          </SettingRow>

          <SettingRow icon={Wifi} title={t.connectionMode} description={t.connectionModeDesc}>
            <SegmentedControl options={["Demo", "USB Serial", "Wi-Fi later"]} active="Demo" />
          </SettingRow>
        </div>

        <div className="mt-6 flex justify-end">
          <Button>{t.saveSettings}</Button>
        </div>
      </ClinicalCard>
    </div>
  );
}
