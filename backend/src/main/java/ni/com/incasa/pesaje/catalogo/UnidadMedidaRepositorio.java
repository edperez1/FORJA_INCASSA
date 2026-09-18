package ni.com.incasa.pesaje.catalogo;

public interface UnidadMedidaRepositorio extends CatalogoRepositorio<UnidadMedida> {

    boolean existsByCodigoIgnoreCase(String codigo);

    boolean existsByCodigoIgnoreCaseAndIdNot(String codigo, Long id);
}
