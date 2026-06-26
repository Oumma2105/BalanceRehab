import { demoAssessments } from "./demoAssessments.js";
import { demoPatients } from "./demoPatients.js";
import { demoReports } from "./demoReports.js";
import { demoSessions } from "./demoSessions.js";

export { demoAssessments, demoPatients, demoReports, demoSessions };

const GAME_TYPES = [
  "weight_shift_trainer",
  "path_following",
  "balance_maze",
  "reach_touch",
  "balloon_pop",
  "squat_trainer",
  "single_leg_balance",
  "obstacle_avoidance",
];

const BASE = new Date("2026-06-26T00:00:00");

function rehabDate(daysAgo, hour = 10) {
  const d = new Date(BASE);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export const demoRehabSessions = [
  // Week 12 ago — early, lower scores
  { id: "rh-01", gameType: GAME_TYPES[0], score: 52, stability: 49, durationSeconds: 60,  createdAt: rehabDate(82, 9)  },
  { id: "rh-02", gameType: GAME_TYPES[4], score: 48, stability: 45, durationSeconds: 45,  createdAt: rehabDate(80, 14) },
  // Week 11
  { id: "rh-03", gameType: GAME_TYPES[1], score: 57, stability: 54, durationSeconds: 60,  createdAt: rehabDate(75, 10) },
  { id: "rh-04", gameType: GAME_TYPES[6], score: 55, stability: 53, durationSeconds: 90,  createdAt: rehabDate(73, 15) },
  // Week 10
  { id: "rh-05", gameType: GAME_TYPES[2], score: 61, stability: 58, durationSeconds: 60,  createdAt: rehabDate(68, 9)  },
  { id: "rh-06", gameType: GAME_TYPES[0], score: 63, stability: 60, durationSeconds: 120, createdAt: rehabDate(66, 11) },
  // Week 9
  { id: "rh-07", gameType: GAME_TYPES[3], score: 66, stability: 64, durationSeconds: 90,  createdAt: rehabDate(61, 10) },
  { id: "rh-08", gameType: GAME_TYPES[5], score: 64, stability: 62, durationSeconds: 60,  createdAt: rehabDate(59, 14) },
  // Week 8
  { id: "rh-09", gameType: GAME_TYPES[7], score: 69, stability: 67, durationSeconds: 120, createdAt: rehabDate(54, 9)  },
  { id: "rh-10", gameType: GAME_TYPES[1], score: 71, stability: 69, durationSeconds: 90,  createdAt: rehabDate(52, 16) },
  // Week 7
  { id: "rh-11", gameType: GAME_TYPES[4], score: 70, stability: 68, durationSeconds: 60,  createdAt: rehabDate(47, 10) },
  { id: "rh-12", gameType: GAME_TYPES[2], score: 74, stability: 72, durationSeconds: 120, createdAt: rehabDate(45, 11) },
  // Week 6
  { id: "rh-13", gameType: GAME_TYPES[6], score: 76, stability: 74, durationSeconds: 90,  createdAt: rehabDate(40, 9)  },
  { id: "rh-14", gameType: GAME_TYPES[0], score: 75, stability: 73, durationSeconds: 120, createdAt: rehabDate(38, 14) },
  // Week 5
  { id: "rh-15", gameType: GAME_TYPES[3], score: 79, stability: 77, durationSeconds: 120, createdAt: rehabDate(33, 10) },
  { id: "rh-16", gameType: GAME_TYPES[7], score: 77, stability: 76, durationSeconds: 90,  createdAt: rehabDate(31, 15) },
  // Week 4
  { id: "rh-17", gameType: GAME_TYPES[5], score: 81, stability: 79, durationSeconds: 120, createdAt: rehabDate(26, 9)  },
  { id: "rh-18", gameType: GAME_TYPES[1], score: 80, stability: 78, durationSeconds: 120, createdAt: rehabDate(24, 11) },
  // Week 3
  { id: "rh-19", gameType: GAME_TYPES[4], score: 83, stability: 81, durationSeconds: 120, createdAt: rehabDate(19, 10) },
  { id: "rh-20", gameType: GAME_TYPES[2], score: 85, stability: 83, durationSeconds: 120, createdAt: rehabDate(17, 14) },
  // Week 2
  { id: "rh-21", gameType: GAME_TYPES[6], score: 84, stability: 82, durationSeconds: 120, createdAt: rehabDate(12, 9)  },
  { id: "rh-22", gameType: GAME_TYPES[0], score: 87, stability: 85, durationSeconds: 120, createdAt: rehabDate(10, 16) },
  // Week 1 (most recent)
  { id: "rh-23", gameType: GAME_TYPES[3], score: 88, stability: 86, durationSeconds: 120, createdAt: rehabDate(5, 10)  },
  { id: "rh-24", gameType: GAME_TYPES[7], score: 90, stability: 88, durationSeconds: 120, createdAt: rehabDate(2, 14)  },
];

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
