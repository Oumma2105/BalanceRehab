import balanceRehabLogo from "../assets/balancerehab-logo.png";
import {
  Activity,
  ArrowDown,
  BarChart3,
  Blocks,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  CircuitBoard,
  ClipboardCheck,
  Cloud,
  Code2,
  Cpu,
  Database,
  FileText,
  Footprints,
  Gamepad2,
  Gauge,
  GitBranch,
  Hand,
  HeartPulse,
  Layers3,
  Move,
  Network,
  PersonStanding,
  Radar,
  Route,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  UsersRound,
  Waves,
  Webcam,
  Workflow,
  Wrench,
} from "lucide-react";

const workflowIcons = [UserRound, ClipboardCheck, Webcam, ScanLine, BarChart3, FileText, Gamepad2, TrendingUp];
const solutionIcons = [Webcam, CircuitBoard, Gauge, FileText, Gamepad2, TrendingUp];
const indicatorIcons = [Gauge, PersonStanding, ShieldCheck, Waves, Move, Activity, Hand, Target];
const indicatorColors = ["#43AA8B", "#577590", "#43AA8B", "#F8961E", "#577590", "#F9C74F", "#43AA8B", "#577590"];
const exerciseIcons = [Gauge, Move, Route, Hand, Target, Gamepad2];

const technologyGroups = (c) => [
  {
    title: c.frontend,
    icon: Code2,
    color: "#43AA8B",
    items: [["React", Blocks], ["Vite", Sparkles], ["Tailwind CSS", Layers3]],
  },
  {
    title: c.backend,
    icon: Network,
    color: "#577590",
    items: [["FastAPI", Workflow], ["Python", Code2], ["SQLite", Database], ["SQLAlchemy", GitBranch]],
  },
  {
    title: c.computerVision,
    icon: ScanLine,
    color: "#F8961E",
    items: [["MediaPipe", PersonStanding], ["OpenCV", Camera]],
  },
  {
    title: c.hardware,
    icon: CircuitBoard,
    color: "#F9C74F",
    items: [["ESP32", Cpu], ["Ultrasonic Sensors", Radar], ["Balance Board", Footprints]],
  },
];

export function AboutPage({ t }) {
  const c = t.aboutShowcase;
  const workflowSteps = c.workflow.map((label, index) => [label, workflowIcons[index]]);
  const solutionItems = c.solutions.map(([title, text], index) => [title, solutionIcons[index], text]);
  const indicators = c.indicators.map((name, index) => [name, indicatorIcons[index], indicatorColors[index]]);
  const rehabilitationExercises = c.exercises.map(([name, text], index) => [name, exerciseIcons[index], text]);
  return (
    <article className="mx-auto max-w-[92rem] space-y-6 pb-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-clinical">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-8">
            <img src={balanceRehabLogo} alt="BalanceRehab" className="mb-5 h-24 w-24 object-contain" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rehab-teal">{c.overviewEyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold text-rehab-ink">BalanceRehab</h2>
            <p className="mt-2 text-lg font-semibold text-rehab-blue">{c.platformTitle}</p>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-rehab-muted">
              {c.overviewDescription}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {c.tags.map((label) => (
                <span key={label} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">{label}</span>
              ))}
            </div>
          </div>
          <div className="relative min-h-64 overflow-hidden p-6 text-white" style={{ backgroundColor: "#123934" }}>
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10" />
            <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full border border-white/10" />
            <div className="relative grid h-full place-items-center">
              <PlatformSchematic copy={c} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <PresentationSection eyebrow={c.problemEyebrow} title={c.problemTitle} icon={HeartPulse}>
          <div className="space-y-4 text-sm leading-6 text-rehab-muted">
            {c.problems.map(([title, text]) => <ProblemPoint key={title} title={title} text={text} />)}
          </div>
        </PresentationSection>

        <PresentationSection eyebrow={c.solutionEyebrow} title={c.solutionTitle} icon={Layers3}>
          <div className="grid gap-3 sm:grid-cols-2">
            {solutionItems.map(([title, Icon, text]) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Icon size={18} className="text-rehab-teal" />
                <p className="mt-3 text-sm font-semibold text-rehab-ink">{title}</p>
                <p className="mt-1 text-xs leading-5 text-rehab-muted">{text}</p>
              </div>
            ))}
          </div>
        </PresentationSection>
      </section>

      <PresentationSection eyebrow={c.workflowEyebrow} title={c.workflowTitle} icon={Workflow}>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-8">
          {workflowSteps.map(([label, Icon], index) => (
            <div key={label} className="relative">
              <div className="flex h-full min-h-32 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-3 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-rehab-teal"><Icon size={18} /></span>
                <p className="mt-3 text-xs font-semibold leading-5 text-rehab-ink">{label}</p>
                <span className="mt-2 text-[10px] font-semibold text-rehab-muted">{String(index + 1).padStart(2, "0")}</span>
              </div>
              {index < workflowSteps.length - 1 ? <ArrowDown size={16} className="mx-auto my-1 text-rehab-teal lg:absolute lg:-right-3 lg:top-1/2 lg:z-10 lg:-translate-y-1/2 lg:-rotate-90" /> : null}
            </div>
          ))}
        </div>
      </PresentationSection>

      <PresentationSection eyebrow={c.implementationEyebrow} title={c.technologiesTitle} icon={Cpu}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {technologyGroups(c).map((group) => (
            <div key={group.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ backgroundColor: group.color }}><group.icon size={18} /></span>
                <h3 className="font-semibold text-rehab-ink">{group.title}</h3>
              </div>
              <div className="mt-4 space-y-2">
                {group.items.map(([name, Icon]) => (
                  <div key={name} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-medium text-rehab-ink">
                    <Icon size={15} style={{ color: group.color }} /> {name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PresentationSection>

      <PresentationSection eyebrow={c.hardwareEyebrow} title={c.hardwareTitle} icon={CircuitBoard}>
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <HardwareDiagram copy={c} />
          <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-semibold text-rehab-ink">{c.acquisitionTitle}</h3>
            <p className="mt-3 text-sm leading-7 text-rehab-muted">
              {c.acquisitionDescription}
            </p>
            <div className="mt-5 space-y-3">
              {c.hardwareItems.map(([name, description]) => (
                <div key={name} className="flex gap-3">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-rehab-teal" />
                  <p className="text-xs leading-5 text-rehab-muted"><span className="font-semibold text-rehab-ink">{name}:</span> {description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PresentationSection>

      <PresentationSection eyebrow={c.clinicalOutputEyebrow} title={c.indicatorsTitle} icon={Gauge}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {indicators.map(([name, Icon, color]) => (
            <div key={name} className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ color, backgroundColor: `${color}16` }}><Icon size={17} /></span>
              <p className="mt-3 text-sm font-semibold text-rehab-ink">{name}</p>
              <p className="mt-1 text-xs leading-5 text-rehab-muted">{c.indicatorDescription}</p>
            </div>
          ))}
        </div>
      </PresentationSection>

      <section className="grid gap-5 xl:grid-cols-2">
        <PresentationSection eyebrow={c.reportingEyebrow} title={c.reportingTitle} icon={FileText}>
          <ReportPreview copy={c} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {c.reportItems.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-semibold text-rehab-ink">
                <CheckCircle2 size={14} className="text-rehab-teal" /> {item}
              </div>
            ))}
          </div>
        </PresentationSection>

        <PresentationSection eyebrow={c.therapeuticEyebrow} title={c.rehabilitationTitle} icon={Gamepad2}>
          <div className="grid gap-3 sm:grid-cols-2">
            {rehabilitationExercises.map(([name, Icon, text]) => (
              <div key={name} className="rounded-xl border border-slate-200 bg-white p-4">
                <Icon size={17} className="text-rehab-teal" />
                <p className="mt-2 text-sm font-semibold text-rehab-ink">{name}</p>
                <p className="mt-1 text-xs leading-5 text-rehab-muted">{text}</p>
              </div>
            ))}
          </div>
        </PresentationSection>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <PresentationSection eyebrow={c.contributorsEyebrow} title={c.teamTitle} icon={UsersRound}>
          <div className="grid gap-3 sm:grid-cols-3">
            {["Oumayma NASSLAHSEN", "Nassima ELALAOUI", "Kawtar AIT AZIZ"].map((name) => (
              <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-rehab-blue text-sm font-semibold text-white">{initials(name)}</span>
                <p className="mt-3 text-sm font-semibold text-rehab-ink">{name}</p>
                <p className="mt-1 text-xs text-rehab-muted">{c.studentRole}</p>
              </div>
            ))}
          </div>
        </PresentationSection>

        <PresentationSection eyebrow={c.supervisionEyebrow} title={c.supervisionTitle} icon={ShieldCheck}>
          <div className="space-y-3">
            {["Hachem EL YOUSFI ALAOUI", "Hassna KHALFI"].map((name) => (
              <div key={name} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-rehab-teal"><UserRound size={17} /></span>
                <div>
                  <p className="text-sm font-semibold text-rehab-ink">{name}</p>
                  <p className="text-xs text-rehab-muted">{c.supervisorRole}</p>
                </div>
              </div>
            ))}
          </div>
        </PresentationSection>
      </section>

      <PresentationSection eyebrow={c.roadmapEyebrow} title={c.futureTitle} icon={Wrench}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {c.futureItems.map((title, index) => {
            const Icon = [Wrench, ClipboardCheck, ShieldCheck, Sparkles, Gamepad2, Cloud][index];
            return (
            <div key={title} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-rehab-blue"><Icon size={16} /></span>
              <p className="text-sm font-semibold text-rehab-ink">{title}</p>
            </div>
          )})}
        </div>
      </PresentationSection>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-950">
        {c.disclaimer}
      </div>
    </article>
  );
}

function PresentationSection({ eyebrow, title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-rehab-teal"><Icon size={18} /></span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-rehab-teal">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-rehab-ink">{title}</h2>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProblemPoint({ title, text }) {
  return (
    <div className="flex gap-3">
      <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-rehab-red"><Activity size={14} /></span>
      <div><p className="font-semibold text-rehab-ink">{title}</p><p className="mt-1">{text}</p></div>
    </div>
  );
}

function PlatformSchematic({ copy }) {
  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between text-xs font-semibold text-white/72">
        <span className="inline-flex items-center gap-2"><Webcam size={16} /> {copy.computerVisionLabel}</span>
        <span className="inline-flex items-center gap-2"><CircuitBoard size={16} /> {copy.acquisitionLabel}</span>
      </div>
      <div className="relative mx-auto mt-8 h-36 w-64">
        <div className="absolute inset-x-4 bottom-0 h-20 rounded-[50%] border-2 border-rehab-teal bg-white/5" />
        {[
          [{ left: 20, top: 48 }, "S1"],
          [{ right: 20, top: 48 }, "S2"],
          [{ left: 64, bottom: 0 }, "S3"],
          [{ right: 64, bottom: 0 }, "S4"],
        ].map(([position, label]) => (
          <span key={label} style={position} className="absolute grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-[#577590] text-[10px] font-semibold">{label}</span>
        ))}
        <span className="absolute left-1/2 top-2 grid h-12 w-12 -translate-x-1/2 place-items-center rounded-xl bg-rehab-teal"><Cpu size={21} /></span>
        <div className="absolute left-1/2 top-14 h-8 w-px -translate-x-1/2 bg-white/30" />
      </div>
      <p className="mt-5 text-center text-xs leading-5 text-white/62">{copy.schematicCaption}</p>
    </div>
  );
}

function HardwareDiagram({ copy }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-[#f8fbfb] p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <HardwareNode icon={Webcam} title="Webcam" subtitle="MediaPipe" />
        <ArrowDown className="mx-auto text-rehab-teal sm:-rotate-90" />
        <HardwareNode icon={Cpu} title={copy.application} subtitle={copy.signalAnalysis} primary />
      </div>
      <div className="my-4 flex justify-center"><ArrowDown className="text-rehab-teal" /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <HardwareNode icon={CircuitBoard} title="ESP32" subtitle={copy.serialAcquisition} />
        <HardwareNode icon={Radar} title={copy.sensors} subtitle={copy.ultrasonicDisplacement} />
        <HardwareNode icon={Footprints} title={copy.balanceBoard} subtitle={copy.supportSurface} />
      </div>
    </div>
  );
}

function HardwareNode({ icon: Icon, title, subtitle, primary = false }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${primary ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <span className={`mx-auto grid h-10 w-10 place-items-center rounded-xl ${primary ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-blue"}`}><Icon size={18} /></span>
      <p className="mt-3 text-sm font-semibold text-rehab-ink">{title}</p>
      <p className="mt-1 text-xs text-rehab-muted">{subtitle}</p>
    </div>
  );
}

function ReportPreview({ copy }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
      <div className="mx-auto max-w-lg rounded-lg bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div><p className="text-sm font-semibold text-rehab-teal">BalanceRehab</p><p className="text-[10px] text-rehab-muted">{copy.reportPreviewTitle}</p></div>
          <FileText size={20} className="text-rehab-blue" />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {["Balance", "Posture", "Stability", "Sway"].map((label, index) => (
            <div key={label} className="rounded border border-slate-200 p-2"><span className="block h-1 rounded" style={{ backgroundColor: ["#43AA8B", "#577590", "#43AA8B", "#F8961E"][index] }} /><p className="mt-2 text-[8px] font-semibold text-rehab-muted">{label}</p><p className="text-xs font-semibold text-rehab-ink">{[78, 81, 76, "3.8"][index]}</p></div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-24 rounded border border-slate-200 bg-[repeating-linear-gradient(0deg,#fff,#fff_15px,#edf2f7_16px)] p-2"><ChartNoAxesCombined size={20} className="text-rehab-teal" /></div>
          <div className="grid grid-cols-5 gap-1 rounded border border-slate-200 p-2">{Array.from({ length: 25 }, (_, index) => <span key={index} className="rounded-sm" style={{ backgroundColor: index % 7 === 0 ? "#F8961E" : index % 4 === 0 ? "#43AA8B" : "#dbe5ea" }} />)}</div>
        </div>
      </div>
    </div>
  );
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}
