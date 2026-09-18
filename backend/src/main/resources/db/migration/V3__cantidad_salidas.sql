-- ============================================================================
--  V3 · Cantidad de las salidas existentes y su restricción
-- ============================================================================

-- Las salidas registradas antes de V2 se completan con su neto cuando la
-- unidad de la producción es kg; las demás quedan sin cantidad.
UPDATE pesaje
   SET cantidad = peso_neto
 WHERE tipo = 'SALIDA'
   AND produccion_id IN (SELECT pr.id
                           FROM produccion pr
                           JOIN unidad_medida u ON u.id = pr.unidad_id
                          WHERE u.codigo = 'kg');

-- Sólo las salidas llevan cantidad, y si la llevan es positiva.
ALTER TABLE pesaje ADD CONSTRAINT ck_pesaje_cantidad
    CHECK ((tipo = 'ENTRADA' AND cantidad IS NULL)
        OR (tipo = 'SALIDA' AND (cantidad IS NULL OR cantidad > 0)));
