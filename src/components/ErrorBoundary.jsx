import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
          <div className="glass-panel" style={{ padding: '3rem', maxWidth: '600px' }}>
            <h2 style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }}>Something went wrong.</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              We've encountered an unexpected error. Please try refreshing the application.
            </p>
            <button 
              className="btn btn-primary" 
              onClick={() => window.location.reload()}
            >
              Refresh Application
            </button>
            
            {import.meta.env.DEV && this.state.error && (
              <div style={{ marginTop: '2rem', textAlign: 'left', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
                <p style={{ color: 'var(--accent-danger)', fontWeight: 'bold' }}>{this.state.error.toString()}</p>
                <pre style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
