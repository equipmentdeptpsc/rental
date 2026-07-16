import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep production storage and rendering errors out of the blank-screen path.
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen grid place-items-center bg-slate-100 p-6">
          <section className="max-w-lg rounded-xl bg-white p-6 shadow text-center">
            <h1 className="text-xl font-semibold">The application could not load</h1>
            <p className="mt-3 text-slate-600">Browser storage may be unavailable or contain malformed data. Restore a known backup or ask an administrator for help.</p>
            <button className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>Try again</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
