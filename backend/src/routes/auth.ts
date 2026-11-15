
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';

const router = Router();

router.post('/login', async (req, res) => {
    try {
        const correo = req.body?.correo;
        const password = req.body?.password;

        if (
            typeof correo !== 'string' ||
            typeof password !== 'string' ||
            !correo.trim() ||
            !password
        ) {
            res.status(400).json({
                mensaje: 'Debes proporcionar el correo y la contraseña.',
            });
            return;
        }

        const resultado = await pool.query(
            `SELECT id, nombre_completo, correo, rol, activo, password_hash
       FROM perfiles
       WHERE LOWER(correo) = LOWER($1)
       LIMIT 1`,
            [correo.trim()]
        );

        const perfil = resultado.rows[0];

        if (!perfil || !perfil.password_hash) {
            res.status(401).json({
                mensaje: 'Correo o contraseña incorrectos.',
            });
            return;
        }

        if (!perfil.activo) {
            res.status(403).json({
                mensaje: 'La cuenta está desactivada.',
            });
            return;
        }

        const passwordValida = await bcrypt.compare(
            password,
            perfil.password_hash
        );

        if (!passwordValida) {
            res.status(401).json({
                mensaje: 'Correo o contraseña incorrectos.',
            });
            return;
        }

        const token = jwt.sign(
            { rol: perfil.rol },
            config.jwtSecret,
            {
                subject: String(perfil.id),
                expiresIn: '1h',
            }
        );

        res.json({
            mensaje: 'Inicio de sesión correcto.',
            token,
            usuario: {
                id: perfil.id,
                nombre_completo: perfil.nombre_completo,
                correo: perfil.correo,
                rol: perfil.rol,
            },
        });
    } catch (error) {
        console.error('Error al iniciar sesión:', error);

        res.status(500).json({
            mensaje: 'Ocurrió un error al iniciar sesión.',
        });
    }
});

export default router;
