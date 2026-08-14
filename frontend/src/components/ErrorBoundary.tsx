import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// BUG-45: sin ErrorBoundary, cualquier excepción de render dejaba la
// aplicación completamente en blanco.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error de render capturado:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'sans-serif'
          }}
        >
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Algo ha ido mal</h1>
          <p style={{ margin: 0, color: '#666' }}>
            Ha ocurrido un error inesperado. Recarga la página para continuar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '8px',
              border: '1px solid #ccc',
              cursor: 'pointer',
              background: '#fff'
            }}
          >
            Recargar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
