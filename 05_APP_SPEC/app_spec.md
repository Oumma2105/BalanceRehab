\# BalanceRehab App Specification



\## 1. Project Identity



\### English Title

Low-cost computerized posturography platform using ultrasonic sensing and AI-based posture analysis for balance rehabilitation follow-up.



\### French Title

Plateforme low-cost de posturographie informatisée basée sur des capteurs ultrasoniques et l’analyse posturale par IA pour le suivi de la rééducation de l’équilibre.





\## 2. Project Context



This is a biomedical engineering PFA project.



The initial plan was to use force plates. Since force plates are unavailable, the project pivoted to a low-cost alternative using:



\- ESP32

\- 4 ultrasonic sensors

\- Decathlon balance board

\- removable support ring

\- laptop webcam

\- computer/laptop for AI and app processing



The system is inspired by professional rehabilitation platforms such as D-WALL, but it is a low-cost educational prototype.



The goal is not to replace certified medical posturography systems. The system estimates functional balance indicators using board-motion estimation and AI posture tracking.





\## 3. Scientific Positioning



The system must not claim to measure real Center of Pressure like a force plate.



The system must not provide medical diagnosis.



Use safe wording:



\- estimated balance indicators

\- functional balance assessment

\- rehabilitation support

\- educational prototype

\- AI-assisted interpretation

\- not a certified medical device



Required disclaimer:



> This prototype is designed for educational and rehabilitation-support purposes only. It does not replace certified medical diagnosis or clinical decision-making.





\## 4. Test Definitions



\### Static Balance Test



The Decathlon balance board is used with the removable support ring installed.



The support ring limits board movement and makes the test safer and more controlled.



\### Dynamic Balance Test



The support ring is removed.



The board becomes more unstable and allows larger oscillations.



Important:

Do not confuse the support ring with a fixed support. The support ring is a removable mechanical limiter that reduces instability.



\---



\## 5. Required Technology Stack



\### Frontend



\- React

\- Tailwind CSS

\- Clean medical dashboard UI

\- Sidebar navigation

\- Light interface only

\- English/French language toggle



\### Backend



\- FastAPI



\### Database



\- SQLite for MVP



\### AI / Computer Vision



\- Python

\- OpenCV

\- MediaPipe Pose



\### Hardware



\- ESP32

\- 4 ultrasonic sensors

\- USB serial communication first

\- Wi-Fi only as future improvement



\### PDF Reports



Use one practical Python PDF solution:



\- ReportLab

\- WeasyPrint

\- FPDF



Choose the most reliable and fastest option.



\---



\## 6. Bilingual Requirement



The app must support:



\- English by default

\- French as optional language



Add an EN/FR toggle in the UI.



All interface labels, buttons, report sections, and interpretation text should be structured so they can be translated.



Examples:



| English | French |

|---|---|

| Dashboard | Tableau de bord |

| Patients | Patients |

| New Test | Nouveau test |

| Live Assessment | Évaluation en direct |

| Results | Résultats |

| Reports | Rapports |

| Progress | Progression |

| Stability Score | Score de stabilité |

| Postural Analysis | Analyse posturale |

| Rehabilitation Recommendations | Recommandations de rééducation |



\---



\## 7. Design Direction



The app should feel like a professional rehabilitation platform, not a basic Arduino dashboard.



\### Avoid



\- black background

\- dark cyber UI

\- crowded pages

\- raw sensor values as the main focus

\- messy dashboards

\- too many colors

\- amateur Streamlit-like style



\### Use



\- white or very light gray background

\- clean cards

\- soft blue/teal medical accent

\- rounded corners

\- clear spacing

\- sidebar navigation

\- professional patient-management feel

\- modern but calm visual style



Suggested colors:



```text

Background: #F8FAFC

Cards: #FFFFFF

Primary: #0EA5A4

Secondary: #3B82F6

Success: #22C55E

Warning: #F59E0B

Danger: #EF4444

Text: #0F172A

Muted text: #64748B

Borders: #E2E8F0

````



\---



\## 8. Core Workflow



Doctor/Therapist opens app

→ selects language

→ opens dashboard

→ adds or selects patient

→ starts new balance test

→ chooses static or dynamic mode

→ records test

→ sees live skeleton and stability indicators

→ stops test

→ gets results

→ generates PDF report

→ tracks patient progress over time



\---



\## 9. Main Pages



\### 9.1 Dashboard



Show:



\* total patients

\* total sessions

\* recent sessions

\* average stability score

\* quick button: New Patient

\* quick button: New Test

\* system status:



&#x20; \* Webcam: connected / demo mode

&#x20; \* ESP32: connected / demo mode

&#x20; \* Database: active



\---



\### 9.2 Patients



Features:



\* patient list

\* search patient

\* add patient

\* edit patient

\* open patient profile



Patient fields:



\* patient ID

\* full name

\* age or date of birth

\* sex

\* height

\* weight

\* pathology / condition

\* clinical notes

\* created date



\---



\### 9.3 Patient Profile



Show:



\* patient information

\* previous sessions

\* latest score

\* progress graph

\* latest report

\* button: Start New Test



\---



\### 9.4 New Test



Fields:



\* selected patient

\* test type:



&#x20; \* Static Balance Test: support ring installed

&#x20; \* Dynamic Balance Test: support ring removed

\* visual condition:



&#x20; \* eyes open

&#x20; \* eyes closed

\* duration:



&#x20; \* 30 seconds by default

\* notes

\* start button



\---



\### 9.5 Live Assessment



This is the most important page.



Layout:



Left side:



\* webcam feed

\* MediaPipe skeleton overlay

\* posture status



Right side:



\* timer

\* live stability score

\* board motion indicator

\* support mode label:



&#x20; \* Static: support ring installed

&#x20; \* Dynamic: support ring removed

\* warnings:



&#x20; \* excessive forward sway

&#x20; \* excessive lateral instability

&#x20; \* trunk deviation detected



Secondary technical area:



\* four ultrasonic sensor values:



&#x20; \* front-left

&#x20; \* front-right

&#x20; \* rear-left

&#x20; \* rear-right



Bottom:



\* live sway graph

\* live posture deviation graph



Important:

Raw sensor values should be visible but not visually dominant. The main focus is stability interpretation.



\---



\### 9.6 Results



Show:



\* total balance score

\* board stability score

\* posture stability score

\* mean sway

\* max sway

\* sway velocity

\* instability events

\* trunk deviation

\* shoulder asymmetry

\* hip asymmetry

\* test duration

\* interpretation



Graphs:



\* anterior/posterior sway over time

\* medial/lateral sway over time

\* stability score over time

\* posture deviation over time



\---



\### 9.7 Reports



Generate a PDF report containing:



\* project title

\* patient information

\* test conditions

\* date and time

\* global balance score

\* board stability metrics

\* posture metrics

\* graphs

\* interpretation

\* recommendations

\* disclaimer



PDF style:



\* clean medical report

\* white background

\* blue/teal accents

\* readable tables

\* professional layout

\* bilingual support



\---



\### 9.8 Progress



For each patient:



\* session list

\* score evolution

\* sway evolution

\* improvement percentage

\* comparison between static and dynamic tests

\* doctor notes over time



\---



\## 10. Metrics



\### 10.1 Ultrasonic Sensor Input



The four ultrasonic sensor values are:



\* front\_left

\* front\_right

\* rear\_left

\* rear\_right



\### 10.2 Board Motion Calculations



```python

front\_avg = average(front\_left, front\_right)

rear\_avg = average(rear\_left, rear\_right)

left\_avg = average(front\_left, rear\_left)

right\_avg = average(front\_right, rear\_right)



anterior\_posterior\_sway = front\_avg - rear\_avg

medial\_lateral\_sway = left\_avg - right\_avg

```



Calculate:



\* sway amplitude

\* sway velocity

\* instability events

\* board stability score from 0 to 100



\### 10.3 MediaPipe Pose Metrics



Use simple explainable metrics:



\* trunk inclination

\* shoulder asymmetry

\* hip asymmetry

\* body center deviation

\* posture stability score from 0 to 100



\### 10.4 Combined Score



Use:



```python

total\_balance\_score = 0.6 \* board\_stability\_score + 0.4 \* posture\_stability\_score

```



Keep this formula configurable.



\---



\## 11. Rehabilitation Recommendations



Use rule-based recommendations for MVP.



Do not implement advanced ML yet.



Examples:



\* high medial/lateral sway → lateral weight-shift exercises

\* high anterior/posterior sway → forward/backward control exercises

\* high trunk deviation → trunk stabilization exercises

\* poor dynamic score → continue with static/support ring mode first

\* eyes-closed score much worse → proprioceptive training

\* improvement over sessions → increase difficulty gradually



Avoid exact medical predictions such as:



> The patient needs exactly 8 sessions.



Use cautious wording:



> Estimated progression: short, moderate, or extended follow-up may be required based on current stability indicators.



\---



\## 12. Demo Mode



Demo mode is mandatory.



The app must work even if the following are unavailable:



\* ESP32

\* ultrasonic sensors

\* webcam



Demo mode should simulate:



\* ultrasonic values

\* sway graphs

\* posture metrics

\* patient sessions

\* PDF report



This is essential for the presentation.



\---



\## 13. Development Order



\### Phase 1 — App with mock data



Build:



\* React frontend

\* FastAPI backend

\* SQLite database

\* patient management

\* new test workflow

\* live assessment page with fake data

\* results page

\* PDF report generation

\* progress tracking



\### Phase 2 — MediaPipe



Add:



\* webcam capture

\* MediaPipe Pose

\* skeleton overlay

\* posture metrics



\### Phase 3 — ESP32



Add:



\* ESP32 ultrasonic sensor reading

\* USB serial data stream

\* backend serial reader

\* replacement of fake sensor data with real data



\### Phase 4 — Polish



Add:



\* clean spacing

\* better report design

\* bilingual text everywhere

\* demo fallback

\* presentation-ready UI



\---



\## 14. Features Included in MVP



Mandatory:



\* professional UI

\* bilingual EN/FR support

\* patient management

\* new test workflow

\* live assessment page

\* demo mode

\* MediaPipe skeleton tracking

\* results page

\* PDF report

\* progress tracking

\* rule-based recommendations



\---



\## 15. Features Postponed



Postpone unless everything else is finished:



\* login/authentication

\* Raspberry Pi deployment

\* Wi-Fi ESP32 streaming

\* advanced machine learning

\* exact session number prediction

\* cloud database

\* mobile app

\* real force-plate metrics

\* center of pressure estimation



\---



\## 16. GitHub References



References are stored in:



```text

04\_GITHUB\_REFERENCES/

```



Use them only for inspiration:



```text

mediapipe\_pose/

postural\_control\_assessment/

smart\_rehab\_ai/

aequus/

```



Reference purpose:



\* MediaPipe Pose: webcam skeleton tracking

\* Postural-Control-Assessment: postural scoring ideas

\* SmartRehab-AI: rehabilitation workflow and feedback ideas

\* Aequus: low-cost balance rehabilitation concept



Do not copy blindly.



\---



\## 17. Manual Tasks



Before wasting code-generation time, ask the user to manually do simple tasks such as:



\* add hardware photos

\* add UI inspiration screenshots

\* add report examples

\* test webcam

\* test ESP32 connection

\* choose logo/name

\* verify sensor placement

\* take screenshots for documentation



\---



\## 18. Risks and Fallbacks



\### Risk: ESP32 not ready



Fallback:

Use demo mode with simulated ultrasonic data.



\### Risk: Webcam/MediaPipe unstable



Fallback:

Use recorded/demo posture data and show the UI workflow.



\### Risk: PDF generation is slow to implement



Fallback:

Generate a simple clean report first, then improve design later.



\### Risk: too many features



Fallback:

Prioritize patient workflow, live assessment, results, and report.



\---



\## 19. Codex Instruction



Before coding, Codex must provide:



1\. Final MVP scope

2\. Features included

3\. Features postponed

4\. Folder structure

5\. Database schema

6\. API routes

7\. Frontend pages/components

8\. Data flow

9\. Development roadmap

10\. Manual tasks

11\. Risks and fallback plan

12\. First coding step



Codex must wait for validation before generating the project.



