import { jsPDF } from "jspdf";
import _logoSrc from "../assets/balancerehab-logo.png";

// Preload logo at module import — ready long before any user triggers a PDF download
let _logoDataUrl = null;
(() => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    _logoDataUrl = c.toDataURL("image/png");
  };
  img.src = _logoSrc;
})();

const PRIMARY = [67, 170, 139];
const TEXT = [30, 41, 59];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const SOFT = [248, 250, 252];
const GREEN = [67, 170, 139];
const BLUE = [87, 117, 144];
const YELLOW = [249, 199, 79];
const ORANGE = [248, 150, 30];
const RED = [249, 65, 68];
const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const REQUIRED_LIMITATION_NOTE = "Ces visualisations sont inspirées de la posturographie. Les indicateurs sont estimés à partir de la webcam et/ou des capteurs ultrasoniques et ne correspondent pas à une mesure médicale certifiée du centre de pression.";
const LIMITATION_NOTE = REQUIRED_LIMITATION_NOTE;

export function downloadSessionReport({ patient, session, t = {} }) {
  const doc = createSessionReportDocument({ patient, session, t });
  doc.save(`BalanceRehab_${patient.patientCode}_${session.id}.pdf`);
}

export function createSessionReportDocument({ patient, session, t = {} }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const generatedAt = new Date().toLocaleDateString(t.localeCode ?? "en-US");
  const results = session.results ?? {};
  const recommendations = results.recommendations ?? [];
  const clinicianName = t.clinicianName ?? "Dr. ERRAMI Noureddine";
  const clinicianRole = t.clinicianRole ?? "Physiotherapist";
  drawClinicalReport(doc, {
    patient,
    session,
    results,
    recommendations,
    generatedAt,
    clinicianName,
    clinicianRole,
    t,
  });

  addHeadersAndFooters(doc, patient, generatedAt, t);
  return doc;
}

function drawClinicalReport(doc, { patient, session, results, recommendations, generatedAt, clinicianName, clinicianRole, t }) {
  const score = Number(session.totalScore ?? results.totalBalanceScore ?? 0);
  const severity = getSeverity(score, t);
  const trace = buildClinicalSwayTrace(results, session);
  const samples = trace.samples;
  const metrics = buildClinicalReportMetrics({ session, results, samples, score });
  const generatedRecommendations = recommendations.length ? recommendations : defaultRecommendations(severity, t);

  drawClinicalSummaryPage(doc, { patient, session, results, generatedAt, clinicianName, t, severity, metrics });
  doc.addPage();
  drawPosturographicAnalysisPage(doc, { patient, session, samples, trace, generatedAt, clinicianName, t });
  doc.addPage();
  drawIndicatorsRecommendationsPage(doc, { patient, session, results, severity, recommendations: generatedRecommendations, metrics, clinicianName, clinicianRole, generatedAt, t });
}

function drawClinicalSummaryPage(doc, { patient, session, results, generatedAt, clinicianName, t, severity, metrics }) {
  drawClinicalHeader(doc, { patient, session, generatedAt, clinicianName, t });
  drawClinicalScoreCards(doc, metrics, severity, 48, t);

  let y = 116;
  y = sectionTitle(doc, t.pdfClinicalSummary ?? "Clinical Summary", y);
  const summaryRows = [
    [t.pdfPatientName ?? "Patient", patient.fullName ?? "-", t.pdfClinician ?? "Clinician", clinicianName],
    [t.acquisitionMode ?? "Acquisition mode", acquisitionModeLabel(t, session), t.test ?? "Test type", testTypeLabel(t, session.testType)],
    [t.visionCondition ?? "Visual condition", conditionLabel(t, session.condition), t.duration ?? "Duration", `${session.durationSeconds ?? "-"} s`],
  ];
  drawTwoColumnInfoGrid(doc, summaryRows, y);

  y += 50;
  y = sectionTitle(doc, t.clinicalInterpretationSection ?? "Interpretation", y);
  const interpretation = session.clinician_impression ?? session.interpretation ?? results.interpretation ??
    (t.pdfDefaultInterpretation ?? "{classification}").replace("{classification}", severity.label);
  drawTextBlock(doc, interpretation, y);
  drawClinicalLimitNoteExact(doc, 246, t);
}

function drawPosturographicAnalysisPage(doc, { patient, session, samples: incomingSamples, trace, generatedAt, clinicianName, t }) {
  drawClinicalHeader(doc, { patient, session, generatedAt, clinicianName, t, compact: true });
  let y = 42;
  y = sectionTitle(doc, t.pdfPosturographicAnalysis ?? "Posturographic Analysis", y);
  const sourceLabel = sourceLabelForTrace(trace, t);
  const sessionResults = session.results ?? {};
  const isDemo = session.acquisitionModeKey === "demo" || (!session.acquisitionModeKey && incomingSamples.length === 0);
  const samples = incomingSamples.length ? incomingSamples : (isDemo ? generateDemoClinicalSamples(sessionResults) : []);
  const isDemoFallback = isDemo && !incomingSamples.length && samples.length > 0;
  const dataStatus = trace.realSamplesUsed
    ? (t.recordedSessionData ?? "Données issues de la session enregistrée")
    : isDemoFallback
      ? "Graphiques de démonstration — aucun échantillon enregistré disponible."
      : trace.fallbackUsed
        ? (t.sourceDemoData ?? "Source: Demo data")
        : (t.noRecordedSamplesAvailable ?? "No recorded samples available for this session.");
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`${sourceLabel} | ${dataStatus}`, MARGIN, y - 3, { maxWidth: CONTENT_W });
  if (trace.fusionMethod) {
    doc.text(t.combinedFusionMethod ?? trace.fusionMethod, MARGIN, y + 2, { maxWidth: CONTENT_W });
  }

  if (!samples.length) {
    drawNoSamplesBox(doc, MARGIN, 58, CONTENT_W, 84, t);
    return;
  }

  drawClinicalFootMap(doc, samples, MARGIN, 58, 85, 72, t, sourceLabel);
  drawClinicalTrajectory(doc, samples, MARGIN + 95, 58, 85, 72, t, sourceLabel);
  drawClinicalStabilogram(doc, samples, MARGIN, 152, 85, 42, "ap", ORANGE, t.apStabilogram ?? "AP stabilogram", sourceLabel);
  drawClinicalStabilogram(doc, samples, MARGIN + 95, 152, 85, 42, "ml", BLUE, t.mlStabilogram ?? "ML stabilogram", sourceLabel);
  drawClinicalStabilogram(doc, samples, MARGIN, 216, 85, 42, "resultant", RED, t.resultantSwayOverTime ?? "Resultant sway", sourceLabel);
  drawClinicalHeatmap(doc, samples, MARGIN + 105, 213, 58, 58, t, sourceLabel);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...MUTED);
  doc.text(`Debug: MediaPipe samples ${trace.mediaPipeSamples} | ESP32 samples ${trace.esp32Samples} | fallback ${trace.fallbackUsed ? "yes" : "no"}`, MARGIN, 279);
}

function drawIndicatorsRecommendationsPage(doc, { patient, session, results, severity, recommendations, metrics, clinicianName, clinicianRole, generatedAt, t }) {
  drawClinicalHeader(doc, { patient, session, generatedAt, clinicianName, t, compact: true });
  let y = 42;
  y = sectionTitle(doc, t.pdfIndicatorsRecommendations ?? "Indicators & Recommendations", y);
  y = drawTable(doc, {
    y,
    columns: [t.metric ?? "Indicator", t.pdfValue ?? "Value", t.pdfReference ?? "Reference", t.status ?? "Status"],
    widths: [66, 40, 42, 32],
    rows: buildDetailedIndicatorRows({ session, results, metrics, severity, t }),
    rowHeight: 8.5,
  });

  y += 10;
  y = sectionTitle(doc, t.recommendations ?? "Recommendations", y);
  recommendations.slice(0, 4).forEach((item, index) => {
    y = drawWrappedLine(doc, `${index + 1}. ${item}`, MARGIN + 4, y, CONTENT_W - 8);
  });

  y = Math.max(y + 4, 202);
  drawClinicalLimitNoteExact(doc, y, t);
  drawClinicalSignatureBlock(doc, { clinicianName, clinicianRole, generatedAt, t }, y + 23);
}

function drawPdfLogo(doc, ox, oy, logoSize) {
  const s = logoSize / 40;

  // Hemisphere pivot (#577590): half-ellipse from (11,27) through (20,34) to (29,27)
  doc.setFillColor(87, 117, 144);
  const hemiSteps = 18;
  const hemi = [];
  for (let i = 0; i <= hemiSteps; i++) {
    const θ = Math.PI * (1 - i / hemiSteps);
    hemi.push([20 + 9 * Math.cos(θ), 27 + 7 * Math.sin(θ)]);
  }
  const hemiSegs = hemi.slice(1).map((pt, i) => [(pt[0] - hemi[i][0]) * s, (pt[1] - hemi[i][1]) * s]);
  doc.lines(hemiSegs, ox + hemi[0][0] * s, oy + hemi[0][1] * s, [1, 1], "F", true);

  // Board platform (#43AA8B): rect(9,21,22×5) corners rotated -17° around (20,23.5)
  doc.setFillColor(67, 170, 139);
  const bc = [[8.75, 24.33], [29.79, 17.89], [31.25, 22.68], [10.21, 29.11]];
  const boardSegs = bc.slice(1).map((pt, i) => [(pt[0] - bc[i][0]) * s, (pt[1] - bc[i][1]) * s]);
  doc.lines(boardSegs, ox + bc[0][0] * s, oy + bc[0][1] * s, [1, 1], "F", true);

  // Motion arc (#43AA8B): quadratic M 5 24 Q 20 7 35 16 → cubic CP1=(15,12.67) CP2=(25,10)
  doc.setDrawColor(67, 170, 139);
  doc.setLineWidth(3 * s);
  doc.setLineCap(1);
  doc.lines([[10 * s, -11.33 * s, 20 * s, -14 * s, 30 * s, -8 * s]], ox + 5 * s, oy + 24 * s, [1, 1], "S", false);

  doc.setLineCap(0);
  doc.setLineWidth(0.2);
}

function drawClinicalHeader(doc, { patient, session, generatedAt, clinicianName, t, compact = false }) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, compact ? 28 : 38, PAGE_W - MARGIN, compact ? 28 : 38);

  // Logo: 13mm for full header, 9mm for compact
  const logoSize = compact ? 9 : 13;
  const logoY = compact ? 5 : 6;
  if (_logoDataUrl) {
    doc.addImage(_logoDataUrl, "PNG", MARGIN, logoY, logoSize, logoSize);
  } else {
    drawPdfLogo(doc, MARGIN, logoY, logoSize);
  }
  const textX = MARGIN + logoSize + 2;

  doc.setTextColor(...PRIMARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 16 : 21);
  doc.text("BalanceRehab", textX, compact ? 17 : 19);
  doc.setTextColor(...TEXT);
  doc.setFontSize(compact ? 10 : 12);
  doc.text(t.pdfReportSubtitle ?? "Clinical Balance Assessment Report", textX, compact ? 24 : 28);

  const rightX = PAGE_W - MARGIN;
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(patient.fullName ?? "-", rightX, compact ? 13 : 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`${patient.patientCode ?? "-"} | ${generatedAt}`, rightX, compact ? 20 : 22, { align: "right" });
  if (!compact) {
    doc.text(`${clinicianName} | ${acquisitionModeLabel(t, session)}`, rightX, 29, { align: "right" });
  }
}

function drawClinicalInfoPill(doc, label, value, x, y, width) {
  doc.setFillColor(...SOFT);
  doc.setDrawColor(...LINE);
  doc.roundedRect(x, y, width, 17, 2.5, 2.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(...MUTED);
  doc.text(String(label).toUpperCase(), x + 3, y + 6);
  doc.setFontSize(8.4);
  doc.setTextColor(...TEXT);
  doc.text(String(valueOrDash(value)), x + 3, y + 12.5, { maxWidth: width - 6 });
}

function drawTwoColumnInfoGrid(doc, rows, y) {
  const rowH = 14;
  const colW = CONTENT_W / 2;
  rows.forEach((row, rowIndex) => {
    const currentY = y + rowIndex * rowH;
    [0, 1].forEach((col) => {
      const x = MARGIN + col * colW;
      const label = row[col * 2];
      const value = row[col * 2 + 1];
      doc.setFillColor(rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 250, rowIndex % 2 === 0 ? 255 : 252);
      doc.setDrawColor(...LINE);
      doc.rect(x, currentY, colW, rowH, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(String(label).toUpperCase(), x + 4, currentY + 5);
      doc.setFontSize(9);
      doc.setTextColor(...TEXT);
      doc.text(String(valueOrDash(value)), x + 4, currentY + 11, { maxWidth: colW - 8 });
    });
  });
}

function drawScoreFocusBlock(doc, { score, severity, metrics, t }, y) {
  doc.setFillColor(...severity.bg);
  doc.setDrawColor(...severity.color);
  doc.roundedRect(MARGIN, y, CONTENT_W, 54, 4, 4, "FD");
  doc.setTextColor(...severity.color);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.text(`${Math.round(score)}/100`, MARGIN + 8, y + 28);
  doc.setFontSize(11);
  doc.text(severity.label, MARGIN + 9, y + 41);

  const items = [
    [t.meanSway ?? "Mean sway", `${valueOrDash(metrics.meanSway)} cm`],
    [t.maxSway ?? "Max sway", `${valueOrDash(metrics.maxSway)} cm`],
    [t.pathLength ?? "Path length", `${valueOrDash(metrics.pathLength)} cm`],
    [t.swayVelocity ?? "Velocity", `${valueOrDash(metrics.swayVelocity)} cm/s`],
  ];
  items.forEach(([label, value], index) => {
    const x = MARGIN + 74 + index * 26;
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text(String(label).toUpperCase(), x, y + 18, { maxWidth: 24 });
    doc.setTextColor(...TEXT);
    doc.setFontSize(10);
    doc.text(String(value), x, y + 31, { maxWidth: 24 });
  });
}

function drawClinicalScoreCards(doc, metrics, severity, y, t) {
  const cards = [
    { label: t.balanceScore ?? "Balance", value: `${Math.round(metrics.totalScore)}/100`, color: severity.color },
    { label: t.postureScoreMetric ?? "Posture", value: `${valueOrDash(metrics.postureScore)}/100`, color: BLUE },
    { label: t.stabilityScore ?? "Stability", value: `${valueOrDash(metrics.stabilityScore)}/100`, color: PRIMARY },
    { label: t.apSway ?? "AP sway (est.)", value: `${valueOrDash(metrics.meanAp)} cm`, color: ORANGE },
    { label: t.mlSway ?? "ML sway (est.)", value: `${valueOrDash(metrics.meanMl)} cm`, color: BLUE },
    { label: t.swayVelocity ?? "Velocity (est.)", value: `${valueOrDash(metrics.swayVelocity)} cm/s`, color: YELLOW },
    { label: t.instabilityEvents ?? "Events (est.)", value: valueOrDash(metrics.instabilityEvents), color: RED },
    { label: t.stabilityClassification ?? "Classification", value: severity.label, color: severity.color },
  ];
  const columns = 4;
  const gap = 4;
  const width = (CONTENT_W - gap * (columns - 1)) / columns;
  cards.forEach((card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = MARGIN + column * (width + gap);
    const cardY = y + row * 29;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...LINE);
    doc.roundedRect(x, cardY, width, 25, 3, 3, "FD");
    doc.setFillColor(...card.color);
    doc.rect(x, cardY, width, 2.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text(String(card.label).toUpperCase(), x + 3, cardY + 9, { maxWidth: width - 6 });
    doc.setFontSize(index === cards.length - 1 ? 9 : 12);
    doc.setTextColor(...TEXT);
    doc.text(String(card.value), x + 3, cardY + 19, { maxWidth: width - 6 });
  });
}

function buildDetailedIndicatorRows({ session, results, metrics, severity, t }) {
  return [
    [t.totalBalanceScore ?? "Global balance score", `${Math.round(metrics.totalScore)}/100`, "> 80", shortSeverityLabel(severity.label)],
    [t.postureStability ?? "Posture score", `${valueOrDash(session.postureScore ?? results.postureStabilityScore)}/100`, "> 75", statusSymbol(session.postureScore ?? results.postureStabilityScore, 75, true, t)],
    [t.apSway ?? "AP mean sway (estimated)", `${valueOrDash(metrics.meanAp)} cm`, "< 4 cm", statusSymbol(metrics.meanAp, 4, false, t)],
    [t.mlSway ?? "ML mean sway (estimated)", `${valueOrDash(metrics.meanMl)} cm`, "< 4 cm", statusSymbol(metrics.meanMl, 4, false, t)],
    [t.meanSway ?? "Mean resultant sway", `${valueOrDash(metrics.meanSway)} cm`, "< 6 cm", statusSymbol(metrics.meanSway, 6, false, t)],
    [t.maxSway ?? "Max resultant sway", `${valueOrDash(metrics.maxSway)} cm`, "< 10 cm", statusSymbol(metrics.maxSway, 10, false, t)],
    [t.rmsSway ?? "RMS sway", `${valueOrDash(metrics.rmsSway)} cm`, "< 6 cm", statusSymbol(metrics.rmsSway, 6, false, t)],
    [t.pathLength ?? "Path length", `${valueOrDash(metrics.pathLength)} cm`, "< 80 cm", statusSymbol(metrics.pathLength, 80, false, t)],
    [t.swayVelocity ?? "Sway velocity", `${valueOrDash(metrics.swayVelocity)} cm/s`, "< 3 cm/s", statusSymbol(metrics.swayVelocity, 3, false, t)],
    [t.swayArea ?? "Sway area", `${valueOrDash(metrics.swayArea)} cm²`, "< 30 cm²", statusSymbol(metrics.swayArea, 30, false, t)],
    [t.instabilityEvents ?? "Instability events", valueOrDash(metrics.instabilityEvents), "0-2", statusSymbol(metrics.instabilityEvents, 2, false, t)],
    [t.sensorQuality ?? "Tracking/sensor quality", `${valueOrDash(metrics.sensorQuality)}%`, "> 75%", statusSymbol(metrics.sensorQuality, 75, true, t)],
  ];
}

function drawClinicalFootMap(doc, samples, x, y, width, height, t, sourceLabel) {
  const cx = x + width / 2;
  const cy = y + height / 2 + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT);
  doc.text(t.balanceFootprintMap ?? "Foot support map", x, y - 3);
  drawGraphSourceLabel(doc, sourceLabel, x + width, y - 3);
  doc.setDrawColor(...LINE);
  doc.roundedRect(x, y, width, height, 2.5, 2.5, "S");
  doc.setDrawColor(226, 232, 240);
  doc.line(cx, y + 6, cx, y + height - 6);
  doc.line(x + 5, cy, x + width - 5, cy);
  doc.setFillColor(248, 250, 252);
  doc.ellipse(cx - 12, cy + 2, 8, 27, "F");
  doc.ellipse(cx + 12, cy + 2, 8, 27, "F");
  doc.setDrawColor(...LINE);
  doc.ellipse(cx - 12, cy + 2, 8, 27, "S");
  doc.ellipse(cx + 12, cy + 2, 8, 27, "S");
  drawClinicalTrace(doc, samples, x + 5, y + 8, width - 10, height - 16, PRIMARY);
  drawStartEndMarkers(doc, samples, x + 5, y + 8, width - 10, height - 16);
}

function drawClinicalTrajectory(doc, samples, x, y, width, height, t, sourceLabel) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT);
  doc.text(t.apMlTrajectory ?? "AP / ML trajectory", x, y - 3);
  drawGraphSourceLabel(doc, sourceLabel, x + width, y - 3);
  doc.setDrawColor(...LINE);
  doc.roundedRect(x, y, width, height, 2.5, 2.5, "S");
  doc.setDrawColor(226, 232, 240);
  for (let i = 1; i < 4; i += 1) {
    doc.line(x + (width / 4) * i, y, x + (width / 4) * i, y + height);
    doc.line(x, y + (height / 4) * i, x + width, y + (height / 4) * i);
  }
  doc.setDrawColor(...MUTED);
  doc.line(x + width / 2, y + 4, x + width / 2, y + height - 4);
  doc.line(x + 4, y + height / 2, x + width - 4, y + height / 2);
  doc.setDrawColor(...GREEN);
  doc.circle(x + width / 2, y + height / 2, Math.min(width, height) * 0.18, "S");
  drawClinicalTrace(doc, samples, x + 4, y + 4, width - 8, height - 8, BLUE);
  drawStartEndMarkers(doc, samples, x + 4, y + 4, width - 8, height - 8);
}

function drawClinicalStabilogram(doc, samples, x, y, width, height, key, color, label, sourceLabel) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(...TEXT);
  doc.text(label, x, y - 3);
  drawGraphSourceLabel(doc, sourceLabel, x + width, y - 3);
  doc.setDrawColor(...LINE);
  doc.roundedRect(x, y, width, height, 2, 2, "S");
  doc.setDrawColor(226, 232, 240);
  doc.line(x, y + height / 2, x + width, y + height / 2);
  const values = samples.map((sample) => Number(sample[key])).filter(Number.isFinite);
  const maxAbs = Math.max(1, ...values.map(Math.abs));
  doc.setDrawColor(...color);
  doc.setLineWidth(0.55);
  samples.forEach((sample, index) => {
    if (index === 0) return;
    const prev = samples[index - 1];
    if (!Number.isFinite(Number(prev[key])) || !Number.isFinite(Number(sample[key]))) return;
    const x1 = x + ((index - 1) / Math.max(1, samples.length - 1)) * width;
    const x2 = x + (index / Math.max(1, samples.length - 1)) * width;
    const y1 = y + height / 2 - (Number(prev[key]) / maxAbs) * (height * 0.4);
    const y2 = y + height / 2 - (Number(sample[key]) / maxAbs) * (height * 0.4);
    doc.line(x1, y1, x2, y2);
  });
  doc.setLineWidth(0.2);
}

function drawClinicalHeatmap(doc, samples, x, y, width, height, t, sourceLabel) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT);
  doc.text(t.swayDensityHeatmap ?? "Sway density heatmap", x, y - 3);
  drawGraphSourceLabel(doc, sourceLabel, x + width, y - 3);
  const size = 8;
  const cells = Array.from({ length: size * size }, () => 0);
  const maxAxis = Math.max(1, ...samples.flatMap((sample) => [Math.abs(sample.ap), Math.abs(sample.ml)]));
  samples.forEach((sample) => {
    const ix = clampInt(Math.floor((((sample.ml / maxAxis) + 1) / 2) * size), 0, size - 1);
    const iy = clampInt(Math.floor((((sample.ap / maxAxis) + 1) / 2) * size), 0, size - 1);
    cells[iy * size + ix] += 1;
  });
  const maxCount = Math.max(1, ...cells);
  const cellW = width / size;
  const cellH = height / size;
  cells.forEach((count, index) => {
    const color = heatColor(count / maxCount);
    doc.setFillColor(...color);
    doc.rect(x + (index % size) * cellW, y + Math.floor(index / size) * cellH, cellW - 0.4, cellH - 0.4, "F");
  });
  doc.setDrawColor(...LINE);
  doc.rect(x, y, width, height, "S");
}

function drawGraphSourceLabel(doc, sourceLabel, rightX, y) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.setTextColor(...MUTED);
  doc.text(sourceLabel, rightX, y, { align: "right", maxWidth: 42 });
}

function drawNoSamplesBox(doc, x, y, width, height, t = {}) {
  doc.setFillColor(255, 247, 247);
  doc.setDrawColor(...RED);
  doc.roundedRect(x, y, width, height, 3, 3, "FD");
  doc.setTextColor(...RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(t.noRecordedSamplesAvailable ?? "No recorded samples available for this session.", x + 8, y + 26, { maxWidth: width - 16 });
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(t.noFakeGraphWarning ?? "Graphs were not generated because this real session does not contain usable recorded AP/ML or posture samples.", x + 8, y + 42, { maxWidth: width - 16 });
}

function drawClinicalTrace(doc, samples, x, y, width, height, color) {
  if (samples.length < 2) return;
  const maxAxis = Math.max(1, ...samples.flatMap((sample) => [Math.abs(sample.ap), Math.abs(sample.ml)]));
  const px = (sample) => x + width / 2 + (sample.ml / maxAxis) * width * 0.42;
  const py = (sample) => y + height / 2 - (sample.ap / maxAxis) * height * 0.42;
  doc.setDrawColor(...color);
  doc.setLineWidth(0.55);
  samples.forEach((sample, index) => {
    if (index === 0) return;
    const prev = samples[index - 1];
    doc.line(px(prev), py(prev), px(sample), py(sample));
  });
  doc.setLineWidth(0.2);
}

function drawStartEndMarkers(doc, samples, x, y, width, height) {
  if (!samples.length) return;
  const maxAxis = Math.max(1, ...samples.flatMap((sample) => [Math.abs(sample.ap), Math.abs(sample.ml)]));
  const point = (sample) => ({
    x: x + width / 2 + (sample.ml / maxAxis) * width * 0.42,
    y: y + height / 2 - (sample.ap / maxAxis) * height * 0.42,
  });
  const start = point(samples[0]);
  const end = point(samples[samples.length - 1]);
  doc.setFillColor(...GREEN);
  doc.circle(start.x, start.y, 1.5, "F");
  doc.setFillColor(...RED);
  doc.circle(end.x, end.y, 1.8, "F");
}

function drawClinicalLimitNote(doc, y, t) {
  const note = t.pdfEstimatedIndicatorLimit ??
    "Les indicateurs présentés sont estimés à partir de la webcam et/ou des capteurs ultrasoniques. Ils ne sont pas équivalents à une mesure médicale du centre de pression par plateforme de force certifiée.";
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(MARGIN, y, CONTENT_W, 17, 2.5, 2.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text(note, MARGIN + 4, y + 7, { maxWidth: CONTENT_W - 8 });
}

function drawClinicalLimitNoteExact(doc, y, t) {
  const note = t.pdfEstimatedIndicatorLimit ?? REQUIRED_LIMITATION_NOTE;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(MARGIN, y, CONTENT_W, 17, 2.5, 2.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text(note, MARGIN + 4, y + 7, { maxWidth: CONTENT_W - 8 });
}

function drawClinicalInterpretation(doc, { session, results, severity, recommendations, metrics, t }, y) {
  y = sectionTitle(doc, t.clinicalInterpretationSection ?? "Clinical Interpretation", y);
  const interpretation = session.clinician_impression ?? session.interpretation ?? results.interpretation ??
    `${severity.label}. Estimated balance indicators should be interpreted together with clinical observation.`;
  y = drawTextBlock(doc, interpretation, y);

  y += 6;
  y = sectionTitle(doc, t.recommendations ?? "Recommendations", y);
  recommendations.slice(0, 6).forEach((item, index) => {
    y = drawWrappedLine(doc, `${index + 1}. ${item}`, MARGIN + 4, y, CONTENT_W - 8);
  });

  y += 4;
  y = sectionTitle(doc, t.assessmentConfiguration ?? "Assessment Configuration", y);
  drawTable(doc, {
    y,
    columns: [t.metric ?? "Metric", t.pdfValue ?? "Value", t.status ?? "Status"],
    widths: [70, 60, 50],
    rows: [
      [t.acquisitionMode ?? "Acquisition mode", acquisitionModeLabel(t, session), severity.label],
      [t.pathLength ?? "Path length", `${valueOrDash(metrics.pathLength)} cm`, metrics.pathLength > 30 ? "Review" : "OK"],
      [t.swayVelocity ?? "Sway velocity", `${valueOrDash(metrics.swayVelocity)} cm/s`, metrics.swayVelocity > 4 ? "Review" : "OK"],
      [t.instabilityEvents ?? "Instability events", valueOrDash(metrics.instabilityEvents), metrics.instabilityEvents > 2 ? "Review" : "OK"],
    ],
  });
}

function drawClinicalSignatureBlock(doc, { clinicianName, clinicianRole, generatedAt, t }, y) {
  y = sectionTitle(doc, t.pdfSignatureBlock ?? "Signature", y);
  doc.setFillColor(...SOFT);
  doc.setDrawColor(...LINE);
  doc.roundedRect(MARGIN, y, CONTENT_W, 28, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  doc.text(clinicianName, MARGIN + 6, y + 9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(clinicianRole, MARGIN + 6, y + 16);
  doc.text(`${t.pdfReportDate ?? "Report date"}: ${generatedAt}`, MARGIN + 6, y + 23);
  doc.setDrawColor(...TEXT);
  doc.line(MARGIN + 104, y + 18, MARGIN + 172, y + 18);
  doc.setFontSize(8);
  doc.text(t.pdfSignature ?? "Signature", MARGIN + 104, y + 24);
}

function buildClinicalReportMetrics({ session, results, samples, score }) {
  const apValues = samples.map((sample) => Math.abs(Number(sample.ap))).filter(Number.isFinite);
  const mlValues = samples.map((sample) => Math.abs(Number(sample.ml))).filter(Number.isFinite);
  const resultantValues = samples.map((sample) => sample.resultant).filter(Number.isFinite);
  const hasSamples = samples.length > 0;
  const pathLengthFromSamples = samples.slice(1).reduce((sum, sample, index) => {
    const prev = samples[index];
    return sum + Math.hypot(sample.ap - prev.ap, sample.ml - prev.ml);
  }, 0);
  const pathLength = hasSamples ? pathLengthFromSamples : results.pathLength;
  const duration = Number(session.durationSeconds ?? results.durationSeconds ?? samples.at(-1)?.t ?? samples.length ?? 1) || 1;
  const rmsFromSamples = resultantValues.length
    ? Math.sqrt(resultantValues.reduce((sum, value) => sum + value * value, 0) / resultantValues.length)
    : null;
  const swayAreaFromSamples = estimateEllipseArea(samples);
  return {
    totalScore: score,
    postureScore: session.postureScore ?? results.postureStabilityScore ?? score,
    stabilityScore: session.boardScore ?? session.postureScore ?? results.boardStabilityScore ?? results.postureStabilityScore ?? score,
    meanAp: round1(hasSamples ? averageNumber(apValues) : results.meanSwayAp),
    meanMl: round1(hasSamples ? averageNumber(mlValues) : results.meanSwayMl),
    meanSway: round1(hasSamples ? averageNumber(resultantValues) : results.meanResultantSway),
    maxSway: round1(hasSamples ? Math.max(0, ...resultantValues) : results.maxResultantSway),
    rmsSway: round1(hasSamples ? rmsFromSamples : results.rmsSway),
    swayArea: round1(hasSamples ? swayAreaFromSamples : results.swayArea),
    pathLength: round1(pathLength),
    swayVelocity: round1(hasSamples ? pathLength / duration : results.swayVelocity),
    instabilityEvents: Number(hasSamples ? countClinicalInstabilityEvents(samples) : (results.instabilityEvents ?? 0)),
    sensorQuality: round1(results.sensorQuality ?? results.trackingQuality?.usablePercent ?? 88),
  };
}

function buildClinicalSwayTrace(results = {}, session = {}) {
  const mode = session.acquisitionModeKey ?? results.acquisitionMode ?? session.acquisitionMode;
  const normalizedMode = String(mode ?? "").toLowerCase();
  const isDemo = normalizedMode === "demo" || String(session.acquisitionMode ?? "").toLowerCase().includes("demo");
  const isCombined = normalizedMode.includes("combined");
  const sensorRaw = Array.isArray(results.sensorSamples) ? results.sensorSamples : [];
  const postureRaw = Array.isArray(results.postureSamples) ? results.postureSamples : [];
  const mergedRaw = Array.isArray(results.samples) ? results.samples : [];
  const mergedBoard = mergedRaw.filter(hasBoardSway);
  const mergedPosture = mergedRaw.filter(hasWebcamPosture);
  const boardSamples = normalizeRecordedClinicalSamples(sensorRaw.length ? sensorRaw : mergedBoard, "esp32");
  const webcamSamples = normalizeRecordedClinicalSamples(postureRaw.length ? postureRaw : mergedPosture, "webcam");
  const fusionMethod = isCombined && boardSamples.length && webcamSamples.length
    ? "ESP32 board AP/ML sway drives the CoP-like trajectory; MediaPipe webcam samples remain separate posture indicators."
    : null;
  const selected =
    boardSamples.length && isCombined && webcamSamples.length
      ? { source: "combined", samples: boardSamples }
      : boardSamples.length && (normalizedMode === "board" || isCombined || results.availableMetrics?.board)
        ? { source: "esp32", samples: boardSamples }
      : webcamSamples.length
        ? { source: "webcam", samples: webcamSamples }
        : boardSamples.length
          ? { source: "esp32", samples: boardSamples }
          : { source: isDemo ? "demo" : "none", samples: [] };
  const samples = selected.samples.length
    ? smoothClinicalSamples(centerClinicalSamples(selected.samples))
    : isDemo
      ? generateDemoClinicalSamples(results)
      : [];

  return {
    samples,
    source: selected.source,
    realSamplesUsed: selected.source !== "demo" && selected.source !== "none" && samples.length > 0,
    fallbackUsed: selected.source === "demo" && samples.length > 0,
    mediaPipeSamples: postureRaw.length || mergedPosture.length,
    esp32Samples: sensorRaw.length || mergedBoard.length,
    webcamSamples,
    boardSamples,
    fusionMethod,
  };
}

function normalizeClinicalSamples(results = {}) {
  return buildClinicalSwayTrace(results, { acquisitionModeKey: results.acquisitionMode }).samples;
}

function normalizeRecordedClinicalSamples(raw, source) {
  return raw.map((sample, index) => {
    const ap = source === "webcam" ? webcamApProxy(sample) : firstNullableNumber(sample.ap, sample.anteriorPosteriorSway, sample.anterior_posterior_sway);
    const ml = source === "webcam" ? webcamMlProxy(sample) : firstNullableNumber(sample.ml, sample.medialLateralSway, sample.medial_lateral_sway);
    if (!Number.isFinite(ap) || !Number.isFinite(ml)) return null;
    return {
      t: firstNumber(sample.t, sample.timestampMs != null ? sample.timestampMs / 1000 : null, index / 3),
      ap: round1(ap),
      ml: round1(ml),
      resultant: round1(firstNumber(sample.resultant, Math.hypot(ap, ml))),
      posture: firstNumber(sample.posture, sample.postureScore, sample.stability, null),
      source,
    };
  }).filter(Boolean);
}

function hasBoardSway(sample = {}) {
  return Number.isFinite(Number(sample.ap ?? sample.anteriorPosteriorSway ?? sample.anterior_posterior_sway))
    && Number.isFinite(Number(sample.ml ?? sample.medialLateralSway ?? sample.medial_lateral_sway));
}

function hasWebcamPosture(sample = {}) {
  return Number.isFinite(Number(sample.bodyCenterX ?? sample.hipCenterX ?? sample.shoulderCenterX))
    && Number.isFinite(Number(sample.bodyCenterY ?? sample.hipCenterY ?? sample.shoulderCenterY));
}

function webcamApProxy(sample = {}) {
  return firstNullableNumber(
    sample.apSwayProxy,
    sample.ap_sway_proxy,
    sample.ap,
    sample.bodyCenterY != null ? (0.5 - Number(sample.bodyCenterY)) * 22 : null,
    sample.hipCenterY != null ? (0.5 - Number(sample.hipCenterY)) * 22 : null,
    sample.shoulderCenterY != null ? (0.5 - Number(sample.shoulderCenterY)) * 18 : null,
    sample.signedBodyCenterDeviation,
    sample.trunkInclination != null ? Number(sample.trunkInclination) * 0.45 : null,
  );
}

function webcamMlProxy(sample = {}) {
  return firstNullableNumber(
    sample.mlSwayProxy,
    sample.ml_sway_proxy,
    sample.ml,
    sample.bodyCenterX != null ? (Number(sample.bodyCenterX) - 0.5) * 22 : null,
    sample.hipCenterX != null ? (Number(sample.hipCenterX) - 0.5) * 22 : null,
    sample.shoulderCenterX != null ? (Number(sample.shoulderCenterX) - 0.5) * 18 : null,
    sample.shoulderAsymmetry != null ? Number(sample.shoulderAsymmetry) * 0.35 : null,
  );
}

function generateDemoClinicalSamples(results = {}) {
  const score = Number(results.totalBalanceScore ?? 76);
  const amplitude = score >= 80 ? 2 : score >= 65 ? 4.8 : 8.2;
  const count = Math.max(90, Number(results.durationSeconds ?? 30) * 3);
  const generated = Array.from({ length: count }, (_, index) => {
    const t = index / 3;
    const drift = score < 65 ? Math.sin(index * 0.045) * 2.2 : Math.sin(index * 0.035) * 0.75;
    const ap = Math.sin(index * 0.22) * amplitude + Math.sin(index * 0.071) * amplitude * 0.48 + drift;
    const ml = Math.cos(index * 0.19) * amplitude * 0.82 + Math.sin(index * 0.053) * amplitude * 0.38 - drift * 0.42;
    return { t, ap: round1(ap), ml: round1(ml), resultant: round1(Math.hypot(ap, ml)) };
  });
  return smoothClinicalSamples(centerClinicalSamples(generated));
}

function sourceLabelForTrace(trace, t = {}) {
  if (trace.source === "combined") return t.sourceCombined ?? "Source: Combined";
  if (trace.source === "esp32") return t.sourceEsp32SerialBoard ?? "Source: ESP32 serial board";
  if (trace.source === "webcam") return t.sourceMediaPipeWebcam ?? "Source: MediaPipe webcam";
  if (trace.source === "demo") return t.sourceDemoData ?? "Source: Demo data";
  return t.sourceNoRecordedSamples ?? "Source: No recorded samples";
}

function defaultRecommendations(severity, t = {}) {
  const label = String(severity.label).toLowerCase();
  if (label.includes("stable")) {
    return [
      t.recoStableIndicators ?? "Continue supervised balance progression with periodic reassessment.",
      t.recoStableProgression ?? "Increase task difficulty gradually while monitoring fatigue and safety.",
    ];
  }
  if (label.includes("moderate")) {
    return [
      t.recoModerateBalance ?? "Prioritize controlled AP/ML weight-shift exercises and static balance holds.",
      t.recoModerateFollowup ?? "Repeat the assessment after a short rehabilitation cycle to monitor response.",
    ];
  }
  return [
    t.recoUnstableSafety ?? "Use close supervision and external support during balance exercises.",
    t.recoUnstableClinical ?? "Consider clinical follow-up before progressing to dynamic balance tasks.",
  ];
}

function countClinicalInstabilityEvents(samples) {
  if (!samples.length) return 0;
  const resultants = samples.map((sample) => Number(sample.resultant)).filter(Number.isFinite);
  const threshold = Math.max(6, percentile(resultants, 0.85));
  let events = 0;
  let inEvent = false;
  samples.forEach((sample) => {
    const unstable = Number(sample.resultant) > threshold;
    if (unstable && !inEvent) events += 1;
    inEvent = unstable;
  });
  return events;
}

function estimateEllipseArea(samples) {
  if (samples.length < 3) return null;
  const apValues = samples.map((sample) => Number(sample.ap)).filter(Number.isFinite);
  const mlValues = samples.map((sample) => Number(sample.ml)).filter(Number.isFinite);
  if (apValues.length < 3 || mlValues.length < 3) return null;
  return Math.PI * standardDeviation(apValues) * standardDeviation(mlValues);
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = averageNumber(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function percentile(values, ratio) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const index = Math.min(clean.length - 1, Math.max(0, Math.floor((clean.length - 1) * ratio)));
  return clean[index];
}

function heatColor(intensity) {
  const value = Math.max(0, Math.min(1, intensity));
  if (value < 0.33) return interpolateColor(BLUE, PRIMARY, value / 0.33);
  if (value < 0.66) return interpolateColor(PRIMARY, YELLOW, (value - 0.33) / 0.33);
  return interpolateColor(YELLOW, RED, (value - 0.66) / 0.34);
}

function interpolateColor(a, b, t) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

function firstNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function firstNullableNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function centerClinicalSamples(samples) {
  if (!samples.length) return samples;
  const baseAp = samples[0].ap;
  const baseMl = samples[0].ml;
  return samples.map((sample) => ({
    ...sample,
    ap: round1(sample.ap - baseAp),
    ml: round1(sample.ml - baseMl),
    resultant: round1(Math.hypot(sample.ap - baseAp, sample.ml - baseMl)),
  }));
}

function smoothClinicalSamples(samples) {
  return samples.map((sample, index) => {
    const window = samples.slice(Math.max(0, index - 2), Math.min(samples.length, index + 3));
    const ap = averageNumber(window.map((item) => item.ap));
    const ml = averageNumber(window.map((item) => item.ml));
    return { ...sample, ap: round1(ap), ml: round1(ml), resultant: round1(Math.hypot(ap, ml)) };
  });
}

function averageNumber(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawCoverPage(doc, { patient, session, generatedAt, clinicianName, severity, t }) {
  doc.setFillColor(...SOFT);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  doc.setTextColor(...PRIMARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text("BalanceRehab", MARGIN, 30);

  doc.setTextColor(...TEXT);
  doc.setFontSize(16);
  doc.text(t.pdfReportSubtitle ?? "Balance Assessment Report", MARGIN, 40);

  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 48, PAGE_W - MARGIN, 48);

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, 60, CONTENT_W, 58, 3, 3, "F");
  doc.setDrawColor(...LINE);
  doc.roundedRect(MARGIN, 60, CONTENT_W, 58, 3, 3, "S");

  const left = [
    [t.pdfPatientName ?? "Patient name", patient.fullName],
    [t.pdfIdCode ?? "ID code", patient.patientCode],
    [t.age ?? "Age", valueOrDash(patient.age)],
    [t.sex ?? "Sex", displaySex(t, patient.sex)],
    [t.pdfHeight ?? "Height", patient.heightCm ? `${patient.heightCm} cm` : "-"],
    [t.pdfWeight ?? "Weight", patient.weightKg ? `${patient.weightKg} kg` : "-"],
  ];
  const right = [
    [t.pdfClinician ?? "Clinician", clinicianName],
    [t.date ?? "Date", session.date ?? generatedAt],
    [t.test ?? "Test type", testTypeLabel(t, session.testType)],
    [t.duration ?? "Duration", `${session.durationSeconds ?? "-"} ${t.seconds ?? "seconds"}`],
    [t.acquisitionMode ?? "Mode", acquisitionModeLabel(t, session)],
  ];

  drawInfoList(doc, left, MARGIN + 8, 72, 76);
  drawInfoList(doc, right, MARGIN + 100, 72, 76);

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(50, 142, 110, 58, 4, 4, "F");
  doc.setDrawColor(...LINE);
  doc.roundedRect(50, 142, 110, 58, 4, 4, "S");

  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(48);
  doc.text(`${session.totalScore ?? resultsValue(session, "totalBalanceScore")}/100`, PAGE_W / 2, 166, { align: "center" });

  doc.setTextColor(...severity.color);
  doc.setFontSize(13);
  doc.text(severity.label, PAGE_W / 2, 184, { align: "center" });

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(template(t.pdfGeneratedFooter ?? "Generated by BalanceRehab | {date} | For clinical support use only", { date: generatedAt }), PAGE_W / 2, 282, { align: "center" });
}

function drawResultsPage(doc, { patient, session, results, t }) {
  doc.addPage();
  let y = 32;
  y = sectionTitle(doc, t.pdfPostureResults ?? "Posture Assessment Results", y);

  const rows = [
    [t.trunkDeviation ?? "Trunk Deviation", `${valueOrDash(results.trunkDeviation)} deg`, "<8 deg", statusSymbol(results.trunkDeviation, 8, false, t)],
    [t.shoulderAsymmetry ?? "Shoulder Asymmetry", `${valueOrDash(results.shoulderAsymmetry)}%`, "<5%", statusSymbol(results.shoulderAsymmetry, 5, false, t)],
    [t.hipAsymmetry ?? "Hip Asymmetry", `${valueOrDash(results.hipAsymmetry)}%`, "<5%", statusSymbol(results.hipAsymmetry, 5, false, t)],
    [t.bodyCenterDeviation ?? "Body Center Deviation", `${valueOrDash(results.bodyCenterDeviation)}%`, "<9%", statusSymbol(results.bodyCenterDeviation, 9, false, t)],
    [t.postureStability ?? "Posture Stability Score", `${valueOrDash(session.postureScore ?? results.postureStabilityScore)}/100`, ">75", statusSymbol(session.postureScore ?? results.postureStabilityScore, 75, true, t)],
  ];
  y = drawTable(doc, {
    y,
    columns: [t.metric ?? "Metric", t.pdfValue ?? "Value", t.pdfReference ?? "Reference", t.status ?? "Status"],
    widths: [72, 38, 38, 32],
    rows,
  });

  y += 12;
  y = sectionTitle(doc, t.pdfFullBodyIndicators ?? "Full-Body Movement Indicators", y);
  y = drawTable(doc, {
    y,
    columns: [t.metric ?? "Metric", t.pdfValue ?? "Value", t.pdfReference ?? "Reference", t.status ?? "Status"],
    widths: [72, 38, 38, 32],
    rows: [
      results.alignmentScore != null && [t.alignmentScore ?? "Alignment Score", `${results.alignmentScore}/100`, ">75", statusSymbol(results.alignmentScore, 75, true, t)],
      results.symmetryScore != null && [t.symmetryScore ?? "Symmetry Score", `${results.symmetryScore}/100`, ">75", statusSymbol(results.symmetryScore, 75, true, t)],
      results.trunkControlScore != null && [t.trunkControl ?? "Trunk Control", `${results.trunkControlScore}/100`, ">75", statusSymbol(results.trunkControlScore, 75, true, t)],
      results.posturalControlScore != null && [t.posturalControl ?? "Postural Control", `${results.posturalControlScore}/100`, ">75", statusSymbol(results.posturalControlScore, 75, true, t)],
      results.pelvicTilt != null && [t.pelvicTilt ?? "Pelvic Tilt", `${results.pelvicTilt} deg`, "<5 deg", statusSymbol(results.pelvicTilt, 5, false, t)],
      results.headTilt != null && [t.headTilt ?? "Head Tilt", `${results.headTilt} deg`, "<8 deg", statusSymbol(results.headTilt, 8, false, t)],
      results.armSymmetry != null && [t.armSymmetry ?? "Arm Symmetry", `${results.armSymmetry}%`, "<12%", statusSymbol(results.armSymmetry, 12, false, t)],
    ].filter(Boolean),
  });

  y += 12;
  y = sectionTitle(doc, t.pdfTrackingCoverage ?? "Tracking Coverage", y);
  y = drawTable(doc, {
    y,
    columns: [t.trackingSource ?? "Tracking source", t.pdfDetectedFrames ?? "Detected frames", t.status ?? "Status"],
    widths: [72, 54, 54],
    rows: trackingCoverageRows(results.engineCoverage, t),
  });

  if (y > 205) {
    doc.addPage();
    y = 32;
  }

  if (results.availableMetrics?.board) {
    y += 12;
    y = sectionTitle(doc, t.swayMetrics ?? "Sway Metrics", y);
    y = drawTable(doc, {
      y,
      columns: [t.pdfApSwayMean ?? "AP Mean", t.pdfMlSwayMean ?? "ML Mean", t.pathLength ?? "Path length", t.rmsSway ?? "RMS", t.swayVelocity ?? "Velocity"],
      widths: [36, 36, 36, 36, 36],
      rows: [[
        `${valueOrDash(results.meanSwayAp)} cm`,
        `${valueOrDash(results.meanSwayMl)} cm`,
        `${valueOrDash(results.pathLength)} cm`,
        `${valueOrDash(results.rmsSway)} cm`,
        `${valueOrDash(results.swayVelocity)} cm/s`,
      ]],
    });
    y += 8;
    y = drawUltrasonicDisclaimer(doc, y);
  } else {
    y += 12;
    doc.setFillColor(255, 247, 237);
    doc.roundedRect(MARGIN, y, CONTENT_W, 22, 3, 3, "F");
    doc.setTextColor(...ORANGE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(t.pdfBoardUnavailable ?? "Board sway metrics are not available in webcam-only mode.", MARGIN + 5, y + 13);
    y += 26;
  }

  drawScoreBand(doc, patient, session, Math.min(Math.max(y + 8, 212), 238), t);
}

function drawInterpretationPage(doc, { session, results, recommendations, t }) {
  doc.addPage();
  let y = 32;
  y = sectionTitle(doc, t.clinicalImpression ?? "Clinical Impression", y);
  y = drawTextBlock(doc, session.clinician_impression ?? session.interpretation ?? results.interpretation ?? "-", y);

  y += 8;
  y = sectionTitle(doc, t.recommendations ?? "Rehabilitation Recommendations", y);
  recommendations.forEach((item, index) => {
    y = drawWrappedLine(doc, `${index + 1}. ${item}`, MARGIN + 4, y, CONTENT_W - 8);
  });

  y += 8;
  y = sectionTitle(doc, t.testConditions ?? "Assessment Conditions", y);
  drawTable(doc, {
    y,
    columns: [t.conditions ?? "Condition", t.pdfValue ?? "Value"],
    widths: [60, 120],
    rows: [
      [t.test ?? "Test type", testTypeLabel(t, session.testType)],
      [t.visionCondition ?? "Visual condition", conditionLabel(t, session.condition)],
      [t.duration ?? "Duration", `${session.durationSeconds ?? "-"} ${t.seconds ?? "seconds"}`],
      [t.acquisitionMode ?? "Acquisition mode", acquisitionModeLabel(t, session)],
      [t.supportRing ?? "Support ring", session.supportRing ?? "-"],
    ],
  });
}

function drawTrendAppendixPage(doc, { results, t }) {
  doc.addPage();
  let y = 32;
  y = sectionTitle(doc, results.availableMetrics?.board ? (t.pdfPosturographySummary ?? "Estimated Board Sway Graphs") : (t.pdfTrendSummary ?? "Assessment Trend Summary"), y);

  const samples = results.sensorSamples?.length ? results.sensorSamples : results.samples ?? [];
  if (!samples.length) {
    drawTextBlock(doc, t.pdfNoSamples ?? "Time-series posture samples were not recorded for this session.", y);
    return;
  }

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(results.availableMetrics?.board ? (t.pdfBoardSamplesCaptured ?? "ESP32 ultrasonic board samples captured during the assessment.") : (t.pdfSamplesCaptured ?? "Posture stability samples captured during the assessment."), MARGIN, y);
  y += 12;

  if (results.availableMetrics?.board) {
    y = drawUltrasonicDisclaimer(doc, y);
    drawSwayScatter(doc, samples, MARGIN, y + 2, CONTENT_W, 62, t);
    drawSwayStabilogram(doc, samples, MARGIN, y + 82, 86, 48, "ap", ORANGE, t.apStabilogram ?? "AP stabilogram");
    drawSwayStabilogram(doc, samples, MARGIN + 94, y + 82, 86, 48, "ml", [39, 125, 161], t.mlStabilogram ?? "ML stabilogram");
    drawSwayStabilogram(doc, samples.map((sample) => ({ ...sample, resultant: resultant(sample.ap, sample.ml) })), MARGIN, y + 150, CONTENT_W, 48, "resultant", RED, t.resultantSwayOverTime ?? "Resultant sway over time");
    drawSwayDensity(doc, samples, MARGIN + 126, y + 2, 54, 54, t);
  } else {
    drawMiniLineChart(doc, samples, {
      x: MARGIN,
      y,
      width: CONTENT_W,
      height: 72,
      key: "posture",
      min: 0,
      max: 100,
      color: PRIMARY,
      label: t.pdfPostureOverTime ?? "Posture Stability Over Time",
    });
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...LINE);
    doc.roundedRect(MARGIN, y + 94, CONTENT_W, 34, 3, 3, "FD");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(t.swayPathAvailableBoard ?? "Sway path available with ESP32 balance board.", MARGIN + 5, y + 114);
  }
}

function drawUltrasonicDisclaimer(doc, y) {
  const text = "Indicateurs estimés à partir de capteurs ultrasoniques, non équivalents à une plateforme de force médicale.";
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(MARGIN, y, CONTENT_W, 16, 3, 3, "FD");
  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(text, MARGIN + 4, y + 10, { maxWidth: CONTENT_W - 8 });
  return y + 22;
}

function drawSignaturePage(doc, { generatedAt, clinicianName, clinicianRole, t }) {
  doc.addPage();
  let y = 34;
  y = sectionTitle(doc, t.pdfDisclaimerSignature ?? "Disclaimer & Signature", y);

  doc.setFillColor(...SOFT);
  doc.roundedRect(MARGIN, y, CONTENT_W, 48, 3, 3, "F");
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(clinicianName, MARGIN + 6, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(clinicianRole, MARGIN + 6, y + 22);
  doc.text(`${t.pdfReportDate ?? "Report date"}: ${generatedAt}`, MARGIN + 6, y + 32);
  y += 70;

  doc.setDrawColor(...TEXT);
  doc.line(MARGIN, y, MARGIN + 80, y);
  doc.line(MARGIN + 110, y, PAGE_W - MARGIN, y);
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text(t.pdfSignature ?? "Signature", MARGIN, y + 7);
  doc.text(t.date ?? "Date", MARGIN + 110, y + 7);

  y += 28;
  y = sectionTitle(doc, t.pdfClinicalSupportNotice ?? "Clinical Support Notice", y);
  drawTextBlock(
    doc,
    t.pdfLegalNotice ?? "This report is generated as a clinical support tool and does not replace professional medical judgment or certified diagnosis.",
    y,
  );
}

function addHeadersAndFooters(doc, patient, generatedAt, t) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, 278, PAGE_W - MARGIN, 278);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(template(t.pdfGeneratedFooter ?? "Generated by BalanceRehab | {date} | For clinical support use only", { date: generatedAt }), MARGIN, 285);
    doc.text(template(t.pdfPageCount ?? "Page {page} of {pages}", { page, pages }), PAGE_W - MARGIN, 285, { align: "right" });
  }
}

function sectionTitle(doc, title, y) {
  doc.setFillColor(...PRIMARY);
  doc.rect(MARGIN, y - 7, 4, 9, "F");
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, MARGIN + 7, y);
  return y + 12;
}

function drawInfoList(doc, rows, x, y, width) {
  rows.forEach(([label, value], index) => {
    const lineY = y + index * 7;
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${label}:`, x, lineY);
    doc.setTextColor(...TEXT);
    doc.setFont("helvetica", "bold");
    doc.text(String(valueOrDash(value)), x + 32, lineY, { maxWidth: width - 32 });
  });
}

function drawTable(doc, { y, columns, widths, rows, rowHeight = 10 }) {
  const rowH = rowHeight;
  let currentY = y;
  let x = MARGIN;

  doc.setFillColor(226, 232, 240);
  doc.rect(MARGIN, currentY, CONTENT_W, rowH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT);
  columns.forEach((column, index) => {
    doc.text(column, x + 3, currentY + 6.5, { maxWidth: widths[index] - 5 });
    x += widths[index];
  });
  currentY += rowH;

  rows.forEach((row, rowIndex) => {
    x = MARGIN;
    doc.setFillColor(rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 250, rowIndex % 2 === 0 ? 255 : 252);
    doc.rect(MARGIN, currentY, CONTENT_W, rowH, "F");
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, currentY + rowH, PAGE_W - MARGIN, currentY + rowH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    row.forEach((cell, index) => {
      const isOk = cell === "OK";
      const isStatusCell = index === row.length - 1 && (isOk || cell === "Review" || cell === "A revoir");
      if (isStatusCell) doc.setTextColor(isOk ? GREEN[0] : ORANGE[0], isOk ? GREEN[1] : ORANGE[1], isOk ? GREEN[2] : ORANGE[2]);
      doc.text(String(valueOrDash(cell)), x + 3, currentY + 6.5, { maxWidth: widths[index] - 5 });
      if (isStatusCell) doc.setTextColor(...TEXT);
      x += widths[index];
    });
    currentY += rowH;
  });

  doc.setDrawColor(...LINE);
  doc.rect(MARGIN, y, CONTENT_W, rowH * (rows.length + 1), "S");
  return currentY;
}

function drawTextBlock(doc, text, y) {
  doc.setFillColor(...SOFT);
  doc.roundedRect(MARGIN, y, CONTENT_W, 46, 3, 3, "F");
  return drawWrappedLine(doc, text, MARGIN + 5, y + 10, CONTENT_W - 10) + 8;
}

function drawWrappedLine(doc, text, x, y, maxWidth) {
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT);
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(String(text ?? "-"), maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * 5.5 + 2;
}

function drawScoreBand(doc, patient, session, y, t) {
  const severity = getSeverity(session.totalScore, t);
  doc.setFillColor(...severity.bg);
  doc.roundedRect(MARGIN, y, CONTENT_W, 34, 3, 3, "F");
  doc.setTextColor(...severity.color);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`${session.totalScore}/100`, MARGIN + 8, y + 19);
  doc.setFontSize(11);
  doc.text(severity.label, MARGIN + 46, y + 18);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${patient.fullName} | ${testTypeLabel(t, session.testType)} | ${conditionLabel(t, session.condition)}`, MARGIN + 46, y + 27);
}

function drawMiniLineChart(doc, samples, { x, y, width, height, key, min, max, color, label }) {
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(label, x, y - 4);
  doc.setDrawColor(...LINE);
  doc.rect(x, y, width, height, "S");
  doc.setDrawColor(226, 232, 240);
  for (let i = 1; i < 4; i += 1) doc.line(x, y + (height / 4) * i, x + width, y + (height / 4) * i);

  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  samples.forEach((sample, index) => {
    if (index === 0) return;
    const prev = samples[index - 1];
    const x1 = x + ((index - 1) / (samples.length - 1)) * width;
    const x2 = x + (index / (samples.length - 1)) * width;
    const y1 = y + height - ((Number(prev[key]) - min) / (max - min)) * height;
    const y2 = y + height - ((Number(sample[key]) - min) / (max - min)) * height;
    doc.line(x1, y1, x2, y2);
  });
  doc.setLineWidth(0.2);
}

function drawSwayScatter(doc, samples, x, y, width, height, t) {
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(t.estimatedMovementPath ?? "Estimated board sway trace", x, y - 4);
  doc.setDrawColor(...LINE);
  doc.rect(x, y, width, height, "S");
  doc.setDrawColor(...ORANGE);
  doc.line(x + width / 2, y, x + width / 2, y + height);
  doc.line(x, y + height / 2, x + width, y + height / 2);
  doc.setFillColor(...PRIMARY);
  samples
    .filter((sample) => sample.ap != null && sample.ml != null)
    .forEach((sample) => {
      const scale = swayScale(samples, Math.min(width, height) * 0.42);
      const px = x + width / 2 + Number(sample.ml) * scale;
      const py = y + height / 2 - Number(sample.ap) * scale;
      doc.circle(Math.max(x + 2, Math.min(x + width - 2, px)), Math.max(y + 2, Math.min(y + height - 2, py)), 0.8, "F");
    });
}

function drawSwayStabilogram(doc, samples, x, y, width, height, key, color, label) {
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(label, x, y - 3);
  doc.setDrawColor(...LINE);
  doc.rect(x, y, width, height, "S");
  const values = samples.map((sample) => Number(sample[key])).filter(Number.isFinite);
  const maxAbs = Math.max(1, ...values.map(Math.abs));
  doc.setDrawColor(226, 232, 240);
  doc.line(x, y + height / 2, x + width, y + height / 2);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.45);
  samples.forEach((sample, index) => {
    if (index === 0) return;
    const prev = samples[index - 1];
    if (!Number.isFinite(Number(prev[key])) || !Number.isFinite(Number(sample[key]))) return;
    const x1 = x + ((index - 1) / Math.max(1, samples.length - 1)) * width;
    const x2 = x + (index / Math.max(1, samples.length - 1)) * width;
    const y1 = y + height / 2 - (Number(prev[key]) / maxAbs) * (height * 0.42);
    const y2 = y + height / 2 - (Number(sample[key]) / maxAbs) * (height * 0.42);
    doc.line(x1, y1, x2, y2);
  });
  doc.setLineWidth(0.2);
}

function drawSwayDensity(doc, samples, x, y, width, height, t) {
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(t.swayDensityMap ?? "Density map", x, y - 4);
  const size = 7;
  const cellW = width / size;
  const cellH = height / size;
  const cells = Array.from({ length: size * size }, () => 0);
  const maxAxis = Math.max(1, ...samples.flatMap((sample) => [Math.abs(Number(sample.ap) || 0), Math.abs(Number(sample.ml) || 0)]));
  samples.forEach((sample) => {
    const cx = Math.max(0, Math.min(size - 1, Math.floor((((Number(sample.ml) || 0) / maxAxis + 1) / 2) * size)));
    const cy = Math.max(0, Math.min(size - 1, Math.floor((((Number(sample.ap) || 0) / maxAxis + 1) / 2) * size)));
    cells[cy * size + cx] += 1;
  });
  const maxCount = Math.max(1, ...cells);
  cells.forEach((count, index) => {
    const intensity = count / maxCount;
    doc.setFillColor(232 - intensity * 160, 248 - intensity * 78, 240 - intensity * 101);
    doc.rect(x + (index % size) * cellW, y + Math.floor(index / size) * cellH, cellW - 0.5, cellH - 0.5, "F");
  });
  doc.setDrawColor(...LINE);
  doc.rect(x, y, width, height, "S");
}

function swayScale(samples, radius) {
  const maxAxis = Math.max(1, ...samples.flatMap((sample) => [Math.abs(Number(sample.ap) || 0), Math.abs(Number(sample.ml) || 0)]));
  return radius / maxAxis;
}

function resultant(ap, ml) {
  const a = Number(ap);
  const m = Number(ml);
  return Number.isFinite(a) && Number.isFinite(m) ? Math.hypot(a, m) : null;
}

function getSeverity(score = 0, t = {}) {
  if (score >= 80) return { label: (t.stableResult ?? "Stable").toUpperCase(), color: GREEN, bg: [240, 253, 244] };
  if (score >= 65) return { label: (t.moderateInstability ?? "Moderate instability").toUpperCase(), color: YELLOW, bg: [255, 251, 235] };
  return { label: (t.highInstability ?? "High instability").toUpperCase(), color: RED, bg: [254, 242, 242] };
}

function shortSeverityLabel(label = "") {
  const normalized = String(label).toLowerCase();
  if (normalized.includes("moderate")) return "Moderate";
  if (normalized.includes("stable") && !normalized.includes("unstable")) return "Stable";
  return "Unstable";
}

function statusSymbol(value, threshold, higherIsBetter, t = {}) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return t.pdfReview ?? "Review";
  return higherIsBetter
    ? (numeric > threshold ? (t.pdfOk ?? "OK") : (t.pdfReview ?? "Review"))
    : (numeric < threshold ? (t.pdfOk ?? "OK") : (t.pdfReview ?? "Review"));
}

function trackingCoverageRows(engineCoverage = {}, t = {}) {
  return [
    trackingCoverageRow(t.poseTracking ?? "Pose tracking", engineCoverage.pose, t),
    trackingCoverageRow(t.faceTracking ?? "Face tracking", engineCoverage.face, t),
    trackingCoverageRow(t.handTracking ?? "Hand tracking", engineCoverage.hands, t),
  ];
}

function trackingCoverageRow(label, coverage = {}, t = {}) {
  if (!coverage?.available) {
    return [label, "-", t.notAvailable ?? "Not available"];
  }
  const percent = Number(coverage.detectedPercent) || 0;
  const status = percent >= 75 ? (t.pdfOk ?? "OK") : percent >= 35 ? (t.pdfReview ?? "Review") : (t.attention ?? "Attention");
  return [label, `${percent}%`, status];
}

function displaySex(t, sex) {
  if (sex === "F" || sex === "Female") return t.female ?? "Female";
  if (sex === "M" || sex === "Male") return t.male ?? "Male";
  return sex ?? "-";
}

function resultsValue(session, key) {
  return session.results?.[key] ?? "-";
}

function valueOrDash(value) {
  return value == null || value === "" ? "-" : value;
}

function testTypeLabel(t, testType) {
  const normalized = String(testType ?? "").toLowerCase();
  if (normalized === "static") return t.staticTest ?? "Static test";
  if (normalized === "dynamic") return t.dynamicTest ?? "Dynamic test";
  return testType ?? "-";
}

function conditionLabel(t, condition) {
  const normalized = String(condition ?? "").toLowerCase().replace("_", " ");
  if (normalized === "eyes open") return t.eyesOpen ?? "Eyes open";
  if (normalized === "eyes closed") return t.eyesClosed ?? "Eyes closed";
  return condition ?? "-";
}

function acquisitionModeLabel(t, session) {
  const normalized = String(session.acquisitionModeKey ?? session.acquisitionMode ?? "").toLowerCase();
  if (normalized.includes("webcam")) return t.webcamBasedAssessment ?? "Webcam-Based Assessment";
  if (normalized.includes("demo")) return t.demoAssessmentMode ?? "Demo Mode";
  if (normalized.includes("combined")) return t.combinedAssessmentMode ?? "Webcam + ESP32";
  if (normalized.includes("board")) return t.boardAssessmentMode ?? "ESP32 Only";
  return session.acquisitionMode ?? "-";
}

function template(text = "", values = {}) {
  return Object.entries(values).reduce((current, [key, value]) => current.replaceAll(`{${key}}`, value ?? ""), text);
}
