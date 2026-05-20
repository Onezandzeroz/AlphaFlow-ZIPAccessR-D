'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, LogOut } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ErrorBoundary] Uncaught error:', error);
  }, [error]);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      window.location.href = '/';
    });
  };

  return (
    <html lang="da" suppressHydrationWarning>
      <body className="antialiased bg-[#f8faf9] dark:bg-[#0f1211] text-[#1a1d1c] dark:text-[#e2e8e6]">
        <div className="min-h-[100dvh] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>

            <h1 className="text-xl font-semibold mb-2">
              Noget gik galt
            </h1>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
              Der opstod en uventet fejl i applikationen. Prøv at genindlæse siden, eller log ud og log ind igen.
            </p>

            {error.message && (
              <div className="mb-6 p-3 rounded-lg bg-gray-100 dark:bg-gray-800/50 text-left">
                <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-words">
                  {error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0d9488] hover:bg-[#0f766e] text-white text-sm font-medium transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Prøv igen
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
              >
                Genindlæs side
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Log ud
              </button>
            </div>

            {error.digest && (
              <p className="mt-6 text-[11px] text-gray-400 dark:text-gray-500">
                Fejl-ID: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
