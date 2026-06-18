// src/utils/licenseGuard.js
// Fonte única das regras de bloqueio/licença usadas pelo login, navegação e interceptor.

const BLOCKED_WORDS = [
  "bloqueado", "bloqueada", "suspenso", "suspensa", "inativo", "inativa",
  "desativado", "desativada", "blocked", "suspended", "disabled",
];
const EXPIRED_WORDS = [
  "vencido", "vencida", "expirado", "expirada", "licença vencida", "licenca vencida",
  "assinatura vencida", "plano vencido", "inadimplente", "expired",
];

export const ACCESS_CODES = {
  RESTAURANTE_BLOQUEADO: "RESTAURANTE_BLOQUEADO",
  LICENCA_VENCIDA: "LICENCA_VENCIDA",
  GARCOM_DESATIVADO: "GARCOM_DESATIVADO",
};

export const RESTAURANTE_BLOQUEADO_MSG = "Restaurante bloqueado. Entre em contato com o suporte Movyo.";
export const LICENCA_VENCIDA_MSG = "Licença vencida. Regularize o plano para continuar usando o Movyo.";
export const GARCOM_DESATIVADO_MSG = "Seu acesso foi desativado. Fale com o gerente do restaurante.";

function text(v) {
  return String(v ?? "").trim().toLowerCase();
}

function boolTrue(v) {
  if (v === true) return true;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") return ["true", "1", "sim", "yes", "bloqueado", "suspenso"].includes(text(v));
  return false;
}

function boolFalse(v) {
  if (v === false) return true;
  if (typeof v === "number") return v === 0;
  if (typeof v === "string") return ["false", "0", "nao", "não", "inativo", "desativado"].includes(text(v));
  return false;
}

export function parseAccessDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  // Datas sem horário são interpretadas no fuso local até o fim do dia.
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const isoOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoOnly) {
    const d = new Date(Number(isoOnly[1]), Number(isoOnly[2]) - 1, Number(isoOnly[3]), 23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.\d+)?Z$/i);
  if (isoPrefix) {
    const d = new Date(Number(isoPrefix[1]), Number(isoPrefix[2]) - 1, Number(isoPrefix[3]), 23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isExpiredDate(dateLike) {
  const d = parseAccessDate(dateLike);
  if (!d) return false;
  return d.getTime() < Date.now();
}

export function pickRestauranteFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  return (
    payload.restaurante ||
    payload.restaurant ||
    payload.empresa ||
    payload.loja ||
    payload.data?.restaurante ||
    payload.data?.restaurant ||
    payload.garcom?.restaurante ||
    payload.usuario?.restaurante ||
    null
  );
}

export function isRestauranteBloqueado(restaurante = {}) {
  const r = restaurante || {};
  if (boolTrue(r.bloqueado ?? r.blocked ?? r.suspenso ?? r.suspended)) return true;
  if (boolFalse(r.ativo ?? r.active ?? r.habilitado ?? r.enabled)) return true;

  const statusFields = [r.status, r.statusConta, r.statusSistema, r.statusRestaurante, r.situacao, r.situacaoConta];
  return statusFields.some((v) => BLOCKED_WORDS.some((word) => text(v) === word || text(v).includes(word)));
}

export function isLicencaVencida(restaurante = {}) {
  const r = restaurante || {};
  const statusFields = [r.statusAssinatura, r.statusPlano, r.statusLicenca, r.statusLicença, r.planoStatus, r.assinaturaStatus];
  if (statusFields.some((v) => EXPIRED_WORDS.some((word) => text(v) === word || text(v).includes(word)))) return true;

  const dateFields = [
    r.dataFimPlano, r.dataVencimentoPlano, r.vencimentoPlano, r.vencimento,
    r.licencaAte, r.licençaAte, r.licencaValidaAte, r.licençaValidaAte,
    r.validadePlano, r.validade, r.assinaturaAte, r.expiresAt,
  ];
  return dateFields.some(isExpiredDate);
}

export function getRestauranteAccessBlockInfo(restaurante) {
  if (!restaurante || typeof restaurante !== "object") return null;
  if (isRestauranteBloqueado(restaurante)) {
    return { code: ACCESS_CODES.RESTAURANTE_BLOQUEADO, message: RESTAURANTE_BLOQUEADO_MSG, reason: "blocked" };
  }
  if (isLicencaVencida(restaurante)) {
    return { code: ACCESS_CODES.LICENCA_VENCIDA, message: LICENCA_VENCIDA_MSG, reason: "expired", restauranteId: restaurante?._id || restaurante?.id || restaurante?.restauranteId || restaurante?.assinaturaCobranca?.restauranteId || null, assinaturaCobranca: restaurante?.assinaturaCobranca || null };
  }
  return null;
}

export function getRestauranteAccessBlockMessage(restaurante) {
  return getRestauranteAccessBlockInfo(restaurante)?.message || null;
}

export function getAuthBlockInfoFromError(err) {
  const data = err?.response?.data || {};
  const code = String(data?.code || data?.codigo || "").trim().toUpperCase();
  const msg = data?.message || data?.mensagem || data?.error || data?.erro || err?.message || "";
  const s = text(msg);

  if (code === ACCESS_CODES.LICENCA_VENCIDA) {
    return { code, message: LICENCA_VENCIDA_MSG, reason: "expired", restauranteId: data?.restauranteId || data?.assinaturaCobranca?.restauranteId || null, assinaturaCobranca: data?.assinaturaCobranca || null };
  }
  if (code === ACCESS_CODES.RESTAURANTE_BLOQUEADO) {
    return { code, message: RESTAURANTE_BLOQUEADO_MSG, reason: "blocked" };
  }
  if (code === ACCESS_CODES.GARCOM_DESATIVADO || s.includes("garçom desativado") || s.includes("garcom desativado") || s.includes("seu acesso foi desativado")) {
    return { code: ACCESS_CODES.GARCOM_DESATIVADO, message: GARCOM_DESATIVADO_MSG, reason: "user_disabled" };
  }

  if ((s.includes("licen") || s.includes("assinatura") || s.includes("plano")) && (s.includes("venc") || s.includes("expir"))) {
    return { code: ACCESS_CODES.LICENCA_VENCIDA, message: LICENCA_VENCIDA_MSG, reason: "expired", restauranteId: data?.restauranteId || data?.assinaturaCobranca?.restauranteId || null, assinaturaCobranca: data?.assinaturaCobranca || null };
  }
  if (EXPIRED_WORDS.some((word) => s.includes(word))) {
    return { code: ACCESS_CODES.LICENCA_VENCIDA, message: LICENCA_VENCIDA_MSG, reason: "expired", restauranteId: data?.restauranteId || data?.assinaturaCobranca?.restauranteId || null, assinaturaCobranca: data?.assinaturaCobranca || null };
  }

  if (s.includes("restaurante bloque") || s.includes("restaurante desativ") || s.includes("restaurante inativ") || s.includes("conta bloque")) {
    return { code: ACCESS_CODES.RESTAURANTE_BLOQUEADO, message: RESTAURANTE_BLOQUEADO_MSG, reason: "blocked" };
  }

  const restaurante = pickRestauranteFromPayload(data);
  return getRestauranteAccessBlockInfo(restaurante);
}

export function getAuthBlockMessageFromError(err) {
  return getAuthBlockInfoFromError(err)?.message || null;
}
