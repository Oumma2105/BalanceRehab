import { demoSessions } from "./demoSessions.js";

const reportSessions = demoSessions.filter((session, index) => index % 3 === 0 || session.status === "Declining").slice(0, 45);

export const demoReports = reportSessions.map((session, index) => {
  const reportId = `R-${String(300 + index).padStart(3, "0")}`;

  return {
    id: reportId,
    reportId,
    patientId: session.patientId,
    patientCode: session.patientCode,
    patient: session.patient,
    sessionId: session.sessionId,
    session: session.sessionId,
    createdAt: `${session.dateISO}T${String(10 + (index % 7)).padStart(2, "0")}:15:00`,
    generatedAt: `${session.dateISO} ${String(10 + (index % 7)).padStart(2, "0")}:15`,
    downloadable: true,
    language: "FR",
    acquisitionMode: "Demo",
    summaryKey: "demo_assessment_report_summary",
    summary: `${session.testType} ${session.visionCondition.toLowerCase()} assessment: ${session.totalBalanceScore}/100. ${session.status} follow-up status.`,
  };
});
