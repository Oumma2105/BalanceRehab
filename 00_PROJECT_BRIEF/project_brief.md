\# BalanceRehab Project Brief



\## Project Title



English:

Low-cost computerized posturography platform using ultrasonic sensing and AI-based posture analysis for balance rehabilitation follow-up.



French:

Plateforme low-cost de posturographie informatisée basée sur des capteurs ultrasoniques et l’analyse posturale par IA pour le suivi de la rééducation de l’équilibre.



\## Context



This is a biomedical engineering PFA project. The original plan was to use force plates, but they are unavailable, so the project pivoted to a low-cost solution using ESP32, four ultrasonic sensors, a Decathlon balance board, and AI posture tracking through a laptop webcam.



\## Goal



Create a professional rehabilitation platform inspired by systems such as D-WALL, but low-cost and educational.



The system should support:

\- patient management

\- balance assessment

\- AI posture tracking

\- session recording

\- PDF report generation

\- progress tracking

\- rule-based rehabilitation recommendations



\## Hardware



\- ESP32

\- Four ultrasonic sensors

\- Decathlon balance board

\- Removable support ring

\- Laptop webcam

\- Computer/laptop for AI and app processing



\## Test Definitions



\### Static Test



The board is used with the removable support ring installed. The ring limits movement and makes the test safer and more controlled.



\### Dynamic Test



The support ring is removed. The board becomes more unstable and allows larger oscillations.



\## Scientific Limitation



The system does not measure real center of pressure like a force plate.



The system does not provide medical diagnosis.



It estimates functional balance indicators for educational and rehabilitation-support purposes.



\## App Language



The app should be bilingual:

\- English by default

\- French as optional language



\## Main Workflow



Doctor/Therapist opens app

→ selects patient

→ starts balance test

→ records AI posture and board motion

→ sees results

→ generates PDF report

→ follows patient progress over time

