
import express from 'express';
import cors from 'cors';

import { pool } from './db.js';

import authRouter from './routes/auth.js';
import correspondenciaRouter from './routes/correspondencia.js';

import { autenticar } from './middlewares/auth.js';
import { permitirRoles } from './middlewares/roles.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// ========================================
// CONFIGURACIÓN GENERAL
// ========================================

app.use(cors());
app.use(express.json());

// ========================================
// AUTENTICACIÓN
// ========================================

app.use('/api/auth', authRouter);

// ========================================
// MÓDULO DE CORRESPONDENCIA
// Acceso: Directora y Secretaria
// ========================================

app.use(
  '/api/correspondencia',
  autenticar,
  permitirRoles('directora', 'secretaria'),
  correspondenciaRouter
);

// ========================================
// RUTA PRIVADA DE PRUEBA
// Acceso: Solo Directora
// ========================================

app.get(
  '/api/privado-test',
  autenticar,
  permitirRoles('directora'),
  (_req, res) => {
    res.json({
      mensaje: 'Acceso autorizado.',
      rol: res.locals.usuario.rol,
    });
  }
);

// ========================================
// VERIFICACIÓN DEL SERVIDOR
// Ruta pública sin datos sensibles
// ========================================

app.get('/api/health', (_req, res) => {
  res.json({
    mensaje: 'Backend del SGC funcionando correctamente',
  });
});

// ========================================
// VERIFICACIÓN DE POSTGRESQL
// Acceso: Solo Directora
// ========================================

app.get(
  '/api/db-test',
  autenticar,
  permitirRoles('directora'),
  async (_req, res) => {
    try {
      const resultado = await pool.query(
        `SELECT
          current_database() AS base_datos,
          current_schema() AS esquema`
      );

      res.json({
        mensaje: 'Conexión con PostgreSQL exitosa',
        ...resultado.rows[0],
      });
    } catch (error) {
      console.error(
        'Error al consultar PostgreSQL:',
        error
      );

      res.status(500).json({
        mensaje:
          'No se pudo conectar con PostgreSQL.',
      });
    }
  }
);

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(PORT, () => {
  console.log(
    `Servidor SGC ejecutándose en http://localhost:${PORT}`
  );
});
