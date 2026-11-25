import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import authRouter from './routes/auth.js';
import correspondenciaRouter from './routes/correspondencia.js';
import plantelRouter from './routes/plantel.js';
import asistenciaDocenteRouter from './routes/asistencia-docente.js';
import { controlAsistenciaRouter, solicitudesDocenteRouter } from './routes/control-asistencia.js';
import reportesAsistenciaRouter from './routes/reportes-asistencia.js';
import auxiliaturasRouter from './routes/auxiliaturas.js';
import procesosAuxRouter from './routes/auxiliaturas-procesos.js';
import titulacionesRouter from './routes/titulaciones.js';
import { autenticar } from './middlewares/auth.js';
import { permitirRoles } from './middlewares/roles.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// CORS controla qué páginas pueden LEER respuestas de la API desde un navegador.
// No reemplaza JWT ni los permisos de cada rol.
// En desarrollo, Vite usa /api mediante su proxy; esta lista cubre además
// llamadas directas desde el navegador local.
const origenesDesarrollo = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Ejemplo en backend/.env (sin barra final):
// SGC_ALLOWED_ORIGINS=https://sgc.universidad.edu.bo,https://frontend.ejemplo.bo
const origenesConfigurados = (process.env.SGC_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);

// Evitar valores genéricos ("*") o direcciones con rutas: se permite
// solamente un origen http(s) exacto, con puerto opcional.
for (const origen of origenesConfigurados) {
  let url: URL;
  try {
    url = new URL(origen);
  } catch {
    throw new Error(`Origen CORS inválido en SGC_ALLOWED_ORIGINS: ${origen}`);
  }
  if (!['http:', 'https:'].includes(url.protocol) ||
      url.origin === 'null' || url.username || url.password ||
      (url.href !== `${url.origin}/` && url.href !== url.origin)) {
    throw new Error(`El origen CORS debe ser una dirección http(s) sin rutas: ${origen}`);
  }
}

const origenesPermitidos = new Set([
  ...(process.env.NODE_ENV === 'production' ? [] : origenesDesarrollo),
  ...origenesConfigurados.map((origen) => new URL(origen).origin),
]);

app.use(cors({
  origin: (origen, callback) => {
    // Peticiones sin encabezado Origin (por ejemplo, curl o backend a backend).
    if (!origen) { callback(null, true); return; }
    callback(null, origenesPermitidos.has(origen));
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use('/api/auth', authRouter);

// Correspondencia: Directora y Secretaria.
app.use('/api/correspondencia', autenticar,
  permitirRoles('directora', 'secretaria'), correspondenciaRouter);

// Administración del plantel: solo Directora.
app.use('/api/plantel', autenticar, permitirRoles('directora'), plantelRouter);

// Convocatorias de auxiliatura: acceso exclusivo de Directora.
app.use('/api/auxiliaturas', autenticar, permitirRoles('directora'), auxiliaturasRouter);
// Etapas 2-5: todas protegidas solo para Dirección.
app.use('/api/auxiliaturas', autenticar, permitirRoles('directora'), procesosAuxRouter);

// Titulaciones: solamente Direccion de Carrera.
app.use('/api/titulaciones', autenticar, permitirRoles('directora'), titulacionesRouter);

// Portal de asistencia: solamente la cuenta del docente puede marcar sus clases.
app.use('/api/docente', autenticar, permitirRoles('docente'), asistenciaDocenteRouter);
app.use('/api/docente', autenticar, permitirRoles('docente'), solicitudesDocenteRouter);

// Dirección: supervisión de registros, fotos y decisiones auditables.
app.use('/api/control-asistencia', autenticar, permitirRoles('directora'), controlAsistenciaRouter);

// Reportes: consultas históricas y exportación accesibles solo a Dirección.
app.use('/api/reportes-asistencia', autenticar, permitirRoles('directora'), reportesAsistenciaRouter);

app.get('/api/privado-test', autenticar, permitirRoles('directora'), (_req, res) => {
  res.json({ mensaje: 'Acceso autorizado.', rol: res.locals.usuario.rol });
});

app.get('/api/health', (_req, res) => {
  res.json({ mensaje: 'Backend del SGC funcionando correctamente' });
});

app.get('/api/db-test', autenticar, permitirRoles('directora'), async (_req, res) => {
  try {
    const r = await pool.query(
      'SELECT current_database() AS base_datos, current_schema() AS esquema'
    );
    res.json({ mensaje: 'Conexión con PostgreSQL exitosa', ...r.rows[0] });
  } catch (error) {
    console.error('Error al consultar PostgreSQL:', error);
    res.status(500).json({ mensaje: 'No se pudo conectar con PostgreSQL.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor SGC ejecutándose en http://localhost:${PORT}`);
});
