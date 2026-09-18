package ni.com.incasa.pesaje.catalogo;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** Área de planta: sirve como área de PROCESO y como área de DESTINO de una producción. */
@Entity
@Table(name = "area")
public class Area extends ElementoCatalogo { }
