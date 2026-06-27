const PLAN_ALIASES = {
  free: "free",
  trial: "free",
  teste: "free",
  start: "starter-mobile",
  starter: "starter-mobile",
  "start-mobile": "starter-mobile",
  "starter-mobile": "starter-mobile",
  essencial: "essencial",
  essential: "essencial",
  profissional: "professional",
  professional: "professional",
  pro: "professional",
  premium: "premium",
  full: "full",
};

export const PLAN_ORDER = {
  free: 0,
  "starter-mobile": 1,
  essencial: 2,
  professional: 3,
  premium: 4,
  full: 99,
};

export const PLAN_FEATURES = {
  hub: { label: "App Movyo Hub", minPlan: "starter-mobile" },
  tables: { label: "Mesas e comandas", minPlan: "starter-mobile" },
  counter: { label: "Pedidos no balcao", minPlan: "starter-mobile" },
  cashRegister: { label: "Frente de caixa", minPlan: "starter-mobile" },
  basicSalesView: { label: "Visao basica das vendas", minPlan: "starter-mobile" },
  digitalMenu: { label: "Cardapio digital personalizado", minPlan: "essencial" },
  delivery: { label: "Delivery, balcao e mesas", minPlan: "essencial" },
  onlinePayments: { label: "PIX e cartao no cardapio", minPlan: "essencial" },
  autoPrint: { label: "Impressao automatica", minPlan: "essencial" },
  salesReports: { label: "Relatorios de vendas", minPlan: "essencial" },
  whatsappBot: { label: "Robo no WhatsApp", minPlan: "professional" },
  inventory: { label: "Controle de estoque", minPlan: "professional" },
  recipes: { label: "Receitas e baixa automatica", minPlan: "professional" },
  production: { label: "Tela de producao", minPlan: "professional" },
  advancedReports: { label: "Relatorios avancados", minPlan: "professional" },
  driversApp: { label: "App motorista/entregador", minPlan: "premium" },
  deliveryManagement: { label: "Gestao completa das entregas", minPlan: "premium" },
  realtimeIndicators: { label: "Indicadores em tempo real", minPlan: "premium" },
  audit: { label: "Auditoria de operadores", minPlan: "premium" },
  managementReports: { label: "Relatorios gerenciais completos", minPlan: "premium" },
  unlimitedUsers: { label: "Usuarios ilimitados", minPlan: "premium" },
};

export function normalizePlanCode(value) {
  const key = String(value || "free")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-");
  return PLAN_ALIASES[key] || "free";
}

function isTrialStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  return value === "teste" || value === "trial" || value === "free";
}

export function getEffectivePlanCode(restaurante = {}) {
  const effectiveFromApi = restaurante?.planoInfo?.efetivoCodigo || restaurante?.planoInfo?.effectiveCode;
  if (effectiveFromApi) return normalizePlanCode(effectiveFromApi);
  const declared = normalizePlanCode(restaurante?.plano || restaurante?.plan || restaurante?.codigo);
  if (declared === "full") return "full";
  if (declared === "free" || isTrialStatus(restaurante?.statusAssinatura || restaurante?.statusPlano)) {
    return "professional";
  }
  return declared;
}

export function hasPlanFeature(restaurante = {}, featureKey) {
  const feature = PLAN_FEATURES[featureKey];
  if (!feature) return false;
  return (PLAN_ORDER[getEffectivePlanCode(restaurante)] || 0) >= (PLAN_ORDER[feature.minPlan] || 0);
}
