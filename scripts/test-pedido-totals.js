const assert = require("node:assert/strict");
const {
  pickPedidoItems,
  pickPedidoTotal,
  toMoneyNumber,
} = require("../src/utils/pedidoTotals");

const ativoComValorCanceladoZero = {
  status: "em_producao",
  total: 20,
  valorTotal: 20,
  valorCancelado: 0,
  itens: [{ quantidade: 2, precoUnitario: 10, precoTotal: 20 }],
};
assert.equal(pickPedidoTotal(ativoComValorCanceladoZero), 20);

const ativoComTotalInconsistente = {
  status: "em_producao",
  total: 0,
  valorCancelado: 0,
  itens: [{ quantidade: 2, precoUnitario: 10 }],
};
assert.equal(pickPedidoTotal(ativoComTotalInconsistente), 20);

const canceladoComSnapshot = {
  status: "cancelado",
  total: 0,
  valorTotal: 0,
  valorCancelado: 6,
  itens: [],
  pedidoOriginalSnapshot: {
    total: 6,
    valorTotal: 6,
    itens: [{ quantidade: 1, precoUnitario: 6, precoTotal: 6 }],
  },
};
assert.equal(pickPedidoTotal(canceladoComSnapshot), 6);
assert.equal(pickPedidoItems(canceladoComSnapshot).length, 1);
assert.equal(pickPedidoItems(canceladoComSnapshot)[0]._cancelado, true);

const cancelamentoParcial = {
  status: "pendente",
  total: 14,
  valorCancelado: 6,
  itens: [{ nome: "Item atual", quantidade: 1, precoTotal: 14 }],
  itensCancelados: [{
    item: { nome: "Item cancelado", quantidade: 1, precoTotal: 6 },
    valorCancelado: 6,
  }],
};
assert.equal(pickPedidoTotal(cancelamentoParcial), 14);
assert.equal(pickPedidoItems(cancelamentoParcial).length, 2);
assert.equal(pickPedidoItems(cancelamentoParcial)[1]._cancelado, true);

assert.equal(toMoneyNumber("R$ 1.234,56"), 1234.56);
assert.equal(toMoneyNumber("20.00"), 20);

const pedidosDaImagem = [
  { ...ativoComValorCanceladoZero, total: 20 },
  { ...ativoComValorCanceladoZero, total: 25, valorTotal: 25 },
  canceladoComSnapshot,
];
assert.equal(
  pedidosDaImagem.reduce((total, pedido) => total + pickPedidoTotal(pedido), 0),
  51
);

console.log("pedidoTotals: todos os cenarios passaram.");
