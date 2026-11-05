import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('4Rent Uncaught Application Error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCacheAndRestart = () => {
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#0B0E14] text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#141A25] border border-amber-500/30 p-6 sm:p-8 shadow-2xl text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                4Rent Application Recovery
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                An unexpected runtime error was safely intercepted. Your rooms,
                continuous sub-meter readings, and payment records remain secure
                in your persistent database.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 rounded-xl bg-[#0B0E14] border border-[#232D40] text-left text-xs font-mono text-red-400 overflow-x-auto max-h-32">
                <div className="flex items-center gap-1.5 font-bold mb-1 text-slate-400">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Error Diagnostics:</span>
                </div>
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleClearCacheAndRestart}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#1B2230] hover:bg-[#232D40] text-slate-300 font-semibold text-xs transition cursor-pointer border border-[#283246]"
              >
                Restart Session
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
