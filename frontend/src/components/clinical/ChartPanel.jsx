import { ClinicalCard } from "./ClinicalCard";
import { SectionHeader } from "./SectionHeader";

export function ChartPanel({ title, description, children }) {
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={title} description={description} />
      <div className="mt-5">{children}</div>
    </ClinicalCard>
  );
}

