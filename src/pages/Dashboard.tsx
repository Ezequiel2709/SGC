
type DashboardProps = {
  nombreUsuario: string;
  abrirCorrespondencia: () => void;
};

export default function Dashboard({
  nombreUsuario,
  abrirCorrespondencia,
}: DashboardProps) {
  const indicadores = [
    {
      titulo: 'Documentos recibidos',
      cantidad: 12,
      icono: '📥',
    },
    {
      titulo: 'Documentos expedidos',
      cantidad: 8,
      icono: '📤',
    },
    {
      titulo: 'Documentos pendientes',
      cantidad: 4,
      icono: '📋',
    },
  ];

  return (
    <section className="sgc-dashboard">
      <div className="sgc-bienvenida">
        <h2>Bienvenido/a, {nombreUsuario}</h2>
        <p>
          Desde aquí podrás consultar los procesos
          administrativos de la Dirección de Carrera.
        </p>
      </div>

      <h3>Resumen de Correspondencia</h3>

      <div className="sgc-indicadores">
        {indicadores.map((indicador) => (
          <article
            className="sgc-indicador"
            key={indicador.titulo}
          >
            <span className="sgc-indicador-icono">
              {indicador.icono}
            </span>

            <div>
              <p>{indicador.titulo}</p>
              <strong>{indicador.cantidad}</strong>
            </div>
          </article>
        ))}
      </div>

      <div className="sgc-modulo-destacado">
        <div>
          <h3>Gestión de Correspondencia</h3>
          <p>
            Registra y consulta los documentos recibidos
            y expedidos de la Dirección de Carrera.
          </p>
        </div>

        <button
          type="button"
          className="sgc-btn-principal"
          onClick={abrirCorrespondencia}
        >
          Ir a Correspondencia
        </button>
      </div>

      <div className="sgc-aviso">
        <strong>Versión inicial del SGC</strong>
        <p>
          Los indicadores mostrados son datos ficticios
          utilizados únicamente para visualizar el diseño.
        </p>
      </div>
    </section>
  );
}
