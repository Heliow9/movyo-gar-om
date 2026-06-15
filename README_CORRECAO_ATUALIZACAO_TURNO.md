# Correção - pedidos por turno, fila/status e ranking

Arquivos principais alterados no Hub:
- src/screens/HomeScreen.js
- src/screens/PedidosScreen.js

Correções:
- Chamadas de resumo e pedidos com `fresh=1` e `_t=Date.now()`.
- Home escuta eventos extras da API e atualiza cards/ranking sem depender de reabrir o app.
- Pedidos/Fila e Status escuta eventos extras da API.
- Card de turno passa a usar `vendasLancadasHojeGarcom` quando a API retorna esse campo, atualizando ao lançar pedido, não apenas após pagamento.
