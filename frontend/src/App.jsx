import { useEffect, useMemo, useState } from "react";

import { api } from "./api/client";
import { AppShell } from "./layout/AppShell";
import { translations } from "./i18n/translations";
import { Dashboard } from "./pages/Dashboard";
import { AboutPage } from "./pages/About";
import { BalanceAssessmentPage } from "./pages/BalanceAssessment";
import { PatientsPage } from "./pages/Patients";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProgressAnalyticsPage } from "./pages/ProgressAnalytics";
import { SettingsPage } from "./pages/Settings";
import { loadPersistedState, resetPersistedState, savePersistedState } from "./utils/storage";

const pages = [
  "dashboard",
  "patients",
  "balanceAssessment",
  "progressAnalytics",
  "about",
  "settings",
];

export default function App() {
  const initialData = useMemo(() => loadPersistedState(), []);
  const [language, setLanguage] = useState("en");
  const [activePage, setActivePage] = useState("dashboard");
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(null);
  const [patients, setPatients] = useState(() => initialData.patients);
  const [sessions, setSessions] = useState(() => initialData.sessions);
  const [reports, setReports] = useState(() => initialData.reports);
  const [preselectedPatientId, setPreselectedPatientId] = useState(null);
  const [patientAddRequest, setPatientAddRequest] = useState(0);

  const t = translations[language];

  useEffect(() => {
    Promise.allSettled([api.health(), api.status()]).then(([healthResult, statusResult]) => {
      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value);
      }
      if (statusResult.status === "fulfilled") {
        setStatus(statusResult.value);
      }
    });
  }, []);

  useEffect(() => {
    savePersistedState({ patients, sessions, reports });
  }, [patients, sessions, reports]);

  const pageTitle = useMemo(() => t[activePage], [activePage, t]);

  const renderPage = () => {
    if (activePage === "dashboard") {
      return (
        <Dashboard
          t={t}
          patients={patients}
          sessions={sessions}
          reports={reports}
          onStartAssessment={(patientId) => {
            if (patientId) {
              setPreselectedPatientId(patientId);
            }
            setActivePage("balanceAssessment");
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
          reports={reports}
          onAddPatient={(payload) => {
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
          onUpdatePatient={(id, payload) => {
            setPatients((current) =>
              current.map((patient) =>
                patient.id === id ? { ...patient, ...payload, age: Number(payload.age) || patient.age } : patient,
              ),
            );
          }}
          onDeletePatient={(id) => {
            setPatients((current) => current.filter((patient) => patient.id !== id));
            setSessions((current) => current.filter((session) => session.patientId !== id));
            setReports((current) => current.filter((report) => report.patientId !== id));
          }}
          onStartAssessment={(id) => {
            setPreselectedPatientId(id);
            setActivePage("balanceAssessment");
          }}
          addRequest={patientAddRequest}
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
          onSaveSession={(session) => {
            setSessions((current) => [session, ...current]);
            setPatients((current) =>
              current.map((patient) =>
                patient.id === session.patientId
                  ? {
                      ...patient,
                      latestScore: session.totalScore,
                      lastAssessmentDate: session.date,
                      status: session.status,
                    }
                  : patient,
              ),
            );
          }}
          onSaveReport={(report) => setReports((current) => [report, ...current])}
        />
      );
    }

    if (activePage === "progressAnalytics") {
      return <ProgressAnalyticsPage t={t} patients={patients} sessions={sessions} />;
    }

    if (activePage === "settings") {
      return (
        <SettingsPage
          t={t}
          language={language}
          onLanguageChange={setLanguage}
          health={health}
          status={status}
          onResetDemoData={() => {
            const seed = resetPersistedState();
            setPatients(seed.patients);
            setSessions(seed.sessions);
            setReports(seed.reports);
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
