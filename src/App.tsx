import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";
import { GanttPage } from "./components/gantt/GanttPage";
import { AlertTriangle } from "lucide-react";

const queryClient = new QueryClient();

function isBrowserSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

function UnsupportedBrowser() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-[var(--status-delayed)]" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          Navegador no compatible
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta aplicación requiere <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong>{" "}
          para funcionar correctamente.
        </p>
      </div>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Algo salió mal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ocurrió un error inesperado. Intentá recargar la página.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

export function App() {
  if (!isBrowserSupported()) return <UnsupportedBrowser />;

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <GanttPage />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
