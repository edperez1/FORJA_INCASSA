package ni.com.incasa.pesaje.catalogo;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** Tipo de bobina / materia prima que entra al proceso. */
@Entity
@Table(name = "materia")
public class Materia extends ElementoCatalogo { }
