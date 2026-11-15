
import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';

export const autenticar: RequestHandler = async (req, res, next) => {
  const autorizacion = req.headers.authorization;

  if (!autorizacion || !autorizacion.startsWith('Bearer ')) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión para acceder.',
    });
    return;
  }

  const token = autorizacion.slice(7);

  try {
    const decodificado = jwt.verify(token, config.jwtSecret);

    if (
      typeof decodificado === 'string' ||
      typeof decodificado.sub !== 'string'
    ) {
      res.status(401).json({
        mensaje: 'Token inválido.',
      });
      return;
    }

    const usuarioToken = decodificado as JwtPayload;

    const resultado = await pool.query(
      `SELECT id, rol, activo
       FROM public.perfiles
       WHERE id = $1`,
      [usuarioToken.sub]
    );

    const perfil = resultado.rows[0];

    if (!perfil || !perfil.activo) {
      res.status(401).json({
        mensaje: 'La cuenta no existe o está desactivada.',
      });
      return;
    }

    res.locals.usuario = {
      id: String(perfil.id),
      rol: perfil.rol,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        mensaje: 'Token inválido o caducado.',
      });
      return;
    }

    console.error('Error al verificar autenticación:', error);
    res.status(500).json({
      mensaje: 'No se pudo verificar la autenticación.',
    });
  }
};
