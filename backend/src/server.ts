import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import authRouter from './routes/auth.js';
import correspondenciaRouter from './routes/correspondencia.js';
import plantelRouter from './routes/plantel.js';
import asistenciaDocenteRouter from './routes/asistencia-docente.js';
import { autenticar } from './middlewares/auth.js';
import { permitirRoles } from './middlewares/roles.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);

// Correspondencia: Directora y Secretaria.
app.use('/api/correspondencia', autenticar,
  permitirRoles('directora', 'secretaria'), correspondenciaRouter);

// Administración del plantel: solo Directora. El panel del docente vendrá después.
app.use('/api/plantel', autenticar, permitirRoles('directora'), plantelRouter);

// Portal de asistencia: solamente la cuenta del docente puede marcar sus clases.
app.use('/api/docente', autenticar, permitirRoles('docente'), asistenciaDocenteRouter);

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
