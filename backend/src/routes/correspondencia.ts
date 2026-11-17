
import { Router } from 'express';
import type { PoolClient } from 'pg';
import multer from 'multer';
import { unlink, readFile } from 'node:fs/promises';
import path from 'node:path';

import { pool } from '../db.js';
import {
  subirComprobante,
  subirOficio,
} from '../middlewares/upload.js';
import { guardarArchivo } from '../archivos.js';


const router = Router();

// ========================================
// CONFIGURACIÓN GENERAL
// ========================================

const estadosIniciales = {
  recibida: 'recibido',
  expedida: 'registrado',
} as const;

const transiciones: Record<string, string[]> = {
  recibido: ['en_revision'],
  en_revision: ['devuelto', 'pendiente', 'finalizado'],
  devuelto: ['en_revision'],
  pendiente: ['en_gestion'],
  en_gestion: ['respondido'],
  respondido: ['finalizado'],
  finalizado: [],

  registrado: ['enviado'],
  enviado: ['entregado'],
  entregado: [],
};

// Validar fechas en formato AAAA-MM-DD
function fechaValida(valor: unknown): valor is string {
  if (
    typeof valor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor)
  ) {
    return false;
  }

  const fecha = new Date(`${valor}T00:00:00Z`);

  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === valor
  );
}

// Permitir fechas opcionales
function fechaOpcionalValida(valor: unknown): boolean {
  return valor == null || fechaValida(valor);
}

// ========================================
// 1. CONSULTAR DOCUMENTOS
// GET /api/correspondencia
// ========================================

router.get('/', async (_req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT *
      FROM public.correspondencia
      ORDER BY fecha_creacion DESC, id DESC
    `);

    res.json({
      cantidad: resultado.rows.length,
      documentos: resultado.rows,
    });

  } catch (error) {
    console.error(
      'Error al consultar correspondencia:',
      error
    );

    res.status(500).json({
      mensaje: 'No se pudieron consultar los documentos.',
    });
  }
});

// ========================================
// 2. REGISTRAR DOCUMENTOS
// POST /api/correspondencia
// ========================================

router.post('/', async (req, res) => {
  const {
    tipo,
    remitente,
    destinatario,
    referencia,
    descripcion,
    fecha_documento,
    fecha_recepcion,
    fecha_limite,
    gestion,
  } = req.body ?? {};

  // Validar tipo de documento
  if (tipo !== 'recibida' && tipo !== 'expedida') {
    res.status(400).json({
      mensaje: 'El tipo debe ser recibida o expedida.',
    });
    return;
  }

  // Validar datos obligatorios
  if (
    typeof remitente !== 'string' ||
    !remitente.trim() ||
    typeof destinatario !== 'string' ||
    !destinatario.trim() ||
    typeof referencia !== 'string' ||
    !referencia.trim()
  ) {
    res.status(400).json({
      mensaje:
        'Remitente, destinatario y referencia son obligatorios.',
    });
    return;
  }

  if (
    descripcion != null &&
    typeof descripcion !== 'string'
  ) {
    res.status(400).json({
      mensaje: 'La descripción debe ser un texto.',
    });
    return;
  }

  // Validar fechas
  if (
    !fechaOpcionalValida(fecha_documento) ||
    !fechaOpcionalValida(fecha_recepcion) ||
    !fechaOpcionalValida(fecha_limite)
  ) {
    res.status(400).json({
      mensaje:
        'Las fechas deben ser válidas y tener formato AAAA-MM-DD.',
    });
    return;
  }

  // Validar gestión
  if (
    gestion != null &&
    (
      !Number.isInteger(gestion) ||
      gestion < 2000 ||
      gestion > 2100
    )
  ) {
    res.status(400).json({
      mensaje: 'La gestión debe ser un año válido.',
    });
    return;
  }

  if (gestion == null) {
  res.status(400).json({
    mensaje:
      'La gestión es obligatoria para todos los documentos.',
  });
  return;
}

  const usuarioId = res.locals.usuario?.id;

  if (!usuarioId) {
    res.status(401).json({
      mensaje: 'Usuario no autenticado.',
    });
    return;
  }

  let cliente: PoolClient | undefined;

  try {
    cliente = await pool.connect();

    await cliente.query('BEGIN');

    let numeroCorrelativo: number | null = null;

    // Generar correlativo solo para expedidos
    if (tipo === 'expedida') {
      const correlativo = await cliente.query(
        `INSERT INTO public.correlativos_correspondencia
           (gestion, ultimo_numero)
         VALUES ($1, 1)
         ON CONFLICT (gestion)
         DO UPDATE SET
           ultimo_numero =
             correlativos_correspondencia.ultimo_numero + 1
         RETURNING ultimo_numero`,
        [gestion]
      );

      numeroCorrelativo =
        correlativo.rows[0].ultimo_numero;
    }

    const estado = estadosIniciales[tipo as keyof typeof estadosIniciales];

    // Guardar el documento
    const resultado = await cliente.query(
      `INSERT INTO public.correspondencia (
        tipo,
        gestion,
        numero_correlativo,
        remitente,
        destinatario,
        referencia,
        descripcion,
        fecha_documento,
        fecha_recepcion,
        fecha_limite,
        estado,
        registrado_por
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12
      )
      RETURNING *`,
      [
        tipo,
        gestion ?? null,
        numeroCorrelativo,
        remitente.trim(),
        destinatario.trim(),
        referencia.trim(),
        descripcion?.trim() ?? null,
        fecha_documento ?? null,
        fecha_recepcion ?? null,
        fecha_limite ?? null,
        estado,
        usuarioId,
      ]
    );

    await cliente.query('COMMIT');

    const documento = resultado.rows[0];

    const codigo =
      tipo === 'expedida'
        ? `EXP-${gestion}-${String(
            numeroCorrelativo
          ).padStart(3, '0')}`
        : null;

    res.status(201).json({
      mensaje: 'Documento registrado correctamente.',
      codigo,
      documento,
    });

  } catch (error) {
    if (cliente) {
      try {
        await cliente.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Error al revertir registro:',
          rollbackError
        );
      }
    }

    console.error(
      'Error al registrar correspondencia:',
      error
    );

    res.status(500).json({
      mensaje: 'No se pudo registrar el documento.',
    });

  } finally {
    cliente?.release();
  }
});


// ========================================
// 3. ACTUALIZAR ESTADO
// PATCH /api/correspondencia/:id/estado
// ========================================

router.patch('/:id/estado', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({
      mensaje: 'ID de documento inválido.',
    });
    return;
  }

  const {
    estado,
    comentario,
    fecha_salida,
  } = req.body ?? {};

  if (typeof estado !== 'string') {
    res.status(400).json({
      mensaje: 'Debes proporcionar un estado válido.',
    });
    return;
  }

  // La entrega se registra con comprobante
  if (estado === 'entregado') {
    res.status(400).json({
      mensaje:
        'Para confirmar la entrega debes adjuntar una constancia mediante /:id/constancia.',
    });
    return;
  }

  if (
    comentario != null &&
    typeof comentario !== 'string'
  ) {
    res.status(400).json({
      mensaje: 'El comentario debe ser un texto.',
    });
    return;
  }

  if (
    estado === 'enviado' &&
    !fechaValida(fecha_salida)
  ) {
    res.status(400).json({
      mensaje:
        'Para enviar debes indicar una fecha_salida válida.',
    });
    return;
  }

  const usuarioId = res.locals.usuario?.id;

  if (!usuarioId) {
    res.status(401).json({
      mensaje: 'Usuario no autenticado.',
    });
    return;
  }

  let cliente: PoolClient | undefined;

  try {
    cliente = await pool.connect();

    await cliente.query('BEGIN');

    // Bloquear el documento durante el cambio
    const consulta = await cliente.query(
      `SELECT id, tipo, estado
       FROM public.correspondencia
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    const documento = consulta.rows[0];

    if (!documento) {
      await cliente.query('ROLLBACK');

      res.status(404).json({
        mensaje: 'Documento no encontrado.',
      });
      return;
    }

    const permitidos =
      transiciones[documento.estado] ?? [];

    if (!permitidos.includes(estado)) {
      await cliente.query('ROLLBACK');

      res.status(409).json({
        mensaje:
          `No se permite cambiar de ${documento.estado} a ${estado}.`,
      });
      return;
    }

    // Actualizar documento
    const actualizado = await cliente.query(
      `UPDATE public.correspondencia
       SET
         estado = $1::varchar,
         fecha_salida = CASE
           WHEN $1 = 'enviado'
             THEN $2::date
           ELSE fecha_salida
         END
       WHERE id = $3
       RETURNING *`,
      [
        estado,
        estado === 'enviado' ? fecha_salida : null,
        id,
      ]
    );

    // Guardar historial
    await cliente.query(
      `INSERT INTO public.seguimiento_correspondencia (
        correspondencia_id,
        estado_anterior,
        estado_nuevo,
        comentario,
        usuario_id
      )
      VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        documento.estado,
        estado,
        comentario?.trim() || null,
        usuarioId,
      ]
    );

    await cliente.query('COMMIT');

    res.json({
      mensaje: 'Estado actualizado correctamente.',
      documento: actualizado.rows[0],
    });

  } catch (error) {
    if (cliente) {
      try {
        await cliente.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Error al revertir cambio de estado:',
          rollbackError
        );
      }
    }

    console.error(
      'Error al actualizar estado:',
      error
    );

    res.status(500).json({
      mensaje: 'No se pudo actualizar el estado.',
    });

  } finally {
    cliente?.release();
  }
});

// ========================================
// 4. REGISTRAR CONSTANCIA DE RECEPCIÓN
// POST /api/correspondencia/:id/constancia
// ========================================

router.post(
  '/:id/constancia',

  // Recibir el archivo mediante Multer
  (req, res, next) => {
    subirComprobante(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        res.status(
          error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
        ).json({
          mensaje:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'El archivo supera los 5 MB.'
              : 'Error al recibir el archivo.',
        });
        return;
      }

      if (error) {
        res.status(400).json({
          mensaje:
            'Archivo no permitido. Usa PDF, JPG o PNG.',
        });
        return;
      }

      next();
    });
  },

  async (req, res) => {
    const id = Number(req.params.id);

    const {
      fecha_entrega,
      tipo_constancia,
    } = req.body ?? {};

    // Validar ID
    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({
        mensaje: 'ID de documento inválido.',
      });
      return;
    }

    // Validar tipo de constancia
    if (
      tipo_constancia !== 'sello' &&
      tipo_constancia !== 'firma'
    ) {
      res.status(400).json({
        mensaje:
          'La constancia debe ser sello o firma.',
      });
      return;
    }

    // Validar fecha
    if (!fechaValida(fecha_entrega)) {
      res.status(400).json({
        mensaje:
          'La fecha de entrega debe tener formato AAAA-MM-DD.',
      });
      return;
    }

    // Exigir el comprobante digital
    if (!req.file) {
      res.status(400).json({
        mensaje:
          'Debes adjuntar una fotografía o PDF del comprobante.',
      });
      return;
    }

    const usuarioId = res.locals.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({
        mensaje: 'Usuario no autenticado.',
      });
      return;
    }

    let cliente: PoolClient | undefined;
    let rutaGuardada: string | null = null;
    let confirmado = false;

    try {
      cliente = await pool.connect();

      await cliente.query('BEGIN');

      // Consultar y bloquear documento
      const consulta = await cliente.query(
        `SELECT
           id,
           tipo,
           estado,
           fecha_salida,
           (fecha_salida <= $2::date)
             AS fecha_consistente
         FROM public.correspondencia
         WHERE id = $1
         FOR UPDATE`,
        [id, fecha_entrega]
      );

      const documento = consulta.rows[0];

      if (!documento) {
        res.status(404).json({
          mensaje: 'Documento no encontrado.',
        });
        return;
      }

      // Solo expedidos en estado enviado
      if (
        documento.tipo !== 'expedida' ||
        documento.estado !== 'enviado'
      ) {
        res.status(409).json({
          mensaje:
            'El documento debe ser expedido y estar en estado enviado.',
        });
        return;
      }

      // Validar orden de fechas
      if (!documento.fecha_consistente) {
        res.status(400).json({
          mensaje:
            'La fecha de entrega no puede ser anterior a la fecha de salida.',
        });
        return;
      }

      // Guardar archivo privado
      rutaGuardada = await guardarArchivo(req.file);

      // Cambiar documento a entregado
      const actualizado = await cliente.query(
        `UPDATE public.correspondencia
         SET
           estado = 'entregado',
           fecha_entrega = $1,
           tipo_constancia = $2,
           archivo_constancia_path = $3
         WHERE id = $4
         RETURNING *`,
        [
          fecha_entrega,
          tipo_constancia,
          rutaGuardada,
          id,
        ]
      );

      // Guardar historial del cambio
      await cliente.query(
        `INSERT INTO public.seguimiento_correspondencia (
          correspondencia_id,
          estado_anterior,
          estado_nuevo,
          comentario,
          usuario_id
        )
        VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          documento.estado,
          'entregado',
          `Entrega confirmada mediante ${tipo_constancia}`,
          usuarioId,
        ]
      );

      // Confirmar cambios en PostgreSQL
      await cliente.query('COMMIT');

      confirmado = true;

      res.json({
        mensaje:
          'Entrega y constancia registradas correctamente.',
        documento: actualizado.rows[0],
      });

    } catch (error) {
      console.error(
        'Error al registrar constancia:',
        error
      );

      if (cliente && !confirmado) {
        try {
          await cliente.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            'Error al revertir constancia:',
            rollbackError
          );
        }
      }

      const archivoInvalido =
        error instanceof Error &&
        error.message.startsWith(
          'El contenido del archivo no coincide'
        );

      res.status(archivoInvalido ? 400 : 500).json({
        mensaje: archivoInvalido
          ? 'El contenido del archivo no es válido.'
          : 'No se pudo registrar la constancia.',
      });

    } finally {
      // Revertir transacción en salidas anticipadas
      if (cliente) {
        if (!confirmado) {
          try {
            await cliente.query('ROLLBACK');
          } catch (error) {
            console.error(
              'Error al finalizar transacción:',
              error
            );
          }
        }

        cliente.release();
      }

      // Limpiar archivo si no se completó el registro
      if (!confirmado && rutaGuardada) {
        try {
          await unlink(
            path.resolve(
              process.cwd(),
              'uploads',
              rutaGuardada
            )
          );
        } catch (error) {
          console.error(
            'Error al limpiar archivo:',
            error
          );
        }
      }
    }
  }
);


/* ==========================================
   5. DESCARGAR CONSTANCIA DE RECEPCIÓN
   GET /api/correspondencia/:id/constancia
   ========================================== */

router.get('/:id/constancia', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({
      mensaje: 'ID de documento inválido.',
    });
    return;
  }

  try {
    // Buscar el comprobante en PostgreSQL
    const resultado = await pool.query(
      `SELECT archivo_constancia_path
       FROM public.correspondencia
       WHERE id = $1
         AND tipo = 'expedida'
         AND estado = 'entregado'`,
      [id]
    );

    const documento = resultado.rows[0];

    if (!documento || !documento.archivo_constancia_path) {
      res.status(404).json({
        mensaje: 'No se encontró la constancia.',
      });
      return;
    }

    const rutaRelativa: string =
      documento.archivo_constancia_path;

    // Aceptar únicamente archivos generados por nuestro sistema
    const patronSeguro =
      /^correspondencia\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/i;

    if (!patronSeguro.test(rutaRelativa)) {
      res.status(500).json({
        mensaje: 'La ruta del comprobante no es válida.',
      });
      return;
    }

    const rutaCompleta = path.resolve(
      process.cwd(),
      'uploads',
      rutaRelativa
    );

    const extension = path.extname(rutaCompleta).toLowerCase();

    const tipos: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
    };

    let contenido: Buffer;

    try {
      contenido = await readFile(rutaCompleta);
    } catch (error) {
      console.error('Error al leer comprobante:', error);

      res.status(404).json({
        mensaje: 'El archivo no está disponible.',
      });
      return;
    }

    // Evitar almacenar copias en cachés compartidas
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="constancia-${id}${extension}"`
    );

    
    const tipoContenido = tipos[extension];

    if (!tipoContenido) {
      res.status(500).json({
        mensaje: 'Formato de comprobante no admitido.',
      });
      return;
    }

    res.type(tipoContenido);
    res.send(contenido);


  } catch (error) {
    console.error('Error al descargar constancia:', error);

    res.status(500).json({
      mensaje: 'No se pudo descargar la constancia.',
    });
  }
});


// ========================================
// 6. CONSULTAR HISTORIAL DE DOCUMENTO
// GET /api/correspondencia/:id/historial
// ========================================

router.get('/:id/historial', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({
      mensaje: 'ID de documento inválido.',
    });
    return;
  }

  try {
    // Primero comprobar que exista el documento
    const documento = await pool.query(
      `SELECT id, tipo, referencia, estado
       FROM public.correspondencia
       WHERE id = $1`,
      [id]
    );

    if (documento.rows.length === 0) {
      res.status(404).json({
        mensaje: 'Documento no encontrado.',
      });
      return;
    }

    // Consultar todos los cambios realizados
    const resultado = await pool.query(
      `SELECT
         s.id,
         s.correspondencia_id,
         s.estado_anterior,
         s.estado_nuevo,
         s.comentario,
         s.fecha_seguimiento,
         p.nombre_completo AS realizado_por
       FROM public.seguimiento_correspondencia s
       JOIN public.perfiles p
         ON p.id = s.usuario_id
       WHERE s.correspondencia_id = $1
       ORDER BY s.fecha_seguimiento ASC, s.id ASC`,
      [id]
    );

    res.json({
      documento: documento.rows[0],
      cantidad: resultado.rows.length,
      historial: resultado.rows,
    });

  } catch (error) {
    console.error(
      'Error al consultar historial:',
      error
    );

    res.status(500).json({
      mensaje: 'No se pudo consultar el historial.',
    });
  }
});

/* ==========================================
   7. VINCULAR DOCUMENTO CON SU RESPUESTA
   POST /api/correspondencia/:id/respuesta
   ========================================== */

router.post('/:id/respuesta', async (req, res) => {
  const documentoOrigenId = Number(req.params.id);
  const documentoRespuestaId = req.body?.documento_respuesta_id;

  // Validar identificadores
  if (
    !Number.isSafeInteger(documentoOrigenId) ||
    documentoOrigenId <= 0 ||
    !Number.isSafeInteger(documentoRespuestaId) ||
    documentoRespuestaId <= 0
  ) {
    res.status(400).json({
      mensaje: 'Los identificadores deben ser números válidos.',
    });
    return;
  }

  if (documentoOrigenId === documentoRespuestaId) {
    res.status(400).json({
      mensaje: 'Un documento no puede responderse a sí mismo.',
    });
    return;
  }

  let cliente: PoolClient | undefined;

  try {
    cliente = await pool.connect();
    await cliente.query('BEGIN');

    // Consultar ambos documentos
    const resultado = await cliente.query(
      `SELECT id, tipo, estado
       FROM public.correspondencia
       WHERE id IN ($1, $2)
       ORDER BY id
       FOR UPDATE`,
      [documentoOrigenId, documentoRespuestaId]
    );

    const origen = resultado.rows.find(
      (fila) => String(fila.id) === String(documentoOrigenId)
    );

    const respuesta = resultado.rows.find(
      (fila) => String(fila.id) === String(documentoRespuestaId)
    );


    // Comprobar que existan
    if (!origen || !respuesta) {
      res.status(404).json({
        mensaje: 'Uno o ambos documentos no existen.',
      });
      return;
    }

    // Verificar tipos
    if (
      origen.tipo !== 'recibida' ||
      respuesta.tipo !== 'expedida'
    ) {
      res.status(400).json({
        mensaje:
          'El documento de origen debe ser recibido y la respuesta debe ser expedida.',
      });
      return;
    }

    // Evitar vincular nuevamente la misma respuesta
    const existente = await cliente.query(
      `SELECT id
       FROM public.respuestas_correspondencia
       WHERE documento_respuesta_id = $1`,
      [documentoRespuestaId]
    );

    if (existente.rows.length > 0) {
      res.status(409).json({
        mensaje:
          'Este documento expedido ya está vinculado como respuesta.',
      });
      return;
    }

    // Registrar la relación
    const vinculacion = await cliente.query(
      `INSERT INTO public.respuestas_correspondencia (
        documento_origen_id,
        documento_respuesta_id
      )
      VALUES ($1, $2)
      RETURNING *`,
      [documentoOrigenId, documentoRespuestaId]
    );

    await cliente.query('COMMIT');

    res.status(201).json({
      mensaje: 'Respuesta vinculada correctamente.',
      vinculacion: vinculacion.rows[0],
    });

  } catch (error) {
    console.error('Error al vincular respuesta:', error);

    res.status(500).json({
      mensaje: 'No se pudo vincular la respuesta.',
    });

  } finally {
    if (cliente) {
      // Si COMMIT ya ocurrió, ROLLBACK no altera lo confirmado.
      // Si no ocurrió, libera cualquier transacción pendiente.
      try {
        await cliente.query('ROLLBACK');
      } catch (error) {
        console.error('Error al cerrar transacción:', error);
      }

      cliente.release();
    }
  }
});

// ========================================
// 8. CONSULTAR DOCUMENTOS RELACIONADOS
// GET /api/correspondencia/:id/respuestas
// ========================================

router.get('/:id/respuestas', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({
      mensaje: 'ID de documento inválido.',
    });
    return;
  }

  try {
    const documento = await pool.query(
      `SELECT id, tipo, referencia, estado
       FROM public.correspondencia
       WHERE id = $1`,
      [id]
    );

    if (documento.rows.length === 0) {
      res.status(404).json({
        mensaje: 'Documento no encontrado.',
      });
      return;
    }

    const relacionados = await pool.query(
      `SELECT
         r.id AS vinculacion_id,
         r.fecha_vinculacion,
         c.id,
         c.tipo,
         c.referencia,
         c.estado,
         c.gestion,
         c.numero_correlativo
       FROM public.respuestas_correspondencia r
       JOIN public.correspondencia c
         ON c.id = CASE
           WHEN r.documento_origen_id = $1::integer
             THEN r.documento_respuesta_id
           ELSE r.documento_origen_id
         END
       WHERE r.documento_origen_id = $1
          OR r.documento_respuesta_id = $1
       ORDER BY r.fecha_vinculacion DESC, r.id DESC`,
      [id]
    );

    res.json({
      documento: documento.rows[0],
      cantidad: relacionados.rows.length,
      relacionados: relacionados.rows,
    });

  } catch (error) {
    console.error('Error al consultar relaciones:', error);

    res.status(500).json({
      mensaje: 'No se pudieron consultar los documentos relacionados.',
    });
  }
});


// ========================================
// 9. ADJUNTAR ARCHIVO ORIGINAL DEL OFICIO
// POST /api/correspondencia/:id/archivo
// ========================================

router.post(
  '/:id/archivo',

  // Recibir archivo con Multer
  (req, res, next) => {
    subirOficio(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        res.status(
          error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
        ).json({
          mensaje:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'El archivo supera los 5 MB.'
              : 'Error al recibir el archivo.',
        });
        return;
      }

      if (error) {
        res.status(400).json({
          mensaje: 'Solo se permiten PDF, JPG y PNG.',
        });
        return;
      }

      next();
    });
  },

  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({
        mensaje: 'ID de documento inválido.',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        mensaje: 'Debes seleccionar un archivo.',
      });
      return;
    }

    const usuarioId = res.locals.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({
        mensaje: 'Usuario no autenticado.',
      });
      return;
    }

    let cliente: PoolClient | undefined;
    let rutaGuardada: string | null = null;
    let confirmado = false;

    try {
      cliente = await pool.connect();
      await cliente.query('BEGIN');

      // Bloquear el documento para evitar cambios simultáneos
      const consulta = await cliente.query(
        `SELECT id, archivo_path
         FROM public.correspondencia
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (consulta.rows.length === 0) {
        res.status(404).json({
          mensaje: 'Documento no encontrado.',
        });
        return;
      }

      // No reemplazar archivos automáticamente
      if (consulta.rows[0].archivo_path) {
        res.status(409).json({
          mensaje: 'Este documento ya tiene un archivo adjunto.',
        });
        return;
      }

      // Guardar archivo en carpeta privada
      rutaGuardada = await guardarArchivo(req.file);

      // Asociar archivo al documento
      const resultado = await cliente.query(
        `UPDATE public.correspondencia
         SET archivo_path = $1
         WHERE id = $2
         RETURNING id, tipo, referencia,
                   estado, archivo_path`,
        [rutaGuardada, id]
      );

      await cliente.query('COMMIT');
      confirmado = true;

      res.status(201).json({
        mensaje: 'Archivo del oficio guardado correctamente.',
        documento: resultado.rows[0],
      });

    } catch (error) {
      console.error('Error al guardar oficio:', error);

      const archivoInvalido =
        error instanceof Error &&
        error.message.startsWith(
          'El contenido del archivo no coincide'
        );

      if (!res.headersSent) {
        res.status(archivoInvalido ? 400 : 500).json({
          mensaje: archivoInvalido
            ? 'El archivo no tiene un formato válido.'
            : 'No se pudo guardar el archivo del oficio.',
        });
      }

    } finally {
      // Revertir cambios si la operación no se completó
      if (cliente) {
        if (!confirmado) {
          try {
            await cliente.query('ROLLBACK');
          } catch (error) {
            console.error('Error al revertir operación:', error);
          }
        }

        cliente.release();
      }

      // Eliminar archivo si falló el registro
      if (!confirmado && rutaGuardada) {
        try {
          await unlink(
            path.resolve(
              process.cwd(),
              'uploads',
              rutaGuardada
            )
          );
        } catch (error) {
          console.error(
            'No se pudo limpiar el archivo:',
            error
          );
        }
      }
    }
  }
);

// ========================================
// 10. DESCARGAR ARCHIVO ORIGINAL DEL OFICIO
// GET /api/correspondencia/:id/archivo
// ========================================

router.get('/:id/archivo', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({
      mensaje: 'ID del documento inválido.',
    });
    return;
  }

  try {
    // Buscar la ruta del archivo en PostgreSQL
    const resultado = await pool.query(
      `SELECT id, archivo_path
       FROM public.correspondencia
       WHERE id = $1`,
      [id]
    );

    const documento = resultado.rows[0];

    if (!documento) {
      res.status(404).json({
        mensaje: 'Documento no encontrado.',
      });
      return;
    }

    if (!documento.archivo_path) {
      res.status(404).json({
        mensaje: 'El documento no tiene archivo adjunto.',
      });
      return;
    }

    const rutaRelativa: string = documento.archivo_path;

    // Aceptar únicamente rutas generadas por el SGC
    const patronSeguro =
      /^correspondencia\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/i;

    if (!patronSeguro.test(rutaRelativa)) {
      res.status(500).json({
        mensaje: 'La ruta del archivo no es válida.',
      });
      return;
    }

    const rutaCompleta = path.resolve(
      process.cwd(),
      'uploads',
      rutaRelativa
    );

    const extension = path.extname(rutaCompleta).toLowerCase();

    const tipos: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
    };

    const tipoContenido = tipos[extension];

    if (!tipoContenido) {
      res.status(500).json({
        mensaje: 'Formato de archivo no admitido.',
      });
      return;
    }

    let contenido: Buffer;

    try {
      contenido = await readFile(rutaCompleta);
    } catch (error) {
      console.error('Error al leer archivo:', error);

      res.status(404).json({
        mensaje: 'El archivo no está disponible.',
      });
      return;
    }

    // Evitar almacenamiento en caché
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Forzar descarga del archivo
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="oficio-${id}${extension}"`
    );

    res.type(tipoContenido);
    res.send(contenido);

  } catch (error) {
    console.error(
      'Error al descargar archivo del oficio:',
      error
    );

    res.status(500).json({
      mensaje: 'No se pudo descargar el archivo.',
    });
  }
});






export default router;
