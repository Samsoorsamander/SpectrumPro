import React from "react";

interface Props {
  darkMode?: boolean;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Prevents a single route crash from blanking the whole desktop shell. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("UI crash caught by ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.error) {
      const dark = this.props.darkMode !== false;
      return (
        <div
          className={`h-full min-h-[200px] flex flex-col items-center justify-center p-6 text-center ${
            dark ? "bg-[#0f1115] text-white" : "bg-gray-50 text-gray-900"
          }`}
        >
          <h2 className="text-lg font-black uppercase tracking-widest mb-2">
            Something went wrong
          </h2>
          <p className="text-xs text-gray-500 max-w-md mb-4 font-bold">
            {this.state.error.message || "Unexpected screen error"}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-black uppercase"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
