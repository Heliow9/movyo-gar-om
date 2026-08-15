function normalizeOrderCount(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

const INTERNAL_ORDER_PREFIXES = new Set(["BK", "BT", "IF", "SL", "MS", "99F"]);

function parseOrderSequence(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/^#/, "");
  const match = raw.match(/^([A-Z0-9]*?[A-Z][A-Z0-9]*?)(\d+)$/);
  if (!match || !INTERNAL_ORDER_PREFIXES.has(match[1])) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { code: raw, prefix: match[1], number };
}

function isOrderSequenceMilestone(value) {
  const number = normalizeOrderCount(value);
  if (!number) return false;
  if (number <= 500) return number >= 100 && number % 100 === 0;
  if (number <= 3000) return number % 500 === 0;
  return number % 1000 === 0;
}

function getOrderSequenceMilestone(pedido = {}) {
  const sequence = parseOrderSequence(
    pedido?.numeroPedido ?? pedido?.numero ?? pedido?.codigoPedido ?? pedido?.codigo
  );
  return sequence && isOrderSequenceMilestone(sequence.number) ? sequence : null;
}

module.exports = {
  getOrderSequenceMilestone,
  isOrderSequenceMilestone,
  normalizeOrderCount,
  parseOrderSequence,
};
