import { demoAssessments } from "./demoAssessments.js";
import { demoPatients } from "./demoPatients.js";
import { demoReports } from "./demoReports.js";
import { demoSessions } from "./demoSessions.js";

export { demoAssessments, demoPatients, demoReports, demoSessions };

const scores = demoSessions.map((session) => session.totalScore);
const averageScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
const attentionPatients = demoPatients.filter((patient) => ["Follow-up", "Declining"].includes(patient.status));

export const demoDashboardMetrics = {
  totalPatients: demoPatients.length,
  activePatients: demoPatients.filter((patient) => patient.status !== "Stable" || patient.latestScore < 85).length,
  assessmentsToday: demoSessions.filter((session) => session.dateISO === "2026-06-03").length,
  assessmentsThisWeek: demoSessions.filter((session) => session.dateISO >= "2026-05-29").length,
  averageBalanceScore: averageScore,
  averageImprovement: Math.round((demoPatients.reduce((sum, patient) => sum + Number(patient.improvement ?? 0), 0) / demoPatients.length) * 10) / 10,
  followUpPatients: attentionPatients.length,
};

export const demoClinicalInsights = [
  {
    id: "decline",
    title: `${demoPatients.filter((patient) => patient.status === "Declining").length} patients show declining stability`,
    description: "Dynamic or eyes-closed sessions decreased across recent visits.",
    severity: "danger",
  },
  {
    id: "follow-up",
    title: `${attentionPatients.length} patients require follow-up`,
    description: "Prioritize patients with total scores below 65 or negative progress.",
    severity: "warning",
  },
  {
    id: "dynamic-gap",
    title: "Dynamic score is 12 points lower",
    description: "Static conditions are controlled, but dynamic balance remains limited.",
    severity: "active",
  },
  {
    id: "vision",
    title: "Eyes-closed tests show higher instability",
    description: "Consider proprioceptive training for patients with visual dependency.",
    severity: "demo",
  },
];

export const demoCharts = {
  balanceEvolution: demoSessions.slice(0, 6).reverse().map((session, index) => ({ label: `S${index + 1}`, value: session.totalScore })),
  staticDynamic: [
    { label: "Static", value: average(demoSessions.filter((session) => session.testType === "Static").map((session) => session.totalScore)), color: "#90BE6D" },
    { label: "Dynamic", value: average(demoSessions.filter((session) => session.testType === "Dynamic").map((session) => session.totalScore)), color: "#577590" },
  ],
  visionCondition: [
    { label: "Eyes open", value: average(demoSessions.filter((session) => session.condition === "Eyes open").map((session) => session.totalScore)), color: "#90BE6D" },
    { label: "Eyes closed", value: average(demoSessions.filter((session) => session.condition === "Eyes closed").map((session) => session.totalScore)), color: "#F8961E" },
  ],
  scoreDistribution: [
    { label: "<60", value: demoSessions.filter((session) => session.totalScore < 60).length, color: "#F94144" },
    { label: "60-69", value: demoSessions.filter((session) => session.totalScore >= 60 && session.totalScore < 70).length, color: "#F8961E" },
    { label: "70-79", value: demoSessions.filter((session) => session.totalScore >= 70 && session.totalScore < 80).length, color: "#F9C74F" },
    { label: "80+", value: demoSessions.filter((session) => session.totalScore >= 80).length, color: "#43AA8B" },
  ],
};

export const demoAttentionPatients = attentionPatients.slice(0, 8).map((patient) => ({
  id: patient.id,
  name: patient.fullName,
  reason: patient.status === "Declining" ? "Declining stability" : "Follow-up due",
  detail: `${patient.pathology} - latest score ${patient.latestScore}/100.`,
  severity: patient.status === "Declining" ? "danger" : "warning",
  count: patient.status === "Declining" ? `${patient.improvement}%` : patient.latestScore,
}));

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + Number(value), 0) / values.length);
}
