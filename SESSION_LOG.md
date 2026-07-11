# SESSION LOG — Autonomous work session (2026-07-11)

Rollback point: tag `pre-session-2026-07-11` (= cca06c6), pushed to origin.

## Needs my review (running list)

- **Phase numbering in the instructions was ambiguous** (two "PHASE 2"s: fix-findings vs creative redesign; two "PHASE 4"s: final pass vs ML pipeline). Interpretation used: Phase 1 audit → Phase 2 fixes + page redesigns (with `pre-redesign-<page>` tags) → Phase 3 games → Phase 4 ML (with `pre-ml-work` tag) → final pass. All content from both variants is covered.
- (further entries added as work proceeds)

---

## PHASE 1 — UI/UX AUDIT (report only, no changes)

Audited live at 1440×900, light color scheme, FR (default) and EN modes, on commit cca06c6.
Method: rendered DOM + accessibility tree + computed styles + live interaction
(screenshot capture hangs in this environment; purely aesthetic judgments inferred from
styling code are marked as such). A demo-mode assessment was run end-to-end and NOT saved.

### Verification baseline at audit time
- Frontend boots clean on 127.0.0.1:5173 (Vite, strictPort) ✅
- Backend boots clean on 127.0.0.1:8010 (venv Python 3.13, FastAPI) ✅
- Backend tests: 20/20 pass ✅
- Browser console: no errors on Dashboard/Patients/Assessment/Rehab/Settings/About ✅

### 🔴 Blockers

1. **App-wide crash opening any patient's results.** `ReferenceError: ReferenceLine is not
   defined` in `PatientDetail` — `ReferenceLine` used at Patients.jsx:563-564 but missing
   from the recharts import (lines 8-23). Triggers from (a) every patient card on the
   Patients page, (b) all 8 "Résultats" buttons on the Dashboard. No error boundary →
   entire React tree unmounts → white screen until manual reload.
2. **Progress Analytics page unreachable.** `ProgressAnalytics.jsx` exists, App.jsx has a
   render branch, but `"progressAnalytics"` is absent from the `pages` array (App.jsx:18).
   No sidebar entry, no route ever reaches it.

### 🟠 Misleading clinical logic

3. Demo-mode recording screen fabricates hardware status: "Caméra prete", "Corps entier
   visible", "Pieds visibles", "État ESP32 — Calibration terminée" with no camera and no
   ESP32 in use.
4. Bilan charts all labeled "SOURCE : PLATEAU SÉRIE ESP32" after a demo (no ESP32) run.
5. Raw debug counters render on the Bilan: "Mode d'acquisition: Mode demo · MediaPipe: 0 ·
   ESP32: 10 · Fallback: no".
6. Auto-interpretation sentence grammatically broken (label stuffed into template):
   "…suggèrent **une stable** pendant la condition statique controlee."
7. Contradictory observations on the same 83/100 "Stable" bilan ("stability within expected
   range" + "trunk control requires focused intervention"), and the observations are in
   English under French headings; "RECOMMENDATION" label untranslated.
8. Patients page: BR-1101 badged "Aucune session" yet shows 88/100, +27.4 pts and
   "3 sessions – 82.9/100"; the Assessment page shows her with no score at all. Status and
   score displays use different definitions of "has sessions".
9. KPI mismatch: Dashboard average 72.3 vs Patients page 70/100 for the same 50 patients.
10. Stale demo data: sessions end Jun 26 → "Évaluations cette semaine: 0 · 0 séances
    aujourd'hui" on the flagship KPI; several 95–100/100 static scores for elderly
    patients look implausible (a 100/100 reads as fake).
11. Settings renders raw Python exceptions verbatim ("Could not open COM99: …
    FileNotFoundError(2, …)") plus "Dernier paquet: error {}" debug dump; error state is
    sticky — survives /esp32/disconnect, only clears on backend restart.
12. Safety checklist ("Supervision thérapeutique confirmée") defaults to pre-checked,
    defeating its purpose as a deliberate confirmation.

### 🟡 Language mixing (FR mode; EN mode is clean)

- Dashboard: EN status legend/badges (Declining/Follow-up/Stable/Improving/No sessions),
  EN pathology axis labels, EN test/condition columns ("Static", "eyes open"), lowercase EN
  game names ("balance freeze weight shift"), EN dates ("Jun 26").
- Patients: statuses/pathologies properly FR (inconsistent with Dashboard); dates EN.
- Assessment: "Draft"/"Completed" state chips; EN pathologies + clinical goals ("Improve
  dynamic balance"); "Cote dominant: Right"; "100% of expected range" gauges; EN
  observations + "RECOMMENDATION" on Bilan.
- Rehab: "SELECT PATIENT / Choose the patient for this rehabilitation session." heading;
  hardcoded EN in-game instructions ("Pop the target with either hand", "Avoid red
  obstacles", "Clear path").
- Settings: status value "Verification" (also missing accent).
- About: cleanest page; only "Ultrasonic Sensors"/"Balance Board" chips.
- Root cause pattern: demo-data strings and enum values stored in EN and rendered raw.

### 🟡 Typography & wording

- ~30+ missing French accents, systematic in uppercase labels: Etape, Selection,
  SELECTIONNE, DERNIERE, STABILITE, RESUME, EVENEMENTS D'INSTABILITE, Mode demo, installe,
  securise, retire, fermes, prete, simule, Preparation, USB serie, Entrainer, precedente,
  enregistrees, Deviation, epaules…
- Font stack `Aptos, "Segoe UI", sans-serif` = Windows-only; degrades to generic
  sans-serif elsewhere.
- "1 sessions" pluralization; "Anas El Idrissi/ BR-1083" missing space; "deg" instead of
  "°"; unexplained "R1…R12" axis labels; "10 secondes demo" dev label in dropdown.

### 🟡 Layout & information architecture

- Assessment config: "Démarrer évaluation" CTA ~1,700px below fold, after an inline list
  of ALL 50 patients (~5,400px tall) duplicated inside the wizard; header stepper says
  "Étape 1 sur 3 – Configuration" while page sections are titled "Etape 1/2/3" — two
  competing step systems.
- Two selectable acquisition cards self-described as "Mode futur" (Webcam+ESP32, ESP32
  uniquement) presented as equal options.
- Settings: "Wi-Fi plus tard" visible option; sensor tiles FL/FR/RL/RR "unknown" while
  the ESP32 doc uses front/rear/left/right and About page uses S1–S4 (three naming
  schemes).
- Icon-only buttons without accessible names throughout (header profile/language cluster,
  alert cards, card actions).
- Settings "IA mouvement" section openly unfinished (Non entraîné / 0 / 0 / – précision).
- No horizontal overflow at 1440×900 ✅; single font family in use ✅.

### 🟡 Dark UI (vs light-mode requirement)

- All 4 game screens `bg-slate-950` (defensible over webcam video) and — less defensibly —
  the post-game review GameReview.jsx is fully dark. Clinical severity palette
  (#90BE6D / #F8961E / #F94144) already exists in charts; badges don't consistently use it.

### Genuinely good (keep)

About page; exercise library step (translated, clear difficulty/duration/program);
Bilan chart set (CoP map, AP/ML stabilograms, heatmap — Framiral-like); rehab wizard
structure; honest non-certified-measurement disclaimers; EN translation quality.

### Fix priority for Phase 2

P0 crash fix + error boundary + Progress Analytics reachability
P1 trust: fabricated statuses, wrong source labels, debug leaks, raw exceptions,
   interpretation grammar, "Aucune session" logic, KPI mismatch, checkbox default
P2 language: value-level FR maps (statuses/pathologies/goals/tests/dates), accent sweep,
   rehab page + in-game strings
P3 polish: fresh demo data, assessment page layout/stepper redesign, future-mode gating,
   light GameReview, aria-labels, small copy bugs
