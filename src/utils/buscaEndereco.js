// Busca simples sem Mapbox/token.
// Mantém compatibilidade com telas antigas sem expor segredo no GitHub.
export async function buscarEndereco(enderecoParcial) {
  const texto = String(enderecoParcial || "").trim();
  if (!texto || texto.length < 5) return null;

  return {
    latitude: null,
    longitude: null,
    cep: "",
    bairro: "",
  };
}

export default buscarEndereco;
