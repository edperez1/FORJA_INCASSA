package ni.com.incasa.pesaje.catalogo;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** Lo que se fabrica con la bobina: clavos, alambre dulce, de púas, malla… */
@Entity
@Table(name = "producto")
public class Producto extends ElementoCatalogo { }
