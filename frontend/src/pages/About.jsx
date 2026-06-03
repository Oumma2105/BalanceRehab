import { Cpu, Gauge, HeartPulse, Layers, UsersRound } from "lucide-react";

import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { SectionHeader } from "../components/clinical/SectionHeader";

export function AboutPage({ t }) {
  const hardware = ["ESP32", "Ultrasonic sensors", "Webcam", "Balance board", "Removable support ring"];
  const software = ["React", "Tailwind CSS", "FastAPI", "SQLite", "Python", "OpenCV", "MediaPipe Pose"];
  const metrics = ["Anterior-posterior sway", "Medial-lateral sway", "Sway velocity", "Instability events", "Trunk inclination", "Shoulder asymmetry", "Hip asymmetry"];

  return (
    <div className="space-y-5">
      <ClinicalCard className="p-6">
        <p className="text-sm font-semibold text-rehab-teal">BalanceRehab</p>
        <h1 className="mt-2 text-3xl font-semibold text-rehab-ink">{t.aboutHeroTitle}</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-rehab-muted">{t.projectOverviewText}</p>
      </ClinicalCard>

      <section className="grid gap-5 xl:grid-cols-2">
        <InfoCard icon={HeartPulse} title={t.projectOverview} text={t.projectOverviewText} />
        <InfoCard icon={Layers} title={t.architecture} text={t.architectureText} />
        <ListCard icon={Cpu} title={t.hardware} items={hardware} />
        <ListCard icon={Cpu} title={t.softwareStack} items={software} />
        <ListCard icon={Gauge} title={t.metrics} items={metrics} />
        <InfoCard icon={Gauge} title={t.scoringMethod} text={t.scoringText} />
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <ClinicalCard className="p-5">
          <SectionHeader title={t.team} />
          <div className="mt-4 space-y-2 text-sm text-rehab-muted">
            <p><UsersRound className="mr-2 inline" size={16} /> Team member 1</p>
            <p><UsersRound className="mr-2 inline" size={16} /> Team member 2</p>
            <p><UsersRound className="mr-2 inline" size={16} /> Team member 3</p>
          </div>
        </ClinicalCard>
        <ClinicalCard className="p-5">
          <SectionHeader title={t.supervisor} />
          <p className="mt-4 text-sm text-rehab-muted">Academic supervisor</p>
        </ClinicalCard>
      </section>

      <ClinicalCard className="p-5">
        <p className="text-sm leading-6 text-rehab-muted">{t.educationalDisclaimer}</p>
      </ClinicalCard>
    </div>
  );
}

function InfoCard({ icon: Icon, title, text }) {
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={title} />
      <div className="mt-4 flex gap-3">
        <Icon size={20} className="shrink-0 text-rehab-blue" />
        <p className="text-sm leading-6 text-rehab-muted">{text}</p>
      </div>
    </ClinicalCard>
  );
}

function ListCard({ icon: Icon, title, items }) {
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={title} />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm font-medium text-rehab-ink">
            <Icon size={16} className="text-rehab-blue" />
            {item}
          </div>
        ))}
      </div>
    </ClinicalCard>
  );
}
