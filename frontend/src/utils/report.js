import { jsPDF } from "jspdf";

export function downloadSessionReport({ patient, session }) {
  const doc = new jsPDF();
  const margin = 16;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("BalanceRehab Assessment Report", margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Educational rehabilitation-support prototype - Demo acquisition", margin, y);
  y += 12;

  section(doc, "Patient information", y);
  y += 8;
  y = line(doc, `Patient: ${patient.fullName} (${patient.patientCode})`, y);
  y = line(doc, `Age / Sex: ${patient.age ?? "-"} / ${patient.sex ?? "-"}`, y);
  y = line(doc, `Pathology: ${patient.pathology ?? "-"}`, y);
  y += 4;

  section(doc, "Test conditions", y);
  y += 8;
  y = line(doc, `Date: ${session.date}`, y);
  y = line(doc, `Test type: ${session.testType}`, y);
  y = line(doc, `Support ring: ${session.supportRing}`, y);
  y = line(doc, `Vision condition: ${session.condition}`, y);
  y = line(doc, `Duration: ${session.durationSeconds} seconds`, y);
  y += 4;

  section(doc, "Scores", y);
  y += 8;
  y = line(doc, `Total balance score: ${session.totalScore}/100`, y);
  y = line(doc, `Board stability score: ${session.boardScore}/100`, y);
  y = line(doc, `Posture stability score: ${session.postureScore}/100`, y);
  y = line(doc, `Status: ${session.results.status}`, y);
  y += 4;

  section(doc, "Metrics", y);
  y += 8;
  y = line(doc, `AP sway: ${session.results.meanSwayAp} mm mean / ${session.results.maxSwayAp} mm max`, y);
  y = line(doc, `ML sway: ${session.results.meanSwayMl} mm mean / ${session.results.maxSwayMl} mm max`, y);
  y = line(doc, `Sway velocity: ${session.results.swayVelocity} mm/s`, y);
  y = line(doc, `Instability events: ${session.results.instabilityEvents}`, y);
  y = line(doc, `Trunk deviation: ${session.results.trunkDeviation} deg`, y);
  y += 4;

  section(doc, "Interpretation", y);
  y += 8;
  y = paragraph(doc, session.results.interpretation, y);
  y += 4;

  section(doc, "Recommendations", y);
  y += 8;
  session.results.recommendations.forEach((item) => {
    y = paragraph(doc, `- ${item}`, y);
  });

  y = Math.max(y + 8, 270);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
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
