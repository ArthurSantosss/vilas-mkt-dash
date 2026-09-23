import { Component } from 'react';

/**
 * Sem isto, um erro de render derruba a árvore inteira e sobra tela preta — foi
 * o que aconteceu no iPad com iOS 12. Aqui o erro aparece legível no próprio
 * aparelho, o que também ajuda a diagnosticar navegador antigo sem console.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[app] Erro não tratado:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        background: '#080A0F',
        color: '#E6E9EF',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        boxSizing: 'border-box',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            A plataforma encontrou um erro
          </h1>
          <p style={{ fontSize: 14, color: '#8B93A3', marginBottom: 20, lineHeight: 1.5 }}>
            Recarregue a página. Se o erro se repetir, envie o texto abaixo.
          </p>

          <pre style={{
            background: '#0F1219',
            border: '1px solid #1A1E2C',
            borderRadius: 12,
            padding: 16,
            fontSize: 12,
            lineHeight: 1.5,
            color: '#F87171',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowX: 'auto',
          }}>
            {String(error?.message || error)}
            {error?.stack ? `\n\n${error.stack}` : ''}
          </pre>

          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              borderRadius: 10,
              border: '1px solid #0FA5AE',
              background: '#0FA5AE',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
