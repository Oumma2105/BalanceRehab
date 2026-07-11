import { Component } from "react";
import { AlertTriangle } from "lucide-react";

// Catches render errors from any page so a single component bug degrades to an
// inline notice instead of unmounting the whole application.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page render error:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = this.props.t ?? {};
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-lg border border-rehab-line bg-white p-8 text-center shadow-clinical">
        <AlertTriangle size={40} className="mx-auto text-[#F8961E]" />
        <h2 className="mt-4 text-lg font-semibold text-rehab-ink">
          {t.errorBoundaryTitle ?? "Une erreur est survenue sur cette page"}
        </h2>
        <p className="mt-2 text-sm text-rehab-muted">
          {t.errorBoundaryBody ?? "Les données ne sont pas perdues. Vous pouvez revenir au tableau de bord et réessayer."}
        </p>
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}
          className="mt-5 rounded-lg bg-rehab-teal px-4 py-2 text-sm font-semibold text-white"
        >
          {t.errorBoundaryAction ?? "Revenir au tableau de bord"}
        </button>
      </div>
    );
  }
}
