
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

async function crearDirectora() {
    const nombre = process.env.ADMIN_NOMBRE?.trim();
    const correo = process.env.ADMIN_CORREO?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!nombre || !correo || !password) {
        throw new Error(
            'Configura ADMIN_NOMBRE, ADMIN_CORREO y ADMIN_PASSWORD temporalmente en .env'
        );
    }

    if (password.length < 12) {
        throw new Error('La contraseña debe tener al menos 12 caracteres.');
    }

    try {
        const existente = await pool.query(
            `SELECT id FROM perfiles
       WHERE LOWER(correo) = $1`,
            [correo]
        );

        if (existente.rowCount && existente.rowCount > 0) {
            throw new Error('Ya existe un perfil con ese correo.');
        }

        const hash = await bcrypt.hash(password, 12);

        await pool.query(
            `INSERT INTO perfiles
        (nombre_completo, correo, rol, activo, password_hash)
       VALUES ($1, $2, 'directora', TRUE, $3)`,
            [nombre, correo, hash]
        );

        console.log('Usuario directora creado correctamente.');
        console.log(`Correo registrado: ${correo}`);
    } finally {
        await pool.end();
    }
}

crearDirectora().catch((error) => {
    console.error('No se pudo crear la directora:', error.message);
    process.exitCode = 1;
});
