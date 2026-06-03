import { Button } from "./Button";

export function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="rounded-lg border border-dashed border-rehab-line bg-slate-50 p-8 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-white shadow-sm" />
      <h3 className="text-base font-semibold text-rehab-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-rehab-muted">{description}</p>
      {actionLabel ? (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

