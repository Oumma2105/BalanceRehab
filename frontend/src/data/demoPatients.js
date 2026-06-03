export const pathologyOptions = [
  "Stroke",
  "Vestibular disorder",
  "Parkinson's disease",
  "Multiple sclerosis",
  "Cerebellar ataxia",
  "Peripheral neuropathy",
  "Post-surgery rehabilitation",
  "Orthopedic injury",
  "Ankle instability",
  "Fall prevention",
  "General balance training",
  "Other",
];

export const clinicalGoals = [
  "Improve static balance",
  "Improve dynamic balance",
  "Reduce fall risk",
  "Postural control training",
  "Proprioceptive training",
  "Rehabilitation follow-up",
];

const demoNames = [
  "Nadia Benali",
  "Youssef Amrani",
  "Salma Idrissi",
  "Karim El Fassi",
  "Amina Rami",
  "Hicham Berrada",
  "Lina Haddad",
  "Samir Tazi",
  "Meriem Alaoui",
  "Omar Mansouri",
  "Imane Zahraoui",
  "Rachid Bennani",
  "Hanae Cherkaoui",
  "Mehdi Lahlou",
  "Fatima El Amrani",
  "Adil Skalli",
  "Sara Belkacem",
  "Nabil Guessous",
  "Leila Ouazzani",
  "Anas El Idrissi",
  "Sofia Bennis",
  "Mourad El Khatib",
  "Yasmina Filali",
  "Taha Mekouar",
  "Mouna Radi",
  "Reda Bouziane",
  "Nora Chraibi",
  "Hamza El Mansour",
  "Asmae Jalil",
  "Kamal Naciri",
  "Dounia Sefrioui",
  "Ilyas Fikri",
  "Zineb Mokri",
  "Tarik El Alami",
  "Rim Qadiri",
  "Amal Barakat",
  "Said Raji",
  "Maha Laaroussi",
  "Walid Sabri",
  "Khadija Mernissi",
  "Ayoub Tahiri",
  "Nawal Bakkali",
  "Jalal Mouline",
  "Houda Lamrani",
  "Bilal Fassi",
  "Malika Zerhouni",
  "Othmane Boussaid",
  "Ghita Lamari",
  "Mustapha Saidi",
  "Rania Kabbaj",
];

const pathologySeverity = {
  Stroke: 14,
  "Vestibular disorder": 10,
  "Parkinson's disease": 13,
  "Multiple sclerosis": 12,
  "Cerebellar ataxia": 16,
  "Peripheral neuropathy": 11,
  "Post-surgery rehabilitation": 8,
  "Orthopedic injury": 7,
  "Ankle instability": 6,
  "Fall prevention": 9,
  "General balance training": 3,
  Other: 5,
};

const pathologyKeys = {
  Stroke: "stroke",
  "Vestibular disorder": "vestibular_disorder",
  "Parkinson's disease": "parkinsons_disease",
  "Multiple sclerosis": "multiple_sclerosis",
  "Cerebellar ataxia": "cerebellar_ataxia",
  "Peripheral neuropathy": "peripheral_neuropathy",
  "Post-surgery rehabilitation": "post_surgery_rehabilitation",
  "Orthopedic injury": "orthopedic_injury",
  "Ankle instability": "ankle_instability",
  "Fall prevention": "fall_prevention",
  "General balance training": "general_balance_training",
  Other: "other",
};

const clinicalGoalKeys = {
  "Improve static balance": "improve_static_balance",
  "Improve dynamic balance": "improve_dynamic_balance",
  "Reduce fall risk": "reduce_fall_risk",
  "Postural control training": "postural_control_training",
  "Proprioceptive training": "proprioceptive_training",
  "Rehabilitation follow-up": "rehabilitation_follow_up",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function statusFromScore(score, improvement) {
  if (score < 62 || improvement < -4) return "Declining";
  if (score < 70) return "Follow-up";
  if (improvement >= 5) return "Improving";
  return "Stable";
}

function latestDateFor(index) {
  const dates = [
    "2026-06-03",
    "2026-06-03",
    "2026-06-03",
    "2026-06-02",
    "2026-06-02",
    "2026-06-01",
    "2026-05-31",
    "2026-05-30",
    "2026-05-29",
    "2026-05-28",
  ];

  return dates[index % dates.length];
}

function patientTrend(index) {
  if (index % 11 === 0) return -7;
  if (index % 7 === 0) return -4;
  if (index % 5 === 0) return 1;
  return 4 + (index % 4);
}

export const demoPatients = demoNames.map((fullName, index) => {
  const id = index + 1;
  const patientId = `BR-${String(1064 + index).padStart(4, "0")}`;
  const pathology = pathologyOptions[index % pathologyOptions.length];
  const clinicalGoal = clinicalGoals[index % clinicalGoals.length];
  const age = 32 + ((index * 7) % 48);
  const sex = index % 2 === 0 ? "F" : "M";
  const heightCm = sex === "F" ? 156 + ((index * 5) % 18) : 166 + ((index * 4) % 20);
  const weightKg = sex === "F" ? 54 + ((index * 6) % 24) : 66 + ((index * 7) % 28);
  const dominantSide = index % 9 === 0 ? "Left" : "Right";
  const improvement = patientTrend(index);
  const agePenalty = Math.max(0, Math.round((age - 45) / 4));
  const latestScore = clamp(88 - agePenalty - pathologySeverity[pathology] + improvement + ((index % 5) - 2), 48, 94);

  return {
    id,
    patientId,
    patientCode: patientId,
    fullName,
    age,
    sex,
    heightCm,
    weightKg,
    dominantSide,
    pathology,
    pathologyKey: pathologyKeys[pathology],
    clinicalGoal,
    clinicalGoalKey: clinicalGoalKeys[clinicalGoal],
    notes: `${clinicalGoal} with supervised functional balance follow-up.`,
    clinicalNotes: `${clinicalGoal} with supervised functional balance follow-up.`,
    status: statusFromScore(latestScore, improvement),
    latestScore,
    lastAssessmentDate: latestDateFor(index),
    improvement,
  };
});
