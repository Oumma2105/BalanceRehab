import { useEffect, useState } from "react";
import { BrainCircuit, Camera, Database, FileText, Globe2, MonitorCog, PlugZap, RotateCcw, Server, ToggleLeft, Usb, Wifi } from "lucide-react";

import { api } from "../api/client.js";
import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";

function readableStatus(t, value) {
  const labels = {
    ok: t.connected,
    active: t.active,
    demo_mode: t.demoMode,
    connected: t.connected,
    api_ready: t.apiReady ?? "API ready",
    available: t.available ?? "Disponible",
    not_connected: t.notConnected ?? "Non connecté",
    disconnected: t.notConnected ?? "Non connecté",
    error: t.errorStatus ?? "Erreur",
  };

  return labels[value] ?? t.checking;
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

function SegmentedControl({ options, active, onChange }) {
  return (
    <div className="flex rounded-lg border border-rehab-line bg-white p-1">
      {options.map((option) => (
        <button
          key={option.value ?? option}
          type="button"
          onClick={() => onChange?.(option.value ?? option)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
            (option.value ?? option) === active ? "bg-rehab-blue text-white shadow-sm" : "bg-slate-200 text-rehab-muted hover:bg-slate-300 hover:text-rehab-ink"
          }`}
        >
          {option.label ?? option}
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

export function SettingsPage({ t, language, onLanguageChange, webcamViewMode, onWebcamViewModeChange, status, health, onResetDemoData }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetState, setResetState] = useState("idle");
  const [movementAi, setMovementAi] = useState({ readiness: null, model: null, state: "idle" });
  const [esp32, setEsp32] = useState({
    ports: [],
    selectedPort: window.localStorage.getItem("balancerehab_esp32_port") ?? "",
    baudRate: Number(window.localStorage.getItem("balancerehab_esp32_baud") ?? 115200),
    status: null,
    state: "idle",
    hasScanned: false,
  });

  const refreshMovementAi = async () => {
    setMovementAi((current) => ({ ...current, state: "loading" }));
    try {
      const [readiness, model] = await Promise.all([
        api.movementTrainingReadiness(),
        api.movementModelStatus(),
      ]);
      setMovementAi({ readiness, model, state: "ready" });
    } catch (error) {
      console.warn("Movement AI status could not be loaded.", error);
      setMovementAi((current) => ({ ...current, state: "error" }));
    }
  };

  useEffect(() => {
    refreshMovementAi();
    refreshEsp32Status();
    const timer = window.setInterval(refreshEsp32Status, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const refreshEsp32Status = async () => {
    try {
      const serialStatus = await api.esp32Status();
      setEsp32((current) => ({
        ...current,
        status: serialStatus,
        selectedPort: current.selectedPort || serialStatus.port || "",
        baudRate: serialStatus.baud_rate || current.baudRate,
      }));
    } catch (error) {
      console.warn("ESP32 serial status could not be loaded.", error);
      setEsp32((current) => ({ ...current, state: "error" }));
    }
  };

  const scanEsp32Ports = async () => {
    setEsp32((current) => ({ ...current, state: "scanning", hasScanned: false }));
    try {
      const response = await api.esp32Ports();
      setEsp32((current) => ({
        ...current,
        ports: response.ports ?? [],
        selectedPort: current.selectedPort || response.ports?.[0]?.device || "",
        state: "idle",
        hasScanned: true,
      }));
    } catch (error) {
      console.warn("ESP32 port scan failed.", error);
      setEsp32((current) => ({ ...current, state: "scanError", hasScanned: true }));
    }
  };

  const connectEsp32 = async () => {
    setEsp32((current) => ({ ...current, state: "connecting" }));
    try {
      window.localStorage.setItem("balancerehab_esp32_port", esp32.selectedPort);
      window.localStorage.setItem("balancerehab_esp32_baud", String(esp32.baudRate));
      const serialStatus = await api.esp32Connect({ port: esp32.selectedPort, baudRate: Number(esp32.baudRate) || 115200 });
      setEsp32((current) => ({ ...current, status: serialStatus, state: "idle" }));
    } catch (error) {
      console.warn("ESP32 connect failed.", error);
      setEsp32((current) => ({ ...current, state: "error" }));
    }
  };

  const disconnectEsp32 = async () => {
    setEsp32((current) => ({ ...current, state: "disconnecting" }));
    const serialStatus = await api.esp32Disconnect();
    setEsp32((current) => ({ ...current, status: serialStatus, state: "idle" }));
  };

  const calibrateEsp32 = async () => {
    const serialStatus = await api.esp32Calibrate(4);
    setEsp32((current) => ({ ...current, status: serialStatus }));
  };

  const zeroEsp32 = async () => {
    const serialStatus = await api.esp32Zero();
    setEsp32((current) => ({ ...current, status: serialStatus }));
  };

  const handleReset = async () => {
    setResetState("loading");
    try {
      await onResetDemoData();
      setResetState("success");
      setConfirmReset(false);
    } catch (error) {
      console.warn("Demo reset failed.", error);
      setResetState("error");
    }
  };

  const handleTrainMovementModel = async () => {
    setMovementAi((current) => ({ ...current, state: "training" }));
    try {
      const model = await api.trainMovementModel();
      const readiness = await api.movementTrainingReadiness();
      setMovementAi({ readiness, model, state: model.trained ? "trained" : "not-ready" });
    } catch (error) {
      console.warn("Movement model training failed.", error);
      setMovementAi((current) => ({ ...current, state: "error" }));
    }
  };

  return (
    <div className="space-y-6">
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
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    language === option ? "bg-rehab-blue text-white shadow-sm" : "bg-slate-200 text-rehab-muted hover:bg-slate-300 hover:text-rehab-ink"
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
            icon={Camera}
            title={t.webcamView}
            description={t.webcamViewDesc}
          >
            <SegmentedControl
              options={[
                { value: "mirrored", label: t.webcamViewMirrored },
                { value: "original", label: t.webcamViewOriginal },
              ]}
              active={webcamViewMode}
              onChange={onWebcamViewModeChange}
            />
          </SettingRow>

          <SettingRow
            icon={RotateCcw}
            title={t.resetDemoData}
            description={t.resetDemoDataDesc}
          >
            {confirmReset ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmReset(false)} disabled={resetState === "loading"}>
                  {t.cancel}
                </Button>
                <Button
                  variant="danger"
                  onClick={handleReset}
                  disabled={resetState === "loading"}
                >
                  {resetState === "loading" ? t.resetInProgress : t.confirmReset}
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setResetState("idle");
                  setConfirmReset(true);
                }}
              >
                {t.resetData}
              </Button>
            )}
          </SettingRow>
          {resetState === "success" ? (
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {t.resetDemoDataSuccess}
            </div>
          ) : null}
          {resetState === "error" ? (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {t.resetDemoDataError}
            </div>
          ) : null}
        </div>
      </ClinicalCard>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.movementAiSettings ?? "Movement AI"} description={t.movementAiSettingsDesc ?? "Prototype voluntary/involuntary movement model status and training readiness."} />
        <div className="mt-5">
          <SettingRow
            icon={BrainCircuit}
            title={t.movementModelStatus ?? "Movement intent model"}
            description={t.movementModelStatusDesc ?? "Uses clinician labels and extracted webcam movement features. Not clinically validated."}
          >
            <div className="flex flex-col items-end gap-2">
              <StatusBadge tone={movementAi.model?.trained ? "connected" : "warning"}>
                {movementAi.model?.trained ? (t.trained ?? "Trained") : (t.notTrained ?? "Not trained")}
              </StatusBadge>
              <Button variant="secondary" onClick={refreshMovementAi} disabled={movementAi.state === "loading" || movementAi.state === "training"}>
                {t.refresh ?? "Refresh"}
              </Button>
            </div>
          </SettingRow>

          <div className="grid gap-3 border-t border-rehab-line py-4 sm:grid-cols-4">
            <AiStat label={t.labeledSegments ?? "Labeled segments"} value={movementAi.readiness?.labeled_segments ?? 0} />
            <AiStat label={t.usableSegments ?? "Usable segments"} value={movementAi.readiness?.usable_labeled_segments ?? 0} />
            <AiStat label={t.trainingSamples ?? "Training samples"} value={movementAi.model?.training_samples ?? 0} />
            <AiStat label={t.modelAccuracy ?? "Prototype accuracy"} value={formatAccuracy(movementAi.model?.evaluation?.accuracy)} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F9C74F]/25 bg-[#F9C74F]/10 px-4 py-3">
            <p className="max-w-3xl text-sm font-semibold leading-5 text-[#8A6B00]">
              {t.intentModelNotTrained ?? movementAi.model?.note ?? movementAi.readiness?.note}
            </p>
            <Button onClick={handleTrainMovementModel} disabled={movementAi.state === "training" || movementAi.state === "loading"}>
              {movementAi.state === "training" ? (t.trainingModel ?? "Training...") : (t.trainMovementModel ?? "Train model")}
            </Button>
          </div>

          {movementAi.state === "not-ready" ? (
            <p className="mt-3 text-sm font-semibold text-[#8A6B00]">
              {t.notEnoughLabelsToTrain ?? movementAi.model?.reason}
            </p>
          ) : null}
          {movementAi.state === "error" ? (
            <p className="mt-3 text-sm font-semibold text-[#B4232A]">
              {t.movementAiUnavailable ?? "Movement AI status is unavailable. Check the backend connection."}
            </p>
          ) : null}
        </div>
      </ClinicalCard>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.reports} description={t.reportsSettingsDesc} />
        <div className="mt-5">
          <SettingRow icon={FileText} title={t.pdfLanguage} description={t.pdfLanguageDesc}>
            <StatusBadge tone="neutral">{t.followsUiLanguage ?? "Suit la langue de l'interface"}</StatusBadge>
          </SettingRow>

          <SettingRow icon={FileText} title={t.includeCharts} description={t.includeChartsDesc}>
            <StatusBadge tone="connected">{t.includedByDefault ?? "Inclus par défaut"}</StatusBadge>
          </SettingRow>

          <SettingRow icon={FileText} title={t.includeRecommendations} description={t.includeRecommendationsDesc}>
            <StatusBadge tone="connected">{t.includedByDefault ?? "Inclus par défaut"}</StatusBadge>
          </SettingRow>
        </div>
      </ClinicalCard>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.system} description={t.systemDesc} />
        <div className="mt-5">
          <SettingRow icon={Server} title={t.apiStatus} description={t.apiStatusDesc}>
            <StatusBadge tone={health?.status === "ok" ? "connected" : "warning"}>{readableStatus(t, health?.status)}</StatusBadge>
          </SettingRow>

          <SettingRow icon={Database} title={t.databaseStatus} description={t.databaseStatusDesc}>
            <StatusBadge tone={status?.database === "active" ? "active" : "warning"}>{readableStatus(t, status?.database)}</StatusBadge>
          </SettingRow>

          <SettingRow icon={Camera} title={t.webcamStatus} description={t.webcamStatusDesc}>
            <StatusBadge tone={status?.webcam === "demo_mode" ? "demo" : status?.webcam === "available" ? "connected" : "warning"}>{readableStatus(t, status?.webcam)}</StatusBadge>
          </SettingRow>

          <SettingRow icon={MonitorCog} title={t.esp32Status} description={t.esp32StatusDesc}>
            <StatusBadge tone={status?.esp32 === "connected" ? "connected" : "warning"}>{readableStatus(t, status?.esp32)}</StatusBadge>
          </SettingRow>

          <SettingRow icon={Wifi} title={t.connectionMode} description={t.connectionModeDesc}>
            <StatusBadge tone={status?.esp32 === "connected" ? "connected" : "demo"}>
              {status?.esp32 === "connected" ? t.usbSerial : (t.webcamDemoActive ?? "Webcam / démo")}
            </StatusBadge>
          </SettingRow>
        </div>
      </ClinicalCard>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.esp32SerialConnection ?? "ESP32 USB serial"} description={t.esp32SerialConnectionDesc ?? "Connect the ultrasonic board over USB before running ESP32 serial assessments."} />
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-rehab-line bg-white p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-52 flex-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.comPort ?? "COM port"}</span>
                <select
                  value={esp32.selectedPort}
                  onChange={(event) => setEsp32((current) => ({ ...current, selectedPort: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-rehab-line bg-white px-3 py-2 text-sm font-semibold text-rehab-ink outline-none focus:border-rehab-teal"
                >
                  {esp32.selectedPort ? <option value={esp32.selectedPort}>{esp32.selectedPort}</option> : <option value="">{t.commonUi?.selectPort ?? t.selectPort}</option>}
                  {esp32.ports.map((port) => (
                    <option key={port.device} value={port.device}>{port.device} · {port.description}</option>
                  ))}
                </select>
              </label>
              <label className="w-36">
                <span className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.baudRate ?? "Baud rate"}</span>
                <input
                  value={esp32.baudRate}
                  onChange={(event) => setEsp32((current) => ({ ...current, baudRate: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 text-sm font-semibold text-rehab-ink outline-none focus:border-rehab-teal"
                />
              </label>
              <Button variant="secondary" onClick={scanEsp32Ports} disabled={esp32.state === "scanning"}>
                <Usb size={16} /> {esp32.state === "scanning" ? (t.scanning ?? "Scanning...") : (t.scanPorts ?? "Scan ports")}
              </Button>
              {esp32.status?.connected ? (
                <Button variant="secondary" onClick={disconnectEsp32}>
                  {t.disconnect ?? "Disconnect"}
                </Button>
              ) : (
                <Button onClick={connectEsp32} disabled={!esp32.selectedPort || esp32.state === "connecting"}>
                  <PlugZap size={16} /> {esp32.state === "connecting" ? (t.connecting ?? "Connecting...") : (t.connect ?? "Connect")}
                </Button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={calibrateEsp32} disabled={!esp32.status?.connected}>
                {esp32.status?.calibration?.active ? (t.calibrating ?? "Calibrating...") : (t.startCalibration ?? "Start calibration")}
              </Button>
              <Button variant="secondary" onClick={zeroEsp32} disabled={!esp32.status?.connected || !esp32.status?.latest_packet}>
                {t.zeroBaseline ?? "Zero baseline"}
              </Button>
            </div>

            {esp32.state === "scanError" ? (
              <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {t.scanError ?? "La recherche de ports a échoué. Vérifiez que le serveur backend est démarré."}
              </p>
            ) : esp32.hasScanned && esp32.ports.length === 0 && !esp32.status?.connected ? (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                {t.noPortsFound ?? "Aucun port détecté. Assurez-vous que le dispositif est branché en USB."}
              </p>
            ) : esp32.status?.error ? (
              <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" title={esp32.status.error}>
                {friendlyEsp32Error(t, esp32.status.error)}
              </p>
            ) : (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-rehab-muted">
                {esp32.status?.connected ? (t.esp32UsbReady ?? "USB serial connected. ESP32 sessions will use this board first.") : (t.esp32UsbFallback ?? "No ESP32 connected. Demo and webcam modes remain available.")}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-rehab-line bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-rehab-ink">{t.latestPacket ?? "Latest packet"}</p>
              <StatusBadge tone={esp32.status?.connected ? "connected" : "warning"}>{readableStatus(t, esp32.status?.status)}</StatusBadge>
            </div>
            {esp32.status?.connected && esp32.status?.latest_packet ? (
              <>
                <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-white p-3 text-xs text-rehab-muted">{JSON.stringify(esp32.status.latest_packet, null, 2)}</pre>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {sensorHealthKeys(esp32.status?.sensor_health).map((key) => (
                    <div key={key} className="rounded-lg bg-white p-2 text-center">
                      <p className="text-xs font-semibold uppercase text-rehab-muted">{sensorShortName(t, key)}</p>
                      <p className={`mt-1 text-sm font-semibold ${esp32.status?.sensor_health?.[key] === "ok" ? "text-emerald-700" : "text-amber-700"}`}>
                        {sensorHealthText(t, esp32.status?.sensor_health?.[key])}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-rehab-muted">
                {t.awaitingBoardData ?? "En attente de données du plateau — connectez l'ESP32 pour voir les mesures des capteurs."}
              </p>
            )}
          </div>
        </div>
      </ClinicalCard>
    </div>
  );
}

function sensorShortName(t, key) {
  const labels = {
    front: t.sensorFront ?? "Avant",
    rear: t.sensorRear ?? "Arrière",
    left: t.sensorLeft ?? "Gauche",
    right: t.sensorRight ?? "Droite",
    front_left: t.sensorFrontLeft ?? "Avant G",
    front_right: t.sensorFrontRight ?? "Avant D",
    rear_left: t.sensorRearLeft ?? "Arrière G",
    rear_right: t.sensorRearRight ?? "Arrière D",
  };
  return labels[key] ?? key;
}

function sensorHealthText(t, value) {
  if (value === "ok") return t.sensorOk ?? "OK";
  if (value === "warning") return t.sensorWarning ?? "Alerte";
  return t.sensorUnknown ?? "—";
}

function friendlyEsp32Error(t, raw) {
  const text = String(raw ?? "");
  const portMatch = text.match(/Could not open ([^:]+):/);
  if (portMatch) {
    return (t.esp32PortOpenError ?? "Impossible d'ouvrir le port {port}. Vérifiez que l'ESP32 est branché et que le port n'est pas utilisé par un autre logiciel.").replace("{port}", portMatch[1]);
  }
  return t.esp32GenericError ?? "La connexion ESP32 a échoué. Vérifiez le câble USB et réessayez.";
}

function sensorHealthKeys(health = {}) {
  const keys = Object.keys(health);
  if (["front", "rear", "left", "right"].every((key) => keys.includes(key))) return ["front", "rear", "left", "right"];
  return ["front_left", "front_right", "rear_left", "rear_right"];
}

function AiStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold text-rehab-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-rehab-ink">{value}</p>
    </div>
  );
}

function formatAccuracy(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${Math.round(numeric * 100)}%`;
}
