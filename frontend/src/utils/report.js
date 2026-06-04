import { jsPDF } from "jspdf";

export function downloadSessionReport({ patient, session, t = {} }) {
  const doc = new jsPDF();
  const margin = 16;
  const postureUnits = getPostureUnits(session);
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(t.assessmentReportTitle ?? "BalanceRehab Assessment Report", margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(t.reportPrototypeLine ?? "Educational rehabilitation-support prototype - Demo acquisition", margin, y);
  y += 12;

  section(doc, t.patientInformation ?? "Patient information", y);
  y += 8;
  y = line(doc, `${t.patient}: ${patient.fullName} (${patient.patientCode})`, y);
  y = line(doc, `${t.age} / ${t.sex}: ${patient.age ?? "-"} / ${displaySex(patient.sex, t)}`, y);
  y = line(doc, `${t.heightWeight ?? "Height / Weight"}: ${patient.heightCm ?? "-"} cm / ${patient.weightKg ?? "-"} kg`, y);
  y = line(doc, `${t.dominantSide}: ${patient.dominantSide ?? "-"}`, y);
  y = line(doc, `${t.medicalReason}: ${patient.pathology ?? "-"}`, y);
  y = line(doc, `${t.clinicalGoal}: ${patient.clinicalGoal ?? "-"}`, y);
  if (patient.clinicalNotes || patient.notes) {
    y = paragraph(doc, `${t.clinicalNotes}: ${patient.clinicalNotes ?? patient.notes}`, y);
  }
  y += 4;

  section(doc, t.testConditions ?? "Test conditions", y);
  y += 8;
  y = line(doc, `${t.date}: ${session.date}`, y);
  y = line(doc, `${t.test}: ${session.testType}`, y);
  y = line(doc, `${t.supportRing ?? "Support ring"}: ${session.supportRing}`, y);
  y = line(doc, `${t.visionCondition ?? "Vision condition"}: ${session.condition}`, y);
  y = line(doc, `${t.duration}: ${session.durationSeconds} ${t.seconds ?? "seconds"}`, y);
  y = line(doc, `${t.acquisitionMode ?? "Acquisition mode"}: ${session.acquisitionMode ?? "Demo"}`, y);
  y += 4;

  section(doc, t.scores ?? "Scores", y);
  y += 8;
  y = line(doc, `${t.totalBalanceScore}: ${session.totalScore}/100`, y);
  y = line(
    doc,
    `${t.boardStability}: ${session.results.availableMetrics?.board ? `${session.boardScore}/100` : t.notAvailableWebcamOnly ?? "Not available in webcam-only mode"}`,
    y,
  );
  y = line(doc, `${t.postureStability}: ${session.postureScore}/100`, y);
  y = line(doc, `${t.status}: ${session.results.status}`, y);
  y += 4;

  section(doc, t.postureMetrics ?? "Posture metrics", y);
  y += 8;
  y = line(doc, `${t.trunkDeviation}: ${session.results.trunkDeviation} ${postureUnits.trunk}`, y);
  y = line(doc, `${t.shoulderAsymmetry}: ${session.results.shoulderAsymmetry} ${postureUnits.asymmetry}`, y);
  y = line(doc, `${t.hipAsymmetry}: ${session.results.hipAsymmetry} ${postureUnits.asymmetry}`, y);
  y = line(doc, `${t.bodyCenterDeviation}: ${session.results.bodyCenterDeviation} ${postureUnits.center}`, y);
  y += 4;

  section(doc, t.swayMetrics ?? "Sway metrics", y);
  y += 8;
  if (session.results.availableMetrics?.board) {
    y = line(doc, `${t.apSway}: ${session.results.meanSwayAp} mm ${t.mean ?? "mean"} / ${session.results.maxSwayAp} mm ${t.max ?? "max"}`, y);
    y = line(doc, `${t.mlSway}: ${session.results.meanSwayMl} mm ${t.mean ?? "mean"} / ${session.results.maxSwayMl} mm ${t.max ?? "max"}`, y);
    y = line(doc, `${t.swayVelocity}: ${session.results.swayVelocity} mm/s`, y);
    y = line(doc, `${t.instabilityEvents}: ${session.results.instabilityEvents}`, y);
  } else {
    y = paragraph(doc, t.notAvailableWebcamOnly ?? "Not available in webcam-only mode", y);
  }
  y += 4;

  section(doc, t.interpretation ?? "Interpretation", y);
  y += 8;
  y = paragraph(doc, session.results.interpretation, y);
  y += 4;

  section(doc, t.recommendations ?? "Recommendations", y);
  y += 8;
  session.results.recommendations.forEach((item) => {
    y = paragraph(doc, `- ${item}`, y);
  });

  y = Math.max(y + 8, 270);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    t.educationalDisclaimer ??
      "This prototype is designed for educational and rehabilitation-support purposes only. It does not replace certified medical diagnosis or clinical decision-making.",
    margin,
    y,
    { maxWidth: 178 },
  );

  doc.save(`BalanceRehab_${patient.patientCode}_${session.id}.pdf`);
}

function section(doc, text, y) {
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 33, 61);
  doc.setFontSize(12);
  doc.text(text, 16, y);
}

function line(doc, text, y) {
  doc.setFont("helvetica", "normal");
  doc.setTextColor(35);
  doc.setFontSize(10);
  doc.text(text, 16, y);
  return y + 6;
}

function paragraph(doc, text, y) {
  doc.setFont("helvetica", "normal");
  doc.setTextColor(35);
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, 178);
  doc.text(lines, 16, y);
  return y + lines.length * 5 + 2;
}

function displaySex(sex, t = {}) {
  if (sex === "F" || sex === "Female") return t.female ?? "Female";
  if (sex === "M" || sex === "Male") return t.male ?? "Male";
  return sex ?? "-";
}

function getPostureUnits(session) {
  const isWebcamOnly = session.acquisitionModeKey === "webcam" || session.results?.acquisitionMode === "webcam";
  return {
    trunk: "deg",
    asymmetry: isWebcamOnly ? "%" : "deg",
    center: isWebcamOnly ? "%" : "mm",
  };
}
