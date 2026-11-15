
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import authRouter from './routes/auth.js';
import { autenticar } from './middlewares/auth.js';
import { permitirRoles } from './middlewares/roles.js';
import correspondenciaRouter from './routes/correspondencia.js';
const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use(
    '/api/correspondencia',
    autenticar,
    permitirRoles('directora'),
    correspondenciaRouter
);
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

app.get('/api/health', (_req, res) => {
    res.json({
        mensaje: 'Backend del SGC funcionando correctamente',
    });
});

app.get('/api/perfiles-test', async (_req, res) => {
    try {
        const resultado = await pool.query(`
      SELECT id, nombre_completo, correo, rol, activo
      FROM perfiles
      ORDER BY id
      LIMIT 10
    `)

        res.json({
            mensaje: 'Consulta de perfiles exitosa',
            cantidad: resultado.rows.length,
            perfiles: resultado.rows,
        })
    } catch (error) {
        console.error('Error al consultar perfiles:', error)

        res.status(500).json({
            mensaje: 'No se pudo consultar la tabla perfiles',
        })
    }
})


app.get('/api/db-test', async (_req, res) => {
    try {
        const result = await pool.query(
            'SELECT current_database() AS base_datos, current_schema() AS esquema'
        );

        res.json({
            mensaje: 'Conexión con PostgreSQL exitosa',
            ...result.rows[0],
        });
    } catch (error) {
        console.error('Error al consultar PostgreSQL:', error);
        res.status(500).json({
            mensaje: 'No se pudo conectar con PostgreSQL. Revisa la configuración.',
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor SGC ejecutándose en http://localhost:${PORT}`);
});
