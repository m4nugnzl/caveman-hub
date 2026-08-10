import { Component } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

/**
 * Frontera de error de la aplicación.
 *
 * Sin esto, cualquier `undefined` inesperado en cualquier módulo tumbaba la app
 * entera a pantalla en blanco, sin mensaje y sin forma de recuperarse. Con un
 * cliente sin datos todavía ocurría en el primer render.
 *
 * Tiene que ser un componente de clase: React no ofrece equivalente en hooks.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Sin servicio de observabilidad todavía; al menos queda la traza completa
    // en consola con el árbol de componentes donde ocurrió.
    console.error('Error no controlado en la interfaz:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="layout layout-narrow">
        <section className="card">
          <div className="empty">
            <span className="empty-icon" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
              <TriangleAlert size={26} />
            </span>
            <h3>Algo ha fallado en esta pantalla</h3>
            <p>
              El resto de la aplicación sigue funcionando y tus datos no se han perdido: lo último
              que se guardó está a salvo en el servidor.
            </p>
            <pre
              className="card-inset t-xs"
              style={{ textAlign: 'left', overflowX: 'auto', width: '100%', whiteSpace: 'pre-wrap' }}
            >
              {error.message || String(error)}
            </pre>
            <div className="row gap-2 wrap center">
              <button type="button" className="btn btn-primary" onClick={this.handleReset}>
                <RotateCcw size={15} /> Volver a intentarlo
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.location.reload()}
              >
                Recargar la aplicación
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }
}
