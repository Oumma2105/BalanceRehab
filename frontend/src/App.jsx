import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./api/client";
import { AppShell } from "./layout/AppShell";
import { translations } from "./i18n/translations";
import { Dashboard } from "./pages/Dashboard";
import { AboutPage } from "./pages/About";
import { BalanceAssessmentPage } from "./pages/BalanceAssessment";
import { PatientsPage } from "./pages/Patients";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProgressAnalyticsPage } from "./pages/ProgressAnalytics";
import { RehabilitationGamesPage } from "./pages/RehabilitationGames";
import { SettingsPage } from "./pages/Settings";
import { downloadSessionReport } from "./utils/report";
import { loadPersistedState, resetPersistedState, savePersistedState } from "./utils/storage";

const pages = [
  "dashboard",
  "patients",
  "balanceAssessment",
  "rehabGames",
  "about",
  "settings",
];

export default function App() {
  const initialData = useMemo(() => loadPersistedState(), []);
  const [language, setLanguage] = useState("fr");
  const [webcamViewMode, setWebcamViewMode] = useState(() => localStorage.getItem("balancerehab_webcam_view") ?? "mirrored");
  const [activePage, setActivePage] = useState("dashboard");
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(null);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [patients, setPatients] = useState(() => initialData.patients);
  const [sessions, setSessions] = useState(() => initialData.sessions);
  const [reports, setReports] = useState(() => initialData.reports);
  const [preselectedPatientId, setPreselectedPatientId] = useState(null);
  const [patientAddRequest, setPatientAddRequest] = useState(0);
  const [patientProfileRequest, setPatientProfileRequest] = useState(null);
  const [assessmentFocus, setAssessmentFocus] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [rehabSessions, setRehabSessions] = useState([]);
  const [rehabPatientId, setRehabPatientId] = useState(null);

  const t = translations[language];

  const loadPatientSessions = useCallback(
    async (id) => {
      if (!backendReady) return;
      try {
        const backendSessions = await api.patientSessions(id, patients);
        setSessions((current) => [
          ...backendSessions,
          ...current.filter((session) => session.patientId !== id),
        ]);
      } catch (error) {
        console.warn("Patient session refresh failed, keeping local sessions.", error);
      }
    },
    [backendReady, patients],
  );

  const loadPatientProgress = useCallback(
    async (id) => {
      if (!backendReady) return null;
      try {
        return await api.patientProgress(id);
      } catch (error) {
        console.warn("Patient progress refresh failed, keeping local progress.", error);
        return null;
      }
    },
    [backendReady],
  );

  const downloadReportForSession = useCallback(
    async ({ patient, session }) => {
      if (backendReady && Number.isInteger(Number(session.id))) {
        try {
          const reportData = await api.sessionReportData(session.id);
          downloadSessionReport({ patient: reportData.patient, session: reportData.session, t });
          return;
        } catch (error) {
          console.warn("Backend report-data download failed, using local session data.", error);
        }
      }

      downloadSessionReport({ patient, session, t });
    },
    [backendReady, t],
  );

  const downloadReportBySessionId = useCallback(
    async ({ sessionId, patientId }) => {
      if (backendReady && Number.isInteger(Number(sessionId))) {
        try {
          const reportData = await api.sessionReportData(sessionId);
          downloadSessionReport({ patient: reportData.patient, session: reportData.session, t });
          return;
        } catch (error) {
          console.warn("Backend report-data download failed, using local report data.", error);
        }
      }

      const session = sessions.find((item) => String(item.id) === String(sessionId) || String(item.sessionId) === String(sessionId));
      const patient = patients.find((item) => item.id === (patientId ?? session?.patientId));
      if (patient && session) {
        downloadSessionReport({ patient, session, t });
      }
    },
    [backendReady, patients, sessions, t],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadBackendState() {
      const [healthResult, statusResult] = await Promise.allSettled([api.health(), api.status()]);
      if (cancelled) return;

      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value);
        setBackendReady(true);
      }
      if (statusResult.status === "fulfilled") {
        setStatus(statusResult.value);
      }
      if (healthResult.status !== "fulfilled") return;

      try {
        const backendPatients = await api.patients();
        const [backendSessionsResult, backendReportsResult, backendDashboardSummaryResult, backendRehabSessionsResult] = await Promise.allSettled([
          api.sessions(backendPatients),
          api.reports(),
          api.dashboardSummary(),
          api.rehabSessions?.().catch(() => []),
        ]);
        if (!cancelled) {
          setPatients(backendPatients);
          if (backendSessionsResult.status === "fulfilled") {
            setSessions(backendSessionsResult.value);
          }
          if (backendReportsResult.status === "fulfilled") {
            setReports(backendReportsResult.value);
          }
          setDashboardSummary(backendDashboardSummaryResult.status === "fulfilled" ? backendDashboardSummaryResult.value : null);
          setRehabSessions(backendRehabSessionsResult.status === "fulfilled" ? (backendRehabSessionsResult.value ?? []) : []);
        }
      } catch (error) {
        console.warn("Backend data loading failed, keeping local state.", error);
      }
    }

    loadBackendState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    savePersistedState({ patients, sessions, reports });
  }, [patients, sessions, reports]);

  useEffect(() => {
    localStorage.setItem("balancerehab_webcam_view", webcamViewMode);
  }, [webcamViewMode]);

  const pageTitle = useMemo(() => t[activePage], [activePage, t]);

  const renderPage = () => {
    if (activePage === "dashboard") {
      return (
        <Dashboard
          t={t}
          patients={patients}
          sessions={sessions}
          rehabSessions={rehabSessions}
          reports={reports}
          dashboardSummary={dashboardSummary}
          onDownloadReport={downloadReportBySessionId}
          onStartAssessment={(patientId) => {
            if (patientId) {
              setPreselectedPatientId(patientId);
            }
            setActivePage("balanceAssessment");
          }}
          onViewPatient={(patientId) => {
            setPatientProfileRequest({ patientId, tab: "sessions", requestedAt: Date.now() });
            setActivePage("patients");
          }}
          onAddPatient={() => {
            setPatientAddRequest((current) => current + 1);
            setActivePage("patients");
          }}
          onOpenPatients={() => setActivePage("patients")}
        />
      );
    }

    if (activePage === "patients") {
      return (
        <PatientsPage
          t={t}
          patients={patients}
          sessions={sessions}
          rehabSessions={rehabSessions}
          reports={reports}
          onAddPatient={async (payload) => {
            if (backendReady) {
              const backendPatient = await api.createPatient(payload);
              setPatients((current) => [backendPatient, ...current]);
              return backendPatient;
            }
            const nextId = Math.max(0, ...patients.map((patient) => patient.id)) + 1;
            const nextPatientCode = getNextPatientCode(patients);
            const newPatient = {
              ...payload,
              id: nextId,
              age: Number(payload.age) || null,
              patientId: nextPatientCode,
              patientCode: nextPatientCode,
              latestScore: null,
              lastAssessmentDate: null,
              status: "No sessions",
            };
            setPatients([newPatient, ...patients]);
            return newPatient;
          }}
          onUpdatePatient={async (id, payload) => {
            if (backendReady) {
              const updatedPatient = await api.updatePatient(id, payload);
              setPatients((current) => current.map((patient) => (patient.id === id ? updatedPatient : patient)));
              return;
            }
            setPatients((current) =>
              current.map((patient) =>
                patient.id === id ? { ...patient, ...payload, age: Number(payload.age) || patient.age } : patient,
              ),
            );
          }}
          onDeletePatient={async (id) => {
            if (backendReady) {
              await api.deletePatient(id);
            }
            setPatients((current) => current.filter((patient) => patient.id !== id));
            setSessions((current) => current.filter((session) => session.patientId !== id));
            setReports((current) => current.filter((report) => report.patientId !== id));
          }}
          onStartAssessment={(id) => {
            setPreselectedPatientId(id);
            setActivePage("balanceAssessment");
          }}
          onStartRehabGame={(id) => {
            setRehabPatientId(id);
            setActivePage("rehabGames");
          }}
          onLoadPatientSessions={backendReady ? loadPatientSessions : null}
          onDownloadSessionReport={downloadReportForSession}
          addRequest={patientAddRequest}
          onAddRequestHandled={() => setPatientAddRequest(0)}
          profileRequest={patientProfileRequest}
          onProfileRequestHandled={() => setPatientProfileRequest(null)}
        />
      );
    }

    if (activePage === "balanceAssessment") {
      return (
        <BalanceAssessmentPage
          patients={patients}
          sessions={sessions}
          preselectedPatientId={preselectedPatientId}
          t={t}
          onClearPreselectedPatient={() => setPreselectedPatientId(null)}
          onWorkflowFocusChange={setAssessmentFocus}
          webcamMirrored={webcamViewMode === "mirrored"}
          onSaveSession={async (session) => {
            const saved = backendReady ? await api.createSession(session, patients) : session;
            setSessions((current) => [saved, ...current]);
            setPatients((current) =>
              current.map((patient) =>
                patient.id === saved.patientId
                  ? {
                      ...patient,
                      latestScore: saved.totalScore,
                      lastAssessmentDate: saved.date,
                      status: saved.status,
                    }
                  : patient,
              ),
            );
            if (backendReady) {
              api.dashboardSummary().then(setDashboardSummary).catch(() => {});
            }
            return saved;
          }}
          onSaveReport={async (report) => {
            const saved = backendReady ? await api.createReport(report) : report;
            setReports((current) => [saved, ...current]);
            if (backendReady) {
              api.dashboardSummary().then(setDashboardSummary).catch(() => {});
            }
            return saved;
          }}
          onDownloadSessionReport={downloadReportForSession}
          onReturnToPatientProfile={(patientId, tab = "overview") => {
            setPatientProfileRequest({ patientId, tab, requestedAt: Date.now() });
            setActivePage("patients");
          }}
          onStartRehabGame={(patientId) => {
            setRehabPatientId(patientId);
            setActivePage("rehabGames");
          }}
        />
      );
    }

    if (activePage === "rehabGames") {
      return (
        <RehabilitationGamesPage
          t={t}
          patients={patients}
          sessions={sessions}
          rehabilitationSessions={rehabSessions}
          preselectedPatientId={rehabPatientId}
          onWorkflowFocusChange={setAssessmentFocus}
          onOpenPatientRehabilitation={(patientId) => {
            setPatientProfileRequest({ patientId, tab: "rehabilitation", requestedAt: Date.now() });
            setActivePage("patients");
          }}
          onSaveRehabilitationSession={async (session) => {
            if (backendReady && api.createRehabSession) {
              const saved = await api.createRehabSession(session);
              setRehabSessions((current) => [saved, ...current]);
              return saved;
            }
            const local = { ...session, id: Date.now(), createdAt: new Date().toISOString() };
            setRehabSessions((current) => [local, ...current]);
            return local;
          }}
        />
      );
    }

    if (activePage === "progressAnalytics") {
      return (
        <ProgressAnalyticsPage
          t={t}
          patients={patients}
          sessions={sessions}
          onLoadPatientProgress={backendReady ? loadPatientProgress : null}
        />
      );
    }

    if (activePage === "settings") {
      return (
        <SettingsPage
          t={t}
          language={language}
          onLanguageChange={setLanguage}
          webcamViewMode={webcamViewMode}
          onWebcamViewModeChange={setWebcamViewMode}
          health={health}
          status={status}
          onResetDemoData={async () => {
            if (backendReady) {
              try {
                await api.seedDemoData(true);
                const backendPatients = await api.patients();
                const [backendSessions, backendReports, backendDashboardSummary] = await Promise.all([
                  api.sessions(backendPatients),
                  api.reports(),
                  api.dashboardSummary(),
                ]);
                setPatients(backendPatients);
                setSessions(backendSessions);
                setReports(backendReports);
                setDashboardSummary(backendDashboardSummary);
                setPreselectedPatientId(null);
                return;
              } catch (error) {
                console.warn("Backend reset failed, resetting local demo data.", error);
              }
            }

            const seed = resetPersistedState();
            setPatients(seed.patients);
            setSessions(seed.sessions);
            setReports(seed.reports);
            setDashboardSummary(null);
            setPreselectedPatientId(null);
          }}
        />
      );
    }

    if (activePage === "about") {
      return <AboutPage t={t} />;
    }

    return <PlaceholderPage title={pageTitle} t={t} />;
  };

  return (
    <AppShell
      pages={pages}
      activePage={activePage}
      onPageChange={setActivePage}
      t={t}
      status={status}
      focused={(activePage === "balanceAssessment" || activePage === "rehabGames") && assessmentFocus}
      onExitFocus={() => {
        setAssessmentFocus(false);
      }}
    >
      {renderPage()}
    </AppShell>
  );
}

function getNextPatientCode(patients) {
  const maxCode = patients.reduce((max, patient) => {
    const match = String(patient.patientCode ?? "").match(/^BR-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1063);

  return `BR-${maxCode + 1}`;
}
