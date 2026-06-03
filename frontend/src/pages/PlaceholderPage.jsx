export function PlaceholderPage({ title, t }) {
  return (
    <section className="rounded-lg border border-rehab-line bg-white p-8 shadow-clinical">
      <p className="text-sm font-semibold uppercase tracking-wide text-rehab-teal">{t.placeholder}</p>
      <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-2xl text-rehab-muted">
        This route is ready in the app shell. The next implementation pass will add the working MVP
        workflow one feature at a time.
      </p>
    </section>
  );
}
