import React from 'react';
import { TriangleExclamationPoint, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Quand cette clé change (ex. chemin de la route), l'erreur est oubliée. */
  resetKey?: string;
  /** `root` : plein écran ; `page` : dans la zone de contenu. */
  variant?: 'root' | 'page';
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Évite l'écran blanc en cas d'exception de rendu (M4). */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Erreur de rendu interceptée :', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    const isRoot = this.props.variant === 'root';
    return (
      <div
        className={
          isRoot
            ? 'h-full flex items-center justify-center bg-gray-100 p-6'
            : 'p-6 flex justify-center'
        }
      >
        <div role="alert" className="panel p-8 text-center max-w-md w-full">
          <TriangleExclamationPoint className="h-10 w-10 text-amber-700 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Une erreur inattendue est survenue
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Vos données enregistrées ne sont pas affectées.
            {isRoot
              ? ' Rechargez l\'application pour continuer.'
              : ' Réessayez, ou rechargez l\'application si le problème persiste.'}
          </p>
          <div className="flex justify-center gap-2">
            {!isRoot && (
              <button type="button" onClick={this.handleRetry} className="btn btn-default">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Réessayer
              </button>
            )}
            <button type="button" onClick={this.handleReload} className="btn btn-primary">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Recharger
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
