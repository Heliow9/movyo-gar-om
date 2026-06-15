import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Platform,
  AppState,
  Modal,
  RefreshControl,
  useWindowDimensions,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { api, authEvents } from "../api/api";
import { clearSession, getSession, updateSessionRestaurantePatch } from "../api/storage/session";
import { getAuthBlockInfoFromError, getRestauranteAccessBlockInfo } from "../utils/licenseGuard";
import { connectSocket, getSocket, onSocketState } from "../socket/socket";
import { alertNovoPedido, requestNotificationPermission } from "../utils/pwaNotifications";

const TIPO_CATEGORIA = { SIMPLES: "simples", PIZZA: "pizza", PIZZA_DUAS: "pizza_duas" };
const MOCK_IMAGE = "https://cdn.pixabay.com/photo/2017/12/09/08/18/pizza-3007395_960_720.jpg";
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const onlyNumber = (v) => String(v || "").replace(/[^0-9.,-]/g, "").replace(",", ".");
const getId = (o) => o?._id || o?.id;

const normalizeText = (v) => String(v || "").trim().toLowerCase();
const isOrigemVitrineHub = (pedido = {}) => {
  const origem = normalizeText(pedido.origem || pedido.tipo || pedido.canal || pedido.source);
  return ["vitrine", "delivery", "site", "web", "online", "loja_online", "loja-online"].includes(origem);
};
const isStatusAReceberHub = (pedido = {}) => {
  const status = normalizeText(pedido.status || pedido.statusPedido);
  const statusPagamento = normalizeText(pedido.statusPagamento || pedido?.pagamento?.status);
  if (["cancelado", "cancelada", "canceled", "entregue", "concluido", "concluído", "finalizado"].includes(status)) return false;
  return ["", "novo", "pendente", "recebido", "pago", "aguardando", "aguardando_confirmacao", "aguardando confirmação"].includes(status) || statusPagamento === "pago";
};
const isPedidoAReceberHub = (pedido = {}) => isOrigemVitrineHub(pedido) && isStatusAReceberHub(pedido);
const getPedidoCodigoHub = (pedido = {}) => pedido.numeroPedido || pedido.numero || pedido.codigo || String(getId(pedido) || "").slice(-6);

const toLocalISODate = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const startOfMonthISO = () => {
  const d = new Date();
  d.setDate(1);
  return toLocalISODate(d);
};
const formatDateTimeBR = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const pedidoTime = (p = {}) => new Date(p.pagoEm || p.criadoEm || p.createdAt || p.created_at || 0).getTime() || 0;
const sortPedidosRecentes = (list = []) => [...list].sort((a, b) => pedidoTime(b) - pedidoTime(a));
const normalizeReport = (data) => ({
  tipo: data?.tipo || "data",
  resumo: {
    totalVendas: Number(data?.resumo?.totalVendas || 0),
    dinheiro: Number(data?.resumo?.dinheiro || 0),
    pix: Number(data?.resumo?.pix || 0),
    credito: Number(data?.resumo?.credito || 0),
    debito: Number(data?.resumo?.debito || 0),
    online: Number(data?.resumo?.online || 0),
    outros: Number(data?.resumo?.outros || 0),
    sangrias: Number(data?.resumo?.sangrias || 0),
    suprimentos: Number(data?.resumo?.suprimentos || 0),
    pedidos: Number(data?.resumo?.pedidos || 0),
    caixas: Number(data?.resumo?.caixas || 0),
  },
  linhas: Array.isArray(data?.linhas) ? data.linhas : [],
  caixas: Array.isArray(data?.caixas) ? data.caixas : [],
});

const LICENSE_DATE_FIELDS = [
  "dataFimPlano",
  "dataVencimentoPlano",
  "vencimentoPlano",
  "vencimento",
  "licencaAte",
  "licençaAte",
  "licencaValidaAte",
  "licençaValidaAte",
  "validadePlano",
  "validade",
  "assinaturaAte",
  "expiresAt",
];

const parseLicenseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  if (!raw) return null;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const d = new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]), 23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDateBR = (date) => {
  const d = date instanceof Date ? date : parseLicenseDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
};

const getLicenseInfo = (restaurante = {}) => {
  const values = LICENSE_DATE_FIELDS.map((field) => parseLicenseDate(restaurante?.[field])).filter(Boolean);
  const vencimento = values.length ? values.sort((a, b) => a.getTime() - b.getTime())[0] : null;

  if (!vencimento) {
    return {
      hasDate: false,
      daysLeft: null,
      title: "Licença sem vencimento informado",
      subtitle: "Não encontrei a data de vencimento no cadastro.",
      tone: "neutral",
      icon: "shield-checkmark-outline",
    };
  }

  const hoje = new Date();
  const hojeInicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const vencimentoInicio = new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate());
  const daysLeft = Math.ceil((vencimentoInicio.getTime() - hojeInicio.getTime()) / 86400000);

  if (daysLeft < 0) {
    return {
      hasDate: true,
      daysLeft,
      title: "Licença vencida",
      subtitle: `Venceu em ${formatDateBR(vencimento)}. Regularize para continuar usando o Movyo.`,
      tone: "danger",
      icon: "alert-circle-outline",
    };
  }

  if (daysLeft === 0) {
    return {
      hasDate: true,
      daysLeft,
      title: "Licença vence hoje",
      subtitle: "A licença expira hoje. Regularize para evitar bloqueio do acesso.",
      tone: "warning",
      icon: "time-outline",
    };
  }

  const warning = daysLeft <= 7;
  return {
    hasDate: true,
    daysLeft,
    title: `Faltam ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`,
    subtitle: `Licença válida até ${formatDateBR(vencimento)}.${warning ? " Renove em breve para evitar interrupção." : " Tudo certo por aqui."}`,
    tone: warning ? "warning" : "success",
    icon: warning ? "timer-outline" : "checkmark-circle-outline",
  };
};
const emptyProduto = () => ({ nome: "", descricao: "", precoBase: "", imagem: "", categoria: "", sabores: [], bordas: [], adicionais: [], complementos: [], extras: {}, receita: "", destaque: false, ativoVitrine: true, imprimir: true });
const emptyCategoria = () => ({ nome: "", tipoCategoria: TIPO_CATEGORIA.SIMPLES, permiteSabores: false, permiteBordas: false, permiteAdicionais: false, tiposExtras: [], pizzaMultisabor: false, calculoPrecoPor: "maior", ativa: true });
const emptyTipoExtra = () => ({ nome: "", obrigatorio: false, tipoSelecion: "unico", minimoSelecionados: "0", maximoSelecionados: "1", itens: [] });
const emptyItemPreco = () => ({ nome: "", preco: "" });
const DEFAULT_GARCOM_PERMS = { verPedidos: true, verMesas: true, abrirMesa: true, adicionarItem: true, fecharConta: false, cancelarPedido: false };
const emptyGarcom = () => ({ nome: "", apelido: "", telefone: "", pin: "1234", permissoes: { ...DEFAULT_GARCOM_PERMS } });
const DEFAULT_OPERATOR_PERMS = { abrirCaixa: true, fecharCaixa: true, movimentarCaixa: true, visualizarRelatorios: true, gerenciarOperadores: false };
const normalizeOperatorPerms = (perms) => ({ ...DEFAULT_OPERATOR_PERMS, ...(perms && typeof perms === "object" ? perms : {}) });
const emptyOperador = () => ({ nome: "", apelido: "", pin: "", observacao: "", ativo: true, permissoes: { ...DEFAULT_OPERATOR_PERMS } });
const normalizePerms = (perms) => ({ ...DEFAULT_GARCOM_PERMS, ...(perms && typeof perms === "object" ? perms : {}) });

function Card({ title, icon, children, action, subtitle }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <View style={styles.iconBubble}><Ionicons name={icon} size={18} color="#ff3b8a" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType = "default", secureTextEntry = false, multiline = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={String(value ?? "")}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function Button({ title, onPress, disabled, variant = "primary", icon }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, variant === "ghost" && styles.buttonGhost, variant === "danger" && styles.buttonDanger, disabled && { opacity: 0.55 }]}>
      {icon ? <Ionicons name={icon} size={17} color={variant === "ghost" ? "#334155" : "#fff"} /> : null}
      <Text style={[styles.buttonText, variant === "ghost" && styles.buttonGhostText]}>{title}</Text>
    </Pressable>
  );
}

function MiniButton({ title, onPress, danger = false, icon, disabled = false }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.miniButton, danger && styles.miniDanger, disabled && { opacity: 0.5 }]}>
      {icon ? <Ionicons name={icon} size={15} color={danger ? "#ef4444" : "#334155"} /> : null}
      <Text style={[styles.miniText, danger && styles.miniDangerText]}>{title}</Text>
    </Pressable>
  );
}

function Pill({ active, children, danger = false }) {
  return <View style={[styles.pill, active && styles.pillActive, danger && styles.pillDanger]}><Text style={[styles.pillText, active && styles.pillTextActive, danger && styles.pillTextDanger]}>{children}</Text></View>;
}

function ToggleLine({ label, value, onValueChange, hint }) {
  return (
    <View style={styles.toggleLine}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rememberText}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={!!value} onValueChange={onValueChange} />
    </View>
  );
}

function OptionChip({ label, active, onPress, icon }) {
  return (
    <Pressable onPress={onPress} style={[styles.optionChip, active && styles.optionChipActive]}>
      {icon ? <Ionicons name={icon} size={14} color={active ? "#fff" : "#64748b"} /> : null}
      <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SearchBox({ value, onChangeText, placeholder }) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search-outline" size={18} color="#94a3b8" />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94a3b8" style={styles.searchInput} />
    </View>
  );
}

export default function HubRestauranteScreen({ onLogout }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 760;
  const refreshDebounceRef = useRef(null);
  const lastDashboardRefreshRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLabel, setActionLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [session, setSession] = useState(null);
  const [rest, setRest] = useState({});
  const restauranteId = getId(rest) || getId(session?.restaurante);

  const [categorias, setCategorias] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [garcons, setGarcons] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const pedidosNotificadosRef = useRef(new Set());
  const [caixa, setCaixa] = useState(null);

  const [categoriaForm, setCategoriaForm] = useState(emptyCategoria());
  const [categoriaEditandoId, setCategoriaEditandoId] = useState(null);
  const [tipoExtraForm, setTipoExtraForm] = useState(emptyTipoExtra());
  const [tipoExtraItem, setTipoExtraItem] = useState(emptyItemPreco());
  const [categoriaBusca, setCategoriaBusca] = useState("");

  const [produtoForm, setProdutoForm] = useState(emptyProduto());
  const [produtoEditandoId, setProdutoEditandoId] = useState(null);
  const [produtoBusca, setProdutoBusca] = useState("");
  const [produtoFiltro, setProdutoFiltro] = useState("todos");
  const [tempInputs, setTempInputs] = useState({ sabores: emptyItemPreco(), bordas: emptyItemPreco(), adicionais: emptyItemPreco(), complementos: emptyItemPreco(), extras: {} });

  const [mesaNumero, setMesaNumero] = useState("");
  const [loteInicio, setLoteInicio] = useState("1");
  const [loteFim, setLoteFim] = useState("10");
  const [garcomForm, setGarcomForm] = useState(emptyGarcom());
  const [garcomEditandoId, setGarcomEditandoId] = useState(null);
  const [operadoresCaixa, setOperadoresCaixa] = useState([]);
  const [operadorForm, setOperadorForm] = useState(emptyOperador());
  const [operadorEditandoId, setOperadorEditandoId] = useState(null);
  const [caixaForm, setCaixaForm] = useState({ operadorId: "", pin: "", saldoInicial: "0", saldoFinalInformado: "0", observacao: "" });
  const [mpLoading, setMpLoading] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const [botQr, setBotQr] = useState("");
  const [botPolling, setBotPolling] = useState(false);
  const [botStatus, setBotStatus] = useState({ ligado: false, conectado: false, estado: "desconhecido", temQr: false, atualizadoEm: null, erroConexao: "" });
  const [dashboardResumo, setDashboardResumo] = useState({});
  const [todayReport, setTodayReport] = useState(() => normalizeReport(null));
  const [reportData, setReportData] = useState(() => normalizeReport(null));
  const [reportFilter, setReportFilter] = useState({ tipo: "data", inicio: startOfMonthISO(), fim: toLocalISODate() });
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [socketStatus, setSocketStatus] = useState({ connected: false, connecting: false });
  const [moreOpen, setMoreOpen] = useState(false);

  const planoSlug = String(rest?.plano || rest?.planoNome || rest?.assinatura?.plano || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const starterMobile = planoSlug.includes("starter") && planoSlug.includes("mobile");
  const garcomLimitReached = starterMobile && !garcomEditandoId && garcons.length >= 2;
  const operadoresAtivos = useMemo(() => operadoresCaixa.filter((o) => o?.ativo !== false), [operadoresCaixa]);
  const operadorAbertura = useMemo(() => operadoresCaixa.find((o) => String(getId(o)) === String(caixaForm.operadorId)), [operadoresCaixa, caixaForm.operadorId]);
  const operadorFechamento = useMemo(() => operadoresCaixa.find((o) => String(getId(o)) === String(caixa?.operadorId || caixa?.operadorCaixaId)), [operadoresCaixa, caixa]);
  const fechamentoExigePin = !!String(caixa?.operador?.pin || caixa?.operadorPin || operadorFechamento?.pin || "").trim();
  const aberturaExigePin = !!String(operadorAbertura?.pin || "").trim();

  const categoriaSelecionada = useMemo(() => categorias.find((c) => getId(c) === produtoForm.categoria), [categorias, produtoForm.categoria]);
  const pedidosAReceber = useMemo(() => pedidos.filter(isPedidoAReceberHub), [pedidos]);

  const resumo = useMemo(() => {
    const totalHoje = Number(todayReport?.resumo?.totalVendas || 0);
    const pedidosConfirmadosHoje = Number(todayReport?.resumo?.pedidos || 0);
    const pendentes = Number(dashboardResumo?.pedidosPendentes ?? dashboardResumo?.pedidosFila ?? 0);
    const mesasOcupadas = Number(dashboardResumo?.mesasAbertas ?? dashboardResumo?.mesasOcupadas ?? mesas.filter((m) => String(m.status || "").toLowerCase() !== "livre").length);
    return {
      totalHoje,
      pedidosConfirmadosHoje,
      ticketMedio: pedidosConfirmadosHoje > 0 ? totalHoje / pedidosConfirmadosHoje : 0,
      pendentes,
      aReceber: pedidosAReceber.length,
      mesasOcupadas,
    };
  }, [todayReport, dashboardResumo, pedidosAReceber.length, mesas]);

  const operationStatus = useMemo(() => ({
    online: networkOnline,
    socket: !!socketStatus.connected,
    caixa: caixa?.status === "aberto",
    loja: rest?.aberto !== false,
    mercadoPago: !!(rest?.mercadoPago?.conectado || rest?.mercadoPagoConectado || rest?.recipient_id),
    whatsapp: !!botStatus?.conectado,
  }), [networkOnline, socketStatus.connected, caixa, rest, botStatus]);

  const licenseInfo = useMemo(() => getLicenseInfo(rest), [rest]);

  const categoriasFiltradas = useMemo(() => {
    const q = categoriaBusca.trim().toLowerCase();
    return categorias.filter((cat) => !q || String(cat.nome || "").toLowerCase().includes(q));
  }, [categorias, categoriaBusca]);

  const produtosFiltrados = useMemo(() => {
    const q = produtoBusca.trim().toLowerCase();
    return produtos.filter((prod) => {
      const categoriaId = getId(prod.categoria) || prod.categoria;
      const cat = categorias.find((c) => getId(c) === categoriaId);
      const texto = `${prod.nome || ""} ${prod.descricao || ""} ${cat?.nome || ""}`.toLowerCase();
      const passaBusca = !q || texto.includes(q);
      const passaFiltro = produtoFiltro === "todos" || (produtoFiltro === "ativos" && prod.ativoVitrine !== false) || (produtoFiltro === "inativos" && prod.ativoVitrine === false) || (produtoFiltro === "destaques" && prod.destaque);
      return passaBusca && passaFiltro;
    });
  }, [produtos, categorias, produtoBusca, produtoFiltro]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const s = await getSession();
      setSession(s);
      const localBlock = getRestauranteAccessBlockInfo(s?.restaurante);
      if (localBlock) {
        authEvents.emit({ type: "AUTH_LOGOUT_REQUIRED", ...localBlock });
        return;
      }

      const me = await api.get("/api/restaurantes/me");
      const r = me.data?.restaurante || me.data || {};
      const remoteBlock = getRestauranteAccessBlockInfo(r);
      if (remoteBlock) {
        authEvents.emit({ type: "AUTH_LOGOUT_REQUIRED", ...remoteBlock });
        return;
      }

      setRest(r);
      await updateSessionRestaurantePatch(r);
      const id = getId(r) || getId(s?.restaurante);
      const today = toLocalISODate();

      const safeRequest = async (promise, fallback) => {
        try {
          return await promise;
        } catch (error) {
          const block = getAuthBlockInfoFromError(error);
          if (block) throw error;
          return fallback;
        }
      };

      const reqs = [
        safeRequest(api.get(`/api/categorias/${id}`), { data: [] }),
        safeRequest(api.get(`/api/produtos/${id}`), { data: [] }),
        safeRequest(api.get(`/api/mesas/restaurante/${id}`), { data: [] }),
        safeRequest(api.get("/api/garcons"), { data: [] }),
        safeRequest(api.get(`/api/garcons/app/pedidos?_t=${Date.now()}`), { data: [] }),
        safeRequest(api.get(`/api/caixa/${id}/atual`), { data: null }),
        safeRequest(api.get(`/api/caixa/${id}/operadores`), { data: [] }),
        safeRequest(api.get(`/api/mercadopago/status/${id}`), { data: null }),
        safeRequest(api.get(`/api/bot/status/${id}`), { data: null }),
        safeRequest(api.get(`/api/garcons/app/resumo?fresh=1&_t=${Date.now()}`), { data: {} }),
        safeRequest(api.get(`/api/caixa/${id}/relatorios?tipo=data&inicio=${today}&fim=${today}`), { data: null }),
      ];
      const [c, p, m, g, pe, cx, op, mp, bot, summary, reportToday] = await Promise.all(reqs);
      setCategorias(Array.isArray(c.data) ? c.data : c.data?.categorias || c.data?.items || []);
      setProdutos(Array.isArray(p.data) ? p.data : p.data?.produtos || p.data?.items || []);
      setMesas(Array.isArray(m.data) ? m.data : m.data?.mesas || m.data?.items || []);
      setGarcons((Array.isArray(g.data) ? g.data : g.data?.garcons || g.data?.items || []).map((item) => ({ ...item, permissoes: normalizePerms(item?.permissoes) })));
      setPedidos(sortPedidosRecentes(Array.isArray(pe.data) ? pe.data : pe.data?.pedidos || pe.data?.items || []));
      setCaixa(cx.data?.caixa || cx.data?.sessao || cx.data || null);
      setOperadoresCaixa((Array.isArray(op.data) ? op.data : op.data?.operadores || op.data?.items || []).map((item) => ({ ...item, permissoes: normalizeOperatorPerms(item?.permissoes) })));
      setDashboardResumo(summary.data || {});
      setTodayReport(normalizeReport(reportToday.data));
      if (mp.data) setRest((prev) => ({ ...prev, mercadoPago: { ...(prev?.mercadoPago || {}), ...mp.data } }));
      if (bot.data) setBotStatus(normalizarBotStatus(bot.data));
      setLastSyncAt(new Date());
    } catch (e) {
      const block = getAuthBlockInfoFromError(e);
      if (block) {
        authEvents.emit({ type: "AUTH_LOGOUT_REQUIRED", ...block });
        return;
      }
      Alert.alert("Não foi possível atualizar", e?.response?.data?.mensagem || e?.response?.data?.message || e.message || "Falha ao carregar o Hub.");
    } finally {
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const carregarRelatorio = useCallback(async (nextFilter = reportFilter) => {
    if (!restauranteId) return;
    const inicio = String(nextFilter?.inicio || "");
    const fim = String(nextFilter?.fim || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      setReportError("Informe o período no formato AAAA-MM-DD.");
      return;
    }
    if (inicio > fim) {
      setReportError("A data inicial não pode ser maior que a data final.");
      return;
    }

    setReportLoading(true);
    setReportError("");
    try {
      const tipo = ["data", "caixa", "operador"].includes(nextFilter?.tipo) ? nextFilter.tipo : "data";
      const { data } = await api.get(`/api/caixa/${restauranteId}/relatorios?tipo=${tipo}&inicio=${inicio}&fim=${fim}`);
      setReportData(normalizeReport(data));
    } catch (error) {
      const block = getAuthBlockInfoFromError(error);
      if (block) {
        authEvents.emit({ type: "AUTH_LOGOUT_REQUIRED", ...block });
        return;
      }
      setReportError(error?.response?.data?.message || error?.response?.data?.mensagem || "Não foi possível gerar o relatório.");
    } finally {
      setReportLoading(false);
    }
  }, [restauranteId, reportFilter]);

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setNetworkOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    const unsubscribeSocket = onSocketState(setSocketStatus);
    return () => {
      unsubscribeNet?.();
      unsubscribeSocket?.();
    };
  }, []);

  useEffect(() => {
    if (tab === "relatorios" && restauranteId) carregarRelatorio();
  }, [tab, restauranteId, carregarRelatorio]);

  const refreshDashboardNow = useCallback(({ force = false, delay = 0 } = {}) => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);

    const run = () => {
      const now = Date.now();
      if (!force && now - Number(lastDashboardRefreshRef.current || 0) < 2500) return;
      lastDashboardRefreshRef.current = now;
      load({ silent: true });
    };

    if (delay > 0) {
      refreshDebounceRef.current = setTimeout(run, delay);
      return;
    }

    run();
  }, [load]);

  useEffect(() => {
    if (tab === "dashboard") refreshDashboardNow({ force: true });
  }, [tab, refreshDashboardNow]);

  useEffect(() => {
    const onAppStateChange = (state) => {
      if (state === "active") refreshDashboardNow({ force: true });
    };
    const sub = AppState.addEventListener?.("change", onAppStateChange);

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onFocus = () => refreshDashboardNow({ force: true });
      const onVisibility = () => {
        if (document.visibilityState === "visible") refreshDashboardNow({ force: true });
      };
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        sub?.remove?.();
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }

    return () => sub?.remove?.();
  }, [refreshDashboardNow]);

  useEffect(() => {
    if (!restauranteId) return undefined;
    const socket = connectSocket(restauranteId);
    const atualizar = () => refreshDashboardNow({ delay: 500 });
    const eventos = [
      "novoPedido",
      "pedidoCriado",
      "pedidoVitrineCriado",
      "pedidoRecebido",
      "vitrinePedidoCriado",
      "novoPedidoVitrine",
      "pedidoAtualizado",
      "pagamentoAtualizado",
      "balcaoAtualizado",
      "mesaAtualizada",
      "mesaCriada",
      "mesaExcluida",
      "caixaAtualizado",
      "caixaAberto",
      "caixaFechado",
    ];
    const acessoEncerrado = (payload = {}) => {
      const code = String(payload?.code || payload?.codigo || "").toUpperCase();
      const reason = code === "LICENCA_VENCIDA" ? "expired" : "blocked";
      const message = payload?.message || payload?.mensagem || (reason === "expired"
        ? "Licença vencida. Regularize o plano para continuar usando o Movyo."
        : "Restaurante bloqueado. Entre em contato com o suporte Movyo.");
      authEvents.emit({ type: "AUTH_LOGOUT_REQUIRED", code, reason, message });
    };
    const eventosAcesso = ["restauranteBloqueado", "licencaVencida", "acessoEncerrado", "forceLogout"];
    eventos.forEach((ev) => socket?.on?.(ev, atualizar));
    eventosAcesso.forEach((ev) => socket?.on?.(ev, acessoEncerrado));
    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      const current = getSocket();
      eventos.forEach((ev) => current?.off?.(ev, atualizar));
      eventosAcesso.forEach((ev) => current?.off?.(ev, acessoEncerrado));
    };
  }, [restauranteId, refreshDashboardNow]);

  useEffect(() => {
    if (tab !== "dashboard") return undefined;
    const id = setInterval(() => refreshDashboardNow(), 20000);
    return () => clearInterval(id);
  }, [tab, refreshDashboardNow]);

  useEffect(() => {
    if (socketStatus.connected) refreshDashboardNow({ delay: 300 });
  }, [socketStatus.connected, refreshDashboardNow]);


  useEffect(() => {
    if (Platform.OS === "web") {
      requestNotificationPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!pedidosAReceber.length) return;
    pedidosAReceber.forEach((pedido) => {
      const id = String(getId(pedido) || pedido.numeroPedido || pedido.numero || "");
      if (!id || pedidosNotificadosRef.current.has(id)) return;
      pedidosNotificadosRef.current.add(id);
      const codigo = getPedidoCodigoHub(pedido);
      const cliente = pedido.nomeCliente || pedido.cliente || pedido.nome || "Cliente";
      const mensagem = `Pedido ${codigo ? `#${codigo} ` : ""}de ${cliente} chegou pela vitrine.`;

      if (Platform.OS === "web") {
        alertNovoPedido({ ...pedido, codigo }).catch(() => {});
      } else {
        Alert.alert("📥 Pedido A Receber", mensagem);
      }
    });
  }, [pedidosAReceber]);

  const runAction = async (label, fn) => {
    setActionLabel(label);
    try { await fn(); } finally { setActionLabel(""); }
  };

  const setCategoriaTipo = (tipoCategoria) => setCategoriaForm((prev) => ({
    ...prev,
    tipoCategoria,
    pizzaMultisabor: tipoCategoria === TIPO_CATEGORIA.PIZZA_DUAS,
    permiteSabores: tipoCategoria !== TIPO_CATEGORIA.SIMPLES,
    permiteBordas: tipoCategoria === TIPO_CATEGORIA.SIMPLES ? false : prev.permiteBordas,
    permiteAdicionais: tipoCategoria === TIPO_CATEGORIA.SIMPLES ? false : prev.permiteAdicionais,
    calculoPrecoPor: tipoCategoria === TIPO_CATEGORIA.PIZZA_DUAS ? prev.calculoPrecoPor || "maior" : "maior",
  }));

  const normalizarTipoExtra = (t) => ({
    ...t,
    nome: String(t.nome || "").trim(),
    obrigatorio: !!t.obrigatorio,
    tipoSelecion: t.tipoSelecion || "unico",
    minimoSelecionados: Math.max(0, Number(t.minimoSelecionados || 0)),
    maximoSelecionados: Math.max(1, Number(t.maximoSelecionados || 1)),
    itens: Array.isArray(t.itens) ? t.itens : [],
  });

  const adicionarItemAoTipoExtra = () => {
    if (!tipoExtraItem.nome.trim()) return Alert.alert("Ops", "Informe o nome do item.");
    setTipoExtraForm((prev) => ({ ...prev, itens: [...(prev.itens || []), { nome: tipoExtraItem.nome.trim(), preco: Number(onlyNumber(tipoExtraItem.preco) || 0) }] }));
    setTipoExtraItem(emptyItemPreco());
  };

  const adicionarTipoExtraCategoria = () => {
    if (!tipoExtraForm.nome.trim()) return Alert.alert("Ops", "Informe o nome do tipo extra.");
    const novo = normalizarTipoExtra(tipoExtraForm);
    setCategoriaForm((prev) => ({ ...prev, tiposExtras: [...(prev.tiposExtras || []), novo] }));
    setTipoExtraForm(emptyTipoExtra());
    setTipoExtraItem(emptyItemPreco());
  };

  const removerTipoExtraCategoria = (index) => setCategoriaForm((prev) => ({ ...prev, tiposExtras: (prev.tiposExtras || []).filter((_, i) => i !== index) }));
  const iniciarEdicaoCategoria = (cat) => {
    setCategoriaEditandoId(getId(cat));
    setCategoriaForm({ ...emptyCategoria(), ...cat, ativa: cat.ativa !== false, tipoCategoria: cat.tipoCategoria || (cat.pizzaMultisabor ? TIPO_CATEGORIA.PIZZA_DUAS : cat.permiteSabores ? TIPO_CATEGORIA.PIZZA : TIPO_CATEGORIA.SIMPLES), tiposExtras: Array.isArray(cat.tiposExtras) ? cat.tiposExtras : [] });
    setTab("categorias");
  };
  const limparCategoria = () => { setCategoriaForm(emptyCategoria()); setCategoriaEditandoId(null); setTipoExtraForm(emptyTipoExtra()); setTipoExtraItem(emptyItemPreco()); };

  const salvarCategoria = async () => {
    if (!categoriaForm.nome.trim()) return Alert.alert("Ops", "Informe o nome da categoria.");
    await runAction(categoriaEditandoId ? "Salvando categoria..." : "Criando categoria...", async () => {
      const payload = { ...categoriaForm, nome: categoriaForm.nome.trim(), restaurante: restauranteId, tiposExtras: (categoriaForm.tiposExtras || []).map(normalizarTipoExtra) };
      if (categoriaEditandoId) await api.put(`/api/categorias/${categoriaEditandoId}`, payload); else await api.post("/api/categorias", payload);
      limparCategoria();
      await load({ silent: true });
      Alert.alert("Pronto", categoriaEditandoId ? "Categoria atualizada." : "Categoria cadastrada.");
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  };

  const deletarCategoria = (cat) => Alert.alert("Excluir categoria", `Deseja excluir ${cat.nome}?`, [
    { text: "Cancelar", style: "cancel" },
    { text: "Excluir", style: "destructive", onPress: async () => runAction("Excluindo categoria...", async () => { await api.delete(`/api/categorias/${getId(cat)}`); await load({ silent: true }); }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message)) },
  ]);

  const adicionarItemProduto = (key) => {
    const temp = tempInputs[key] || emptyItemPreco();
    if (!temp.nome.trim()) return Alert.alert("Ops", "Informe o nome.");
    setProdutoForm((prev) => ({ ...prev, [key]: [...(prev[key] || []), { nome: temp.nome.trim(), preco: Number(onlyNumber(temp.preco) || 0) }] }));
    setTempInputs((prev) => ({ ...prev, [key]: emptyItemPreco() }));
  };
  const removerItemProduto = (key, index) => setProdutoForm((prev) => ({ ...prev, [key]: (prev[key] || []).filter((_, i) => i !== index) }));
  const adicionarExtraProduto = (tipo) => {
    const temp = tempInputs.extras?.[tipo] || emptyItemPreco();
    if (!temp.nome.trim()) return Alert.alert("Ops", "Informe o item personalizado.");
    setProdutoForm((prev) => ({ ...prev, extras: { ...(prev.extras || {}), [tipo]: [...(prev.extras?.[tipo] || []), { nome: temp.nome.trim(), preco: Number(onlyNumber(temp.preco) || 0) }] } }));
    setTempInputs((prev) => ({ ...prev, extras: { ...(prev.extras || {}), [tipo]: emptyItemPreco() } }));
  };
  const removerExtraProduto = (tipo, index) => setProdutoForm((prev) => ({ ...prev, extras: { ...(prev.extras || {}), [tipo]: (prev.extras?.[tipo] || []).filter((_, i) => i !== index) } }));
  const iniciarEdicaoProduto = (p) => {
    setProdutoEditandoId(getId(p));
    setProdutoForm({ ...emptyProduto(), ...p, categoria: getId(p.categoria) || p.categoria || "", precoBase: String(p.precoBase ?? p.preco ?? ""), sabores: p.sabores || [], bordas: p.bordas || [], adicionais: p.adicionais || [], complementos: p.complementos || [], extras: p.extras || {}, ativoVitrine: p.ativoVitrine !== false, imprimir: p.imprimir !== false && p.imprimeNaCozinha !== false });
    setTab("produtos");
  };
  const limparProduto = () => { setProdutoForm(emptyProduto()); setProdutoEditandoId(null); setTempInputs({ sabores: emptyItemPreco(), bordas: emptyItemPreco(), adicionais: emptyItemPreco(), complementos: emptyItemPreco(), extras: {} }); };

  const salvarProduto = async () => {
    if (!produtoForm.categoria) return Alert.alert("Ops", "Escolha a categoria primeiro.");
    if (!produtoForm.nome.trim()) return Alert.alert("Ops", "Informe o nome do produto.");
    const preco = Number(onlyNumber(produtoForm.precoBase) || 0);
    if (!preco) return Alert.alert("Ops", "Informe o preço base.");
    await runAction(produtoEditandoId ? "Salvando produto..." : "Criando produto...", async () => {
      const payload = { ...produtoForm, restaurante: restauranteId, nome: produtoForm.nome.trim(), imagem: produtoForm.imagem || MOCK_IMAGE, precoBase: preco, preco, ativo: true, disponivel: true, ativoVitrine: produtoForm.ativoVitrine !== false, imprimir: !!produtoForm.imprimir, imprimeNaCozinha: !!produtoForm.imprimir, categoria: produtoForm.categoria };
      if (produtoEditandoId) await api.put(`/api/produtos/${produtoEditandoId}`, payload); else await api.post("/api/produtos", payload);
      limparProduto();
      await load({ silent: true });
      Alert.alert("Pronto", produtoEditandoId ? "Produto atualizado." : "Produto cadastrado.");
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  };

  const deletarProduto = (p) => Alert.alert("Excluir produto", `Deseja excluir ${p.nome}?`, [
    { text: "Cancelar", style: "cancel" },
    { text: "Excluir", style: "destructive", onPress: async () => runAction("Excluindo produto...", async () => { await api.delete(`/api/produtos/${getId(p)}`); await load({ silent: true }); }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message)) },
  ]);

  const salvarConfig = async () => {
    setSaving(true);
    await runAction("Salvando configurações...", async () => {
      const { _id, id, email, senha, mercadoPago, recipient_id, ...payload } = rest;
      const res = await api.put("/api/restaurantes/configuracoes", payload);
      setRest(res.data?.restaurante || rest);
      Alert.alert("Pronto", "Configurações salvas.");
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
    setSaving(false);
  };

  const criarMesa = async () => {
    if (!mesaNumero.trim()) return;
    await runAction("Criando mesa...", async () => {
      await api.post("/api/mesas", { numero: mesaNumero.trim(), restauranteId });
      setMesaNumero("");
      await load({ silent: true });
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  };

  const criarLote = async () => {
    await runAction("Criando mesas...", async () => {
      await api.post("/api/mesas/lote", { restauranteId, inicio: Number(loteInicio), fim: Number(loteFim), de: Number(loteInicio), ate: Number(loteFim) });
      await load({ silent: true });
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  };

  const limparGarcom = () => { setGarcomForm(emptyGarcom()); setGarcomEditandoId(null); };
  const iniciarEdicaoGarcom = (g) => { setGarcomEditandoId(getId(g)); setGarcomForm({ nome: g.nome || "", apelido: g.apelido || "", telefone: g.telefone || "", pin: "", permissoes: normalizePerms(g.permissoes) }); };
  const setPermGarcom = (key, value) => setGarcomForm((prev) => ({ ...prev, permissoes: { ...normalizePerms(prev.permissoes), [key]: !!value } }));

  const criarGarcom = async () => {
    if (garcomLimitReached) return Alert.alert("Limite do plano", "O plano Starter Mobile permite no máximo 2 garçons.");
    if (!String(garcomForm.nome || "").trim()) return Alert.alert("Ops", "Informe o nome do garçom.");
    if (!String(garcomForm.telefone || "").trim()) return Alert.alert("Ops", "Informe o telefone do garçom.");
    if (!garcomEditandoId && String(garcomForm.pin || "").trim().length < 4) return Alert.alert("Ops", "Informe um PIN com pelo menos 4 dígitos.");
    await runAction(garcomEditandoId ? "Salvando garçom..." : "Criando garçom...", async () => {
      const payload = { nome: garcomForm.nome.trim(), apelido: garcomForm.apelido?.trim() || null, telefone: garcomForm.telefone.trim(), permissoes: normalizePerms(garcomForm.permissoes) };
      if (!garcomEditandoId || String(garcomForm.pin || "").trim()) payload.pin = String(garcomForm.pin || "").trim();
      if (garcomEditandoId) await api.put(`/api/garcons/${garcomEditandoId}`, payload); else await api.post("/api/garcons", payload);
      limparGarcom();
      await load({ silent: true });
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  };

  const alternarGarcom = async (g) => runAction("Atualizando garçom...", async () => { await api.patch(`/api/garcons/${getId(g)}/toggle`, {}); await load({ silent: true }); }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  const removerGarcom = (g) => Alert.alert("Remover garçom", `Deseja remover ${g.nome || "este garçom"}?`, [
    { text: "Cancelar", style: "cancel" },
    { text: "Remover", style: "destructive", onPress: async () => runAction("Removendo garçom...", async () => { await api.delete(`/api/garcons/${getId(g)}`); await load({ silent: true }); }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message)) },
  ]);

  const limparOperador = () => { setOperadorForm(emptyOperador()); setOperadorEditandoId(null); };
  const iniciarEdicaoOperador = (op) => { setOperadorEditandoId(getId(op)); setOperadorForm({ nome: op.nome || "", apelido: op.apelido || "", pin: "", observacao: op.observacao || "", ativo: op.ativo !== false, permissoes: normalizeOperatorPerms(op.permissoes) }); };
  const salvarOperador = async () => {
    if (!String(operadorForm.nome || "").trim()) return Alert.alert("Ops", "Informe o nome do operador.");
    await runAction(operadorEditandoId ? "Salvando operador..." : "Cadastrando operador...", async () => {
      const payload = { nome: operadorForm.nome.trim(), apelido: operadorForm.apelido?.trim() || null, observacao: operadorForm.observacao || "", ativo: operadorForm.ativo !== false, permissoes: normalizeOperatorPerms(operadorForm.permissoes) };
      if (!operadorEditandoId || String(operadorForm.pin || "").trim()) payload.pin = String(operadorForm.pin || "").trim();
      if (operadorEditandoId) await api.put(`/api/caixa/${restauranteId}/operadores/${operadorEditandoId}`, payload); else await api.post(`/api/caixa/${restauranteId}/operadores`, payload);
      limparOperador();
      await load({ silent: true });
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  };
  const alternarOperador = async (op) => runAction("Atualizando operador...", async () => { await api.patch(`/api/caixa/${restauranteId}/operadores/${getId(op)}/status`, { ativo: !(op.ativo !== false) }); await load({ silent: true }); }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));

  const abrirCaixa = async () => {
    if (!caixaForm.operadorId) return Alert.alert("Operador obrigatório", "Selecione o operador que está abrindo o caixa.");
    if (aberturaExigePin && !String(caixaForm.pin || "").trim()) return Alert.alert("PIN obrigatório", "Informe o PIN do operador selecionado.");
    await runAction("Abrindo caixa...", async () => {
      await api.post(`/api/caixa/${restauranteId}/abrir`, { operadorCaixaId: caixaForm.operadorId, operadorId: caixaForm.operadorId, pin: caixaForm.pin, saldoInicial: Number(onlyNumber(caixaForm.saldoInicial)) });
      setCaixaForm((p) => ({ ...p, pin: "" }));
      await load({ silent: true });
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  };

  const fecharCaixa = async () => {
    if (fechamentoExigePin && !String(caixaForm.pin || "").trim()) return Alert.alert("PIN obrigatório", "Informe o PIN do operador que abriu o caixa.");
    await runAction("Fechando caixa...", async () => {
      await api.post(`/api/caixa/${restauranteId}/fechar`, { pin: caixaForm.pin, saldoFinalInformado: Number(onlyNumber(caixaForm.saldoFinalInformado)), observacaoFechamento: caixaForm.observacao, fechadoPor: "Movyo Hub" });
      setCaixaForm((p) => ({ ...p, pin: "", saldoFinalInformado: "0", observacao: "" }));
      await load({ silent: true });
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message));
  };

  const deletarMesa = (mesa) => Alert.alert("Excluir mesa", `Deseja excluir a mesa ${mesa.numero || mesa.mesaNumero || "selecionada"}?`, [
    { text: "Cancelar", style: "cancel" },
    { text: "Excluir", style: "destructive", onPress: async () => runAction("Excluindo mesa...", async () => { await api.delete(`/api/mesas/${getId(mesa)}`); setMesas((prev) => prev.filter((m) => getId(m) !== getId(mesa))); }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message)) },
  ]);

  const atualizarStatusPedidoHub = async (pedido, novoStatus) => {
    const pedidoId = getId(pedido);
    if (!pedidoId) return;
    const labels = {
      em_producao: "Aceitando pedido...",
      pronto: "Marcando como pronto...",
      entregue: "Finalizando pedido...",
    };
    await runAction(labels[novoStatus] || "Atualizando pedido...", async () => {
      await api.put(`/api/pedidos/status/${pedidoId}`, { status: novoStatus, restauranteId });
      await load({ silent: true });
    }).catch((e) => Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e?.response?.data?.erro || e.message));
  };

  const atualizarStatusMercadoPago = async () => {
    if (!restauranteId) return;
    setMpLoading(true);
    try { const { data } = await api.get(`/api/mercadopago/status/${restauranteId}`); setRest((prev) => ({ ...prev, mercadoPago: { ...(prev?.mercadoPago || {}), ...data } })); Alert.alert("Mercado Pago", data?.conectado ? "Conta conectada." : "Ainda não conectado."); }
    catch (e) { Alert.alert("Mercado Pago", e?.response?.data?.message || e?.response?.data?.mensagem || e.message || "Erro ao atualizar status."); }
    finally { setMpLoading(false); }
  };
  const conectarMercadoPago = async () => {
    setMpLoading(true);
    try { const { data } = await api.get(`/api/mercadopago/oauth/start/${restauranteId}`); if (!data?.url) throw new Error("URL OAuth não retornada."); await Linking.openURL(data.url); Alert.alert("Mercado Pago", "Autorize a conta e depois toque em Atualizar status."); }
    catch (e) { Alert.alert("Mercado Pago", e?.response?.data?.message || e?.response?.data?.mensagem || e.message || "Erro ao conectar."); }
    finally { setMpLoading(false); }
  };
  const desconectarMercadoPago = async () => {
    setMpLoading(true);
    try { await api.post("/api/mercadopago/disconnect", {}); setRest((prev) => ({ ...prev, mercadoPago: { conectado: false, userId: null, tokenExpiraEm: null, ultimoOAuthEm: null } })); Alert.alert("Mercado Pago", "Conta desconectada."); }
    catch (e) { Alert.alert("Mercado Pago", e?.response?.data?.message || e?.response?.data?.mensagem || e.message || "Erro ao desconectar."); }
    finally { setMpLoading(false); }
  };
  const toggleCartaoVitrine = async (value) => {
    const before = !!rest.pagamentoCartaoAtivo;
    setRest((prev) => ({ ...prev, pagamentoCartaoAtivo: value }));
    try { await api.patch("/api/restaurantes/pagamento-cartao", { pagamentoCartaoAtivo: value }); }
    catch (e) { setRest((prev) => ({ ...prev, pagamentoCartaoAtivo: before })); Alert.alert("Erro", e?.response?.data?.message || e?.response?.data?.mensagem || e.message); }
  };


  const normalizarBotStatus = (data = {}) => {
    const raw = data?.status || data?.estado || data?.state || data?.connection || "desconhecido";
    const estado = typeof raw === "object" ? (raw.estado || raw.status || raw.connection || "desconhecido") : String(raw || "desconhecido");
    const lower = String(estado || "").toLowerCase();
    const conectado = !!(data?.conectado || data?.connected || lower === "open" || lower === "connected" || lower === "conectado");
    const ligado = conectado || !!(data?.ligado || data?.running || data?.ativo || lower === "connecting" || lower === "qr" || lower === "aguardando_qr" || data?.temQr || data?.qr);
    return {
      ligado,
      conectado,
      estado,
      temQr: !!(data?.temQr || data?.qr),
      atualizadoEm: data?.atualizadoEm || data?.updatedAt || data?.statusBot?.atualizadoEm || null,
      erroConexao: data?.erroConexao || data?.erro || data?.error || "",
    };
  };

  const carregarStatusBot = async ({ alertar = false } = {}) => {
    if (!restauranteId) return botStatus;
    try {
      const { data } = await api.get(`/api/bot/status/${restauranteId}`);
      const next = normalizarBotStatus(data);
      setBotStatus(next);
      if (next.conectado) { setBotQr(""); setBotPolling(false); }
      if (alertar) Alert.alert("WhatsApp Bot", next.conectado ? "WhatsApp já está conectado." : next.ligado ? "Bot ligado, aguardando conexão." : "Bot desligado.");
      return next;
    } catch (e) {
      if (alertar) Alert.alert("WhatsApp Bot", e?.response?.data?.message || e?.response?.data?.mensagem || e?.response?.data?.erro || e.message || "Erro ao consultar status.");
      return botStatus;
    }
  };

  const buscarQrBot = async () => {
    if (!restauranteId) return;
    setBotLoading(true);
    try {
      const status = await carregarStatusBot();
      if (status?.conectado) {
        setBotQr("");
        setBotPolling(false);
        Alert.alert("WhatsApp Bot", "Essa instância já está conectada. Não gerei um novo QR Code.");
        return;
      }
      const { data } = await api.get(`/api/bot/qr/${restauranteId}`);
      const qr = data?.qr || data?.qrcode || data?.qrCode || "";
      setBotQr(qr);
      setBotPolling(!!qr || !!data?.connecting);
      setBotStatus((prev) => ({ ...prev, ...normalizarBotStatus(data), ligado: true, temQr: !!qr }));
      if (!qr) Alert.alert("WhatsApp Bot", data?.mensagem || "Bot iniciando. Aguarde alguns segundos e toque em Mostrar QR Code novamente.");
    } catch (e) {
      Alert.alert("WhatsApp Bot", e?.response?.data?.message || e?.response?.data?.mensagem || e?.response?.data?.erro || e.message || "Erro ao buscar QR Code.");
    } finally {
      setBotLoading(false);
    }
  };

  const conectarBot = async () => {
    if (!restauranteId) return;
    setBotLoading(true);
    try {
      const status = await carregarStatusBot();
      if (status?.conectado) {
        setBotQr("");
        setBotPolling(false);
        Alert.alert("WhatsApp Bot", "WhatsApp já está conectado nesta instância.");
        return;
      }
      await api.post("/api/bot/start", { restauranteId });
      setBotStatus((prev) => ({ ...prev, ligado: true, estado: "connecting" }));
      await buscarQrBot();
    } catch (e) {
      Alert.alert("WhatsApp Bot", e?.response?.data?.message || e?.response?.data?.mensagem || e?.response?.data?.erro || e.message || "Erro ao iniciar bot.");
    } finally {
      setBotLoading(false);
    }
  };

  const desconectarBot = () => Alert.alert("Desconectar WhatsApp", "Deseja desconectar a instância do WhatsApp deste restaurante?", [
    { text: "Cancelar", style: "cancel" },
    { text: "Desconectar", style: "destructive", onPress: async () => {
      setBotLoading(true);
      try {
        await api.delete(`/api/bot/stop/${restauranteId}`);
        setBotQr("");
        setBotPolling(false);
        await carregarStatusBot();
        Alert.alert("WhatsApp Bot", "Instância desconectada.");
      } catch (e) {
        Alert.alert("WhatsApp Bot", e?.response?.data?.message || e?.response?.data?.mensagem || e?.response?.data?.erro || e.message || "Erro ao desconectar.");
      } finally { setBotLoading(false); }
    }}
  ]);

  const resetarBot = () => Alert.alert("Resetar sessão", "Use isso apenas se o QR travar ou precisar trocar o WhatsApp conectado. Deseja resetar?", [
    { text: "Cancelar", style: "cancel" },
    { text: "Resetar", style: "destructive", onPress: async () => {
      setBotLoading(true);
      try {
        await api.post(`/api/bot/reset/${restauranteId}`, {});
        setBotQr("");
        setBotPolling(false);
        await carregarStatusBot();
        Alert.alert("WhatsApp Bot", "Sessão resetada. Agora toque em Conectar WhatsApp para gerar novo QR.");
      } catch (e) {
        Alert.alert("WhatsApp Bot", e?.response?.data?.message || e?.response?.data?.mensagem || e?.response?.data?.erro || e.message || "Erro ao resetar sessão.");
      } finally { setBotLoading(false); }
    }}
  ]);

  useEffect(() => {
    if (!restauranteId) return;
    carregarStatusBot();
    const id = setInterval(() => carregarStatusBot(), botPolling ? 3500 : 12000);
    return () => clearInterval(id);
  }, [restauranteId, botPolling]);

  const botQrImageUrl = botQr ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(botQr)}` : "";

  const logoutNow = async () => {
    try {
      await clearSession();
    } finally {
      onLogout?.();
      // ✅ No iOS PWA, força recarregamento para sair mesmo quando o estado da navegação fica preso.
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.replace("/");
      }
    }
  };

  const logout = () => {
    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" ? window.confirm("Deseja encerrar sua sessão?") : true;
      if (ok) logoutNow();
      return;
    }

    Alert.alert("Sair", "Deseja encerrar sua sessão?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: logoutNow },
    ]);
  };

  const tabs = [
    { key: "dashboard", label: "Início", icon: "grid-outline" },
    { key: "a_receber", label: "A Receber", icon: "notifications-outline", badge: resumo.aReceber },
    { key: "pedidos", label: "Pedidos", icon: "receipt-outline" },
    { key: "caixa", label: "Caixa", icon: "cash-outline" },
    { key: "relatorios", label: "Relatórios", icon: "analytics-outline" },
    { key: "categorias", label: "Categorias", icon: "albums-outline" },
    { key: "produtos", label: "Produtos", icon: "fast-food-outline" },
    { key: "mesas", label: "Mesas", icon: "restaurant-outline" },
    { key: "garcons", label: "Garçons", icon: "people-outline" },
    { key: "config", label: "Configurações", icon: "settings-outline" },
  ];
  const mainTabs = tabs.filter((item) => ["dashboard", "a_receber", "pedidos", "caixa"].includes(item.key));
  const moreTabs = tabs.filter((item) => !["dashboard", "a_receber", "pedidos", "caixa"].includes(item.key));
  const currentTab = tabs.find((item) => item.key === tab) || tabs[0];
  const isMoreSelected = moreTabs.some((item) => item.key === tab);
  const selectTab = (key) => {
    setMoreOpen(false);
    setTab(key);
  };

  if (loading && !restauranteId) {
    return (
      <LinearGradient colors={["#111827", "#251329", "#ff3b8a"]} style={styles.center}>
        <View style={styles.loadingLogo}><Text style={styles.loadingLogoText}>M</Text></View>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={[styles.loading, { color: "#fff" }]}>Carregando Movyo Hub...</Text>
      </LinearGradient>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <SafeAreaView style={styles.page} edges={["top"]}>
        {actionLabel || refreshing ? (
          <View style={styles.inlineLoader}>
            <ActivityIndicator size="small" color="#ff3b8a" />
            <Text style={styles.inlineLoaderText}>{actionLabel || "Sincronizando dados..."}</Text>
          </View>
        ) : null}

        <LinearGradient colors={["#111827", "#251329", "#ff3b8a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={[styles.heroTop, isTablet && styles.heroTopTablet]}>
            <View style={styles.brandLine}>
              <View style={styles.heroMark}><Text style={styles.heroMarkText}>M</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>MOVYO HUB</Text>
                <Text style={styles.logo} numberOfLines={1}>{rest?.nome || "Restaurante"}</Text>
                <Text style={styles.sub}>{rest?.plano || "Plano Movyo"} • gestão mobile</Text>
              </View>
            </View>
            <Pressable onPress={logout} style={({ pressed }) => [styles.logout, pressed && styles.pressed]} accessibilityLabel="Sair da conta">
              <Ionicons name="log-out-outline" size={21} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.heroStatusRow}>
            <StatusPill ok={networkOnline} icon={networkOnline ? "cloud-done-outline" : "cloud-offline-outline"} label={networkOnline ? "Online" : "Sem internet"} />
            <StatusPill ok={socketStatus.connected} pending={socketStatus.connecting} icon="radio-outline" label={socketStatus.connected ? "Tempo real" : socketStatus.connecting ? "Reconectando" : "Socket offline"} />
            <StatusPill ok={caixa?.status === "aberto"} icon="cash-outline" label={caixa?.status === "aberto" ? "Caixa aberto" : "Caixa fechado"} />
          </View>
        </LinearGradient>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: 112 + Math.max(insets.bottom, 8) }, isTablet && styles.contentContainerTablet]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ silent: true })} tintColor="#ff3b8a" colors={["#ff3b8a"]} />}
        >
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionKicker}>Painel do restaurante</Text>
              <Text style={styles.sectionTitle}>{currentTab.label}</Text>
              <Text style={styles.syncText}>Atualizado {lastSyncAt ? formatDateTimeBR(lastSyncAt) : "agora"}</Text>
            </View>
            <Pressable onPress={() => load({ silent: true })} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]} accessibilityLabel="Atualizar dados">
              <Ionicons name="refresh-outline" size={19} color="#ff3b8a" />
            </Pressable>
          </View>

          {tab === "dashboard" && <>
            <LicenseStatusCard info={licenseInfo} />
            <View style={styles.metricGrid}>
              <Metric label="Faturamento hoje" value={moeda(resumo.totalHoje)} icon="trending-up-outline" tone="pink" />
              <Metric label="Ticket médio" value={moeda(resumo.ticketMedio)} icon="stats-chart-outline" tone="orange" />
              <Metric label="Pendentes" value={resumo.pendentes} icon="time-outline" tone="purple" />
              <Metric label="Mesas ocupadas" value={resumo.mesasOcupadas} icon="restaurant-outline" tone="green" />
            </View>

            <FinancialOverview report={todayReport} />
            <OperationalOverview status={operationStatus} counts={{ categorias: categorias.length, produtos: produtos.length, mesas: mesas.length, garcons: garcons.length }} />

            <Card title="Atalhos operacionais" icon="flash-outline" subtitle="Acesse as áreas mais usadas sem procurar no menu.">
              <View style={styles.grid2}>
                <DashboardTile label="A Receber" subtitle={`${resumo.aReceber} pedido(s)`} icon="notifications-outline" attention={resumo.aReceber > 0} onPress={() => selectTab("a_receber")} />
                <DashboardTile label="Relatórios" subtitle="Caixa e vendas" icon="analytics-outline" onPress={() => selectTab("relatorios")} />
                <DashboardTile label="Produtos" subtitle={`${produtos.length} cadastrados`} icon="fast-food-outline" onPress={() => selectTab("produtos")} />
                <DashboardTile label="Mesas" subtitle={`${mesas.length} cadastradas`} icon="restaurant-outline" onPress={() => selectTab("mesas")} />
                <DashboardTile label="Garçons" subtitle={`${garcons.length} acessos`} icon="people-outline" onPress={() => selectTab("garcons")} />
                <DashboardTile label="Configurações" subtitle="Integrações e loja" icon="settings-outline" onPress={() => selectTab("config")} />
              </View>
            </Card>

            <OrdersHubView title="Pedidos recentes" pedidos={pedidos.slice(0, 5)} onStatusChange={atualizarStatusPedidoHub} compact />
          </>}

          {tab === "categorias" && <CategoriasView categoriaForm={categoriaForm} setCategoriaForm={setCategoriaForm} setCategoriaTipo={setCategoriaTipo} tipoExtraForm={tipoExtraForm} setTipoExtraForm={setTipoExtraForm} tipoExtraItem={tipoExtraItem} setTipoExtraItem={setTipoExtraItem} adicionarItemAoTipoExtra={adicionarItemAoTipoExtra} adicionarTipoExtraCategoria={adicionarTipoExtraCategoria} removerTipoExtraCategoria={removerTipoExtraCategoria} salvarCategoria={salvarCategoria} limparCategoria={limparCategoria} categoriaEditandoId={categoriaEditandoId} categorias={categorias} categoriasFiltradas={categoriasFiltradas} categoriaBusca={categoriaBusca} setCategoriaBusca={setCategoriaBusca} iniciarEdicaoCategoria={iniciarEdicaoCategoria} deletarCategoria={deletarCategoria} />}

          {tab === "produtos" && <ProdutosView produtoForm={produtoForm} setProdutoForm={setProdutoForm} produtoEditandoId={produtoEditandoId} categorias={categorias} categoriaSelecionada={categoriaSelecionada} tempInputs={tempInputs} setTempInputs={setTempInputs} adicionarItemProduto={adicionarItemProduto} removerItemProduto={removerItemProduto} adicionarExtraProduto={adicionarExtraProduto} removerExtraProduto={removerExtraProduto} salvarProduto={salvarProduto} limparProduto={limparProduto} produtos={produtos} produtosFiltrados={produtosFiltrados} produtoBusca={produtoBusca} setProdutoBusca={setProdutoBusca} produtoFiltro={produtoFiltro} setProdutoFiltro={setProdutoFiltro} iniciarEdicaoProduto={iniciarEdicaoProduto} deletarProduto={deletarProduto} />}

          {tab === "mesas" && <>
            <Card title="Criar mesa individual" icon="restaurant-outline" subtitle="Criação rápida sem sair da tela de mesas.">
              <Field label="Número da mesa" value={mesaNumero} onChangeText={setMesaNumero} />
              <Button title="Criar mesa" icon="add-outline" onPress={criarMesa} disabled={!!actionLabel} />
            </Card>
            <Card title="Criar mesas em lote" icon="copy-outline">
              <View style={styles.row}><View style={{ flex: 1 }}><Field label="Início" value={loteInicio} onChangeText={setLoteInicio} keyboardType="number-pad" /></View><View style={{ width: 10 }} /><View style={{ flex: 1 }}><Field label="Fim" value={loteFim} onChangeText={setLoteFim} keyboardType="number-pad" /></View></View>
              <Button title="Criar lote" icon="layers-outline" onPress={criarLote} disabled={!!actionLabel} />
            </Card>
            <MesasHubList mesas={mesas} onDelete={deletarMesa} />
          </>}

          {tab === "a_receber" && <OrdersHubView title="Pedidos A Receber" subtitle="Pedidos confirmados pela vitrine aguardando aceite." pedidos={pedidosAReceber} onStatusChange={atualizarStatusPedidoHub} aReceber />}
          {tab === "pedidos" && <OrdersHubView title="Controle de pedidos" subtitle="Mais novos primeiro, com status e origem." pedidos={pedidos} onStatusChange={atualizarStatusPedidoHub} />}

          {tab === "relatorios" && <ReportsView filter={reportFilter} setFilter={setReportFilter} data={reportData} loading={reportLoading} error={reportError} onLoad={carregarRelatorio} />}

          {tab === "caixa" && <>
            <Card title="Abertura e fechamento" icon="cash-outline" subtitle="O fechamento exige o PIN do operador que abriu o caixa quando houver PIN cadastrado.">
              {caixa?.status === "aberto" ? <>
                <Pill active>Caixa aberto</Pill>
                <Text style={styles.text}>Operador: {caixa.operadorNome || operadorFechamento?.nome || "—"}</Text>
                <Text style={styles.text}>Saldo inicial: {moeda(caixa.saldoInicial)}</Text>
                <Text style={styles.text}>Dinheiro: {moeda(caixa.dinheiro || caixa.totalDinheiro)}</Text>
                <Text style={styles.text}>Pix: {moeda(caixa.pix || caixa.totalPix)}</Text>
                <Text style={styles.text}>Cartão: {moeda(caixa.cartao || caixa.totalCartao || Number(caixa.credito || 0) + Number(caixa.debito || 0))}</Text>
                {fechamentoExigePin ? <Field label="PIN do operador" value={caixaForm.pin} onChangeText={(v) => setCaixaForm({ ...caixaForm, pin: v.replace(/\D/g, "").slice(0, 8) })} keyboardType="number-pad" secureTextEntry /> : null}
                <Field label="Saldo final informado" value={caixaForm.saldoFinalInformado} onChangeText={(v) => setCaixaForm({ ...caixaForm, saldoFinalInformado: v })} keyboardType="decimal-pad" />
                <Field label="Observação" value={caixaForm.observacao} onChangeText={(v) => setCaixaForm({ ...caixaForm, observacao: v })} multiline />
                <Button title="Fechar caixa" variant="danger" icon="lock-closed-outline" onPress={fecharCaixa} />
              </> : <>
                <Pill danger>Caixa fechado</Pill>
                <OperadorPicker operadores={operadoresAtivos} value={caixaForm.operadorId} onChange={(id) => setCaixaForm({ ...caixaForm, operadorId: id, pin: "" })} />
                {aberturaExigePin ? <Field label="PIN do operador" value={caixaForm.pin} onChangeText={(v) => setCaixaForm({ ...caixaForm, pin: v.replace(/\D/g, "").slice(0, 8) })} keyboardType="number-pad" secureTextEntry /> : null}
                <Field label="Saldo inicial" value={caixaForm.saldoInicial} onChangeText={(v) => setCaixaForm({ ...caixaForm, saldoInicial: v })} keyboardType="decimal-pad" />
                <Button title="Abrir caixa" icon="lock-open-outline" onPress={abrirCaixa} />
              </>}
            </Card>
            <OperadoresCaixaView operadorForm={operadorForm} setOperadorForm={setOperadorForm} operadorEditandoId={operadorEditandoId} operadores={operadoresCaixa} salvarOperador={salvarOperador} limparOperador={limparOperador} iniciarEdicaoOperador={iniciarEdicaoOperador} alternarOperador={alternarOperador} />
          </>}

          {tab === "garcons" && <GarconsHubView garcomForm={garcomForm} setGarcomForm={setGarcomForm} garcomEditandoId={garcomEditandoId} setPermGarcom={setPermGarcom} limparGarcom={limparGarcom} criarGarcom={criarGarcom} garcomLimitReached={garcomLimitReached} actionLabel={actionLabel} starterMobile={starterMobile} garcons={garcons} iniciarEdicaoGarcom={iniciarEdicaoGarcom} alternarGarcom={alternarGarcom} removerGarcom={removerGarcom} />}

          {tab === "config" && <>
            <Card title="Geral" icon="business-outline" subtitle="Dados públicos e operação da vitrine.">
              <Field label="Nome" value={rest.nome} onChangeText={(v) => setRest({ ...rest, nome: v })} />
              <Field label="Telefone" value={rest.telefone} onChangeText={(v) => setRest({ ...rest, telefone: v })} />
              <Field label="Endereço" value={rest.endereco || rest.enderecoCompleto} onChangeText={(v) => setRest({ ...rest, endereco: v, enderecoCompleto: v })} multiline />
              <ToggleLine label="Loja aberta" value={rest.aberto !== false} onValueChange={(v) => setRest({ ...rest, aberto: v })} hint="Controla a disponibilidade da vitrine para novos pedidos." />
              <Button title={saving ? "Salvando..." : "Salvar configurações"} icon="save-outline" onPress={salvarConfig} disabled={saving || !!actionLabel} />
            </Card>
            <MercadoPagoHubView rest={rest} mpLoading={mpLoading} conectar={conectarMercadoPago} atualizar={atualizarStatusMercadoPago} desconectar={desconectarMercadoPago} toggleCartao={toggleCartaoVitrine} />
            <WhatsAppBotHubView status={botStatus} qrImageUrl={botQrImageUrl} loading={botLoading} conectar={conectarBot} mostrarQr={buscarQrBot} atualizar={() => carregarStatusBot({ alertar: true })} desconectar={desconectarBot} resetar={resetarBot} />
          </>}
        </ScrollView>

        <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {mainTabs.map((item) => (
            <BottomNavItem key={item.key} item={item} active={tab === item.key} onPress={() => selectTab(item.key)} />
          ))}
          <BottomNavItem item={{ key: "mais", label: "Mais", icon: "apps-outline" }} active={isMoreSelected || moreOpen} onPress={() => setMoreOpen(true)} />
        </View>

        <MoreMenuModal visible={moreOpen} onClose={() => setMoreOpen(false)} items={moreTabs} activeKey={tab} onSelect={selectTab} />
      </SafeAreaView>
    </>
  );

}


function StatusPill({ ok, pending = false, icon, label }) {
  return (
    <View style={[styles.statusPill, ok && styles.statusPillOk, pending && styles.statusPillPending]}>
      <Ionicons name={icon} size={14} color={ok ? "#d1fae5" : pending ? "#fef3c7" : "#fecdd3"} />
      <Text style={[styles.statusPillText, ok && styles.statusPillTextOk, pending && styles.statusPillTextPending]}>{label}</Text>
    </View>
  );
}

function FinancialOverview({ report }) {
  const r = report?.resumo || {};
  const payments = [
    ["Dinheiro", r.dinheiro, "cash-outline"],
    ["Pix", r.pix, "qr-code-outline"],
    ["Crédito", r.credito, "card-outline"],
    ["Débito", r.debito, "card-outline"],
    ["Online", r.online, "globe-outline"],
    ["Outros", r.outros, "ellipsis-horizontal-outline"],
  ].filter(([, value]) => Number(value || 0) > 0);
  const total = Number(r.totalVendas || 0);

  return (
    <Card title="Resumo financeiro de hoje" icon="wallet-outline" subtitle="Somente vendas confirmadas pela regra oficial da API.">
      <View style={styles.financialHero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.financialEyebrow}>TOTAL CONFIRMADO</Text>
          <Text style={styles.financialTotal}>{moeda(total)}</Text>
          <Text style={styles.financialCaption}>{Number(r.pedidos || 0)} pedido(s) • {Number(r.caixas || 0)} caixa(s)</Text>
        </View>
        <View style={styles.financialHeroIcon}><Ionicons name="trending-up-outline" size={26} color="#fff" /></View>
      </View>
      {payments.length ? (
        <View style={styles.paymentGrid}>
          {payments.map(([label, value, icon]) => (
            <View key={label} style={styles.paymentItem}>
              <View style={styles.paymentIcon}><Ionicons name={icon} size={16} color="#ff3b8a" /></View>
              <View style={{ flex: 1 }}><Text style={styles.paymentLabel}>{label}</Text><Text style={styles.paymentValue}>{moeda(value)}</Text></View>
            </View>
          ))}
        </View>
      ) : <Text style={styles.infoBox}>Ainda não há vendas confirmadas hoje.</Text>}
    </Card>
  );
}

function OperationalOverview({ status, counts }) {
  const rows = [
    ["Internet", status.online, "cloud-done-outline", status.online ? "Conectada" : "Indisponível"],
    ["Tempo real", status.socket, "radio-outline", status.socket ? "Ativo" : "Reconectando"],
    ["Caixa", status.caixa, "cash-outline", status.caixa ? "Aberto" : "Fechado"],
    ["Vitrine", status.loja, "storefront-outline", status.loja ? "Aberta" : "Fechada"],
    ["Mercado Pago", status.mercadoPago, "card-outline", status.mercadoPago ? "Conectado" : "Pendente"],
    ["WhatsApp", status.whatsapp, "logo-whatsapp", status.whatsapp ? "Conectado" : "Pendente"],
  ];
  return (
    <Card title="Saúde da operação" icon="pulse-outline" subtitle="Conexões e recursos essenciais do restaurante.">
      <View style={styles.operationGrid}>
        {rows.map(([label, ok, icon, value]) => (
          <View key={label} style={styles.operationItem}>
            <View style={[styles.operationDot, ok && styles.operationDotOk]}><Ionicons name={icon} size={17} color={ok ? "#16a34a" : "#e11d48"} /></View>
            <View style={{ flex: 1 }}><Text style={styles.operationLabel}>{label}</Text><Text style={[styles.operationValue, ok && styles.operationValueOk]}>{value}</Text></View>
          </View>
        ))}
      </View>
      <View style={styles.inventoryStrip}>
        <Text style={styles.inventoryText}>{counts.categorias} categorias</Text><View style={styles.inventoryDivider} />
        <Text style={styles.inventoryText}>{counts.produtos} produtos</Text><View style={styles.inventoryDivider} />
        <Text style={styles.inventoryText}>{counts.mesas} mesas</Text><View style={styles.inventoryDivider} />
        <Text style={styles.inventoryText}>{counts.garcons} garçons</Text>
      </View>
    </Card>
  );
}

function DashboardTile({ label, subtitle, icon, attention = false, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dashboardTile, attention && styles.dashboardTileAttention, pressed && styles.pressed]}>
      <View style={[styles.dashboardTileIcon, attention && styles.dashboardTileIconAttention]}><Ionicons name={icon} size={22} color={attention ? "#fff" : "#ff3b8a"} /></View>
      <Text style={styles.dashboardTileTitle}>{label}</Text>
      <Text style={styles.dashboardTileSubtitle}>{subtitle}</Text>
      <Ionicons name="chevron-forward-outline" size={16} color="#94a3b8" style={styles.dashboardTileArrow} />
    </Pressable>
  );
}

const ORDER_STATUS_META = {
  novo: ["Novo", "#be123c", "#fff1f2"],
  pendente: ["Pendente", "#a16207", "#fefce8"],
  recebido: ["Recebido", "#7e22ce", "#faf5ff"],
  pago: ["Pago", "#0369a1", "#f0f9ff"],
  em_producao: ["Em produção", "#c2410c", "#fff7ed"],
  "em produção": ["Em produção", "#c2410c", "#fff7ed"],
  pronto: ["Pronto", "#047857", "#ecfdf5"],
  em_entrega: ["Em entrega", "#1d4ed8", "#eff6ff"],
  entregue: ["Entregue", "#166534", "#f0fdf4"],
  cancelado: ["Cancelado", "#b91c1c", "#fef2f2"],
};

function OrderStatusBadge({ status }) {
  const key = normalizeText(status).replace(/-/g, "_");
  const [label, color, bg] = ORDER_STATUS_META[key] || [status || "Sem status", "#475569", "#f1f5f9"];
  return <View style={[styles.orderStatus, { backgroundColor: bg }]}><Text style={[styles.orderStatusText, { color }]}>{label}</Text></View>;
}

function OrdersHubView({ title, subtitle, pedidos = [], onStatusChange, aReceber = false, compact = false }) {
  const list = compact ? pedidos.slice(0, 5) : pedidos;
  return (
    <Card title={title} icon={aReceber ? "notifications-outline" : "receipt-outline"} subtitle={subtitle || `${list.length} pedido(s) exibido(s)`}>
      {list.length ? list.map((pedido) => {
        const status = normalizeText(pedido.status || pedido.statusPedido).replace(/-/g, "_");
        const total = Number(pedido.total || pedido.valorTotal || pedido.totalPedido || 0);
        const customer = pedido?.cliente?.nome || pedido.nomeCliente || pedido.clienteNome || "Cliente";
        const origem = pedido.origem || pedido.tipo || pedido.canal || "restaurante";
        const nextActions = [];
        if (["", "novo", "pendente", "recebido", "pago", "aguardando", "aguardando_confirmacao"].includes(status)) nextActions.push(["Aceitar", "em_producao", "checkmark-circle-outline"]);
        if (["em_producao", "em produção"].includes(status)) nextActions.push(["Pronto", "pronto", "checkmark-done-outline"]);
        if (["pronto", "em_entrega"].includes(status)) nextActions.push(["Entregue", "entregue", "flag-outline"]);
        return (
          <View key={getId(pedido) || getPedidoCodigoHub(pedido)} style={styles.orderCard}>
            <View style={styles.orderTop}>
              <View style={styles.orderNumberWrap}><Text style={styles.orderNumber}>#{getPedidoCodigoHub(pedido)}</Text><Text style={styles.orderTime}>{formatDateTimeBR(pedido.pagoEm || pedido.criadoEm || pedido.createdAt)}</Text></View>
              <OrderStatusBadge status={status} />
            </View>
            <Text style={styles.orderCustomer} numberOfLines={1}>{customer}</Text>
            <View style={styles.orderMetaRow}>
              <View style={styles.orderMeta}><Ionicons name="navigate-outline" size={14} color="#64748b" /><Text style={styles.orderMetaText}>{String(origem).replace(/_/g, " ")}</Text></View>
              <Text style={styles.orderTotal}>{moeda(total)}</Text>
            </View>
            {nextActions.length ? <View style={styles.orderActions}>{nextActions.map(([label, nextStatus, icon]) => <MiniButton key={nextStatus} title={label} icon={icon} onPress={() => onStatusChange?.(pedido, nextStatus)} />)}</View> : null}
          </View>
        );
      }) : <EmptyState icon={aReceber ? "notifications-off-outline" : "receipt-outline"} text={aReceber ? "Nenhum pedido aguardando aceite." : "Nenhum pedido encontrado."} />}
    </Card>
  );
}

function ReportSummaryCard({ label, value, icon, accent = false }) {
  return <View style={[styles.reportSummaryCard, accent && styles.reportSummaryCardAccent]}><Ionicons name={icon} size={18} color={accent ? "#fff" : "#ff3b8a"} /><Text style={[styles.reportSummaryLabel, accent && styles.reportSummaryLabelAccent]}>{label}</Text><Text style={[styles.reportSummaryValue, accent && styles.reportSummaryValueAccent]}>{value}</Text></View>;
}

function ReportsView({ filter, setFilter, data, loading, error, onLoad }) {
  const r = data?.resumo || {};
  return (
    <>
      <Card title="Filtros do relatório" icon="options-outline" subtitle="Dados oficiais do caixa e das vendas confirmadas.">
        <Text style={styles.label}>Agrupar por</Text>
        <View style={styles.chipRow}>
          {[['data','Data'],['caixa','Caixa'],['operador','Operador']].map(([value,label]) => <OptionChip key={value} label={label} active={filter.tipo === value} onPress={() => setFilter({ ...filter, tipo: value })} />)}
        </View>
        <View style={styles.responsiveRow}>
          <View style={styles.responsiveField}><Field label="Data inicial (AAAA-MM-DD)" value={filter.inicio} onChangeText={(v) => setFilter({ ...filter, inicio: v })} /></View>
          <View style={styles.responsiveField}><Field label="Data final (AAAA-MM-DD)" value={filter.fim} onChangeText={(v) => setFilter({ ...filter, fim: v })} /></View>
        </View>
        {error ? <Text style={styles.errorBox}>{error}</Text> : null}
        <Button title={loading ? "Gerando relatório..." : "Gerar relatório"} icon="analytics-outline" onPress={() => onLoad(filter)} disabled={loading} />
      </Card>

      <View style={styles.reportSummaryGrid}>
        <ReportSummaryCard label="Faturamento" value={moeda(r.totalVendas)} icon="trending-up-outline" accent />
        <ReportSummaryCard label="Pedidos" value={Number(r.pedidos || 0)} icon="receipt-outline" />
        <ReportSummaryCard label="Caixas" value={Number(r.caixas || 0)} icon="cash-outline" />
        <ReportSummaryCard label="Ticket médio" value={moeda(Number(r.pedidos || 0) ? Number(r.totalVendas || 0) / Number(r.pedidos || 1) : 0)} icon="stats-chart-outline" />
      </View>

      <Card title="Formas de pagamento" icon="card-outline" subtitle="Composição do faturamento confirmado no período.">
        <View style={styles.paymentGrid}>
          {[['Dinheiro',r.dinheiro,'cash-outline'],['Pix',r.pix,'qr-code-outline'],['Crédito',r.credito,'card-outline'],['Débito',r.debito,'card-outline'],['Online',r.online,'globe-outline'],['Outros',r.outros,'ellipsis-horizontal-outline']].map(([label,value,icon]) => (
            <View key={label} style={styles.paymentItem}><View style={styles.paymentIcon}><Ionicons name={icon} size={16} color="#ff3b8a" /></View><View style={{flex:1}}><Text style={styles.paymentLabel}>{label}</Text><Text style={styles.paymentValue}>{moeda(value)}</Text></View></View>
          ))}
        </View>
        {(Number(r.sangrias || 0) > 0 || Number(r.suprimentos || 0) > 0) ? <View style={styles.cashMovementRow}><Text style={styles.cashMovementText}>Suprimentos: {moeda(r.suprimentos)}</Text><Text style={[styles.cashMovementText,{color:'#be123c'}]}>Sangrias: {moeda(r.sangrias)}</Text></View> : null}
      </Card>

      <Card title="Detalhamento" icon="list-outline" subtitle={`${data?.linhas?.length || 0} agrupamento(s) no período.`}>
        {loading ? <ActivityIndicator color="#ff3b8a" /> : data?.linhas?.length ? data.linhas.map((line) => (
          <View key={line.chave || line.label} style={styles.reportLine}>
            <View style={{flex:1}}><Text style={styles.reportLineTitle}>{line.label || line.chave}</Text><Text style={styles.reportLineMeta}>{Number(line.pedidos || 0)} pedido(s) • {Number(line.caixas || 0)} caixa(s)</Text></View>
            <Text style={styles.reportLineValue}>{moeda(line.totalVendas)}</Text>
          </View>
        )) : <EmptyState icon="analytics-outline" text="Gere o relatório para visualizar os dados do período." />}
      </Card>
    </>
  );
}

function BottomNavItem({ item, active, onPress }) {
  const badge = Number(item.badge || 0);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={item.label}>
      <View style={[styles.bottomIconWrap, active && styles.bottomIconWrapActive]}>
        <Ionicons name={active ? String(item.icon).replace('-outline','') : item.icon} size={21} color={active ? "#fff" : "#64748b"} />
        {badge > 0 ? <View style={styles.bottomBadge}><Text style={styles.bottomBadgeText}>{badge > 99 ? "99+" : badge}</Text></View> : null}
      </View>
      <Text style={[styles.bottomText, active && styles.bottomTextActive]} numberOfLines={1}>{item.label}</Text>
    </Pressable>
  );
}

function MoreMenuModal({ visible, onClose, items, activeKey, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.moreSheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}><View><Text style={styles.sheetKicker}>MOVYO HUB</Text><Text style={styles.sheetTitle}>Mais funcionalidades</Text></View><Pressable onPress={onClose} style={styles.sheetClose}><Ionicons name="close-outline" size={22} color="#334155" /></Pressable></View>
          <View style={styles.moreGrid}>
            {items.map((item) => {
              const active = item.key === activeKey;
              return <Pressable key={item.key} onPress={() => onSelect(item.key)} style={({pressed}) => [styles.moreItem, active && styles.moreItemActive, pressed && styles.pressed]}><View style={[styles.moreItemIcon, active && styles.moreItemIconActive]}><Ionicons name={item.icon} size={23} color={active ? "#fff" : "#ff3b8a"} /></View><Text style={[styles.moreItemText, active && styles.moreItemTextActive]}>{item.label}</Text></Pressable>;
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OperadorPicker({ operadores, value, onChange }) {
  return <View style={styles.pickerWrap}><Text style={styles.label}>Operador do caixa</Text><View style={styles.chipRow}>{operadores.length ? operadores.map((op) => <OptionChip key={getId(op)} label={`${op.nome || "Operador"}${String(op.pin || "").trim() ? " • PIN" : ""}`} active={String(value) === String(getId(op))} onPress={() => onChange(getId(op))} icon="person-circle-outline" />) : <Text style={styles.text}>Cadastre um operador abaixo antes de abrir o caixa.</Text>}</View></View>;
}

function OperadoresCaixaView({ operadorForm, setOperadorForm, operadorEditandoId, operadores, salvarOperador, limparOperador, iniciarEdicaoOperador, alternarOperador }) {
  return <>
    <Card title={operadorEditandoId ? "Editar operador" : "Cadastrar operador de caixa"} icon="person-add-outline" subtitle="Operadores usam PIN para abrir e fechar caixa com segurança." action={(operadorEditandoId || operadorForm.nome) ? <MiniButton title="Limpar" icon="close-outline" onPress={limparOperador} /> : null}>
      <Field label="Nome" value={operadorForm.nome} onChangeText={(v) => setOperadorForm({ ...operadorForm, nome: v })} />
      <Field label="Apelido" value={operadorForm.apelido} onChangeText={(v) => setOperadorForm({ ...operadorForm, apelido: v })} />
      <Field label={operadorEditandoId ? "Novo PIN (opcional)" : "PIN opcional"} value={operadorForm.pin} onChangeText={(v) => setOperadorForm({ ...operadorForm, pin: v.replace(/\D/g, "").slice(0, 8) })} keyboardType="number-pad" secureTextEntry />
      <Field label="Observação" value={operadorForm.observacao} onChangeText={(v) => setOperadorForm({ ...operadorForm, observacao: v })} />
      <Text style={styles.label}>Permissões do operador</Text>
      {[
        ["abrirCaixa", "Abrir caixa", "Permite iniciar um novo turno de caixa."],
        ["fecharCaixa", "Fechar caixa", "Permite realizar o fechamento financeiro."],
        ["movimentarCaixa", "Sangrias e suprimentos", "Permite registrar movimentações manuais."],
        ["visualizarRelatorios", "Visualizar relatórios", "Permite consultar dados financeiros."],
        ["gerenciarOperadores", "Gerenciar operadores", "Permite criar e editar outros operadores."],
      ].map(([key, label, hint]) => <ToggleLine key={key} label={label} hint={hint} value={!!normalizeOperatorPerms(operadorForm.permissoes)[key]} onValueChange={(value) => setOperadorForm({ ...operadorForm, permissoes: { ...normalizeOperatorPerms(operadorForm.permissoes), [key]: value } })} />)}
      <ToggleLine label="Operador ativo" value={operadorForm.ativo !== false} onValueChange={(v) => setOperadorForm({ ...operadorForm, ativo: v })} />
      <Button title={operadorEditandoId ? "Salvar operador" : "Cadastrar operador"} icon="save-outline" onPress={salvarOperador} />
    </Card>
    <Card title="Operadores cadastrados" icon="people-outline" subtitle={`${operadores.length} operador(es) no caixa`}>
      {operadores.length ? operadores.map((op) => <View key={getId(op)} style={styles.entityCard}><View style={styles.entityIcon}><Ionicons name="person-circle-outline" size={20} color="#ff3b8a" /></View><View style={{ flex: 1 }}><Text style={styles.categoryName}>{op.nome}</Text><Text style={styles.categoryMeta}>{op.apelido || "Sem apelido"} • {op.ativo === false ? "Inativo" : "Ativo"} {String(op.pin || "").trim() ? "• com PIN" : ""}</Text></View><View style={styles.entityActions}><MiniButton title="Editar" icon="create-outline" onPress={() => iniciarEdicaoOperador(op)} /><MiniButton title={op.ativo === false ? "Ativar" : "Inativar"} danger={op.ativo !== false} icon="power-outline" onPress={() => alternarOperador(op)} /></View></View>) : <EmptyState icon="people-outline" text="Nenhum operador cadastrado." />}
    </Card>
  </>;
}

function MesasHubList({ mesas, onDelete }) {
  return <Card title="Mesas cadastradas" icon="list-outline" subtitle="No Hub-Restaurante, mesas possuem apenas opção de excluir.">
    {mesas.length ? mesas.map((m) => <View key={getId(m)} style={styles.entityCard}><View style={styles.entityIcon}><Ionicons name="restaurant-outline" size={20} color="#ff3b8a" /></View><View style={{ flex: 1 }}><Text style={styles.categoryName}>Mesa {m.numero || m.mesaNumero || getId(m)?.slice(-4)}</Text><Text style={styles.categoryMeta}>{m.status || "livre"}</Text></View><MiniButton title="Excluir" danger icon="trash-outline" onPress={() => onDelete(m)} /></View>) : <EmptyState icon="restaurant-outline" text="Nenhuma mesa cadastrada." />}
  </Card>;
}

function GarconsHubView({ garcomForm, setGarcomForm, garcomEditandoId, setPermGarcom, limparGarcom, criarGarcom, garcomLimitReached, actionLabel, starterMobile, garcons, iniciarEdicaoGarcom, alternarGarcom, removerGarcom }) {
  const perms = [
    ["verPedidos", "Ver pedidos", "eye-outline"], ["verMesas", "Ver mesas", "restaurant-outline"], ["abrirMesa", "Abrir mesa", "lock-open-outline"], ["adicionarItem", "Adicionar item", "add-circle-outline"], ["fecharConta", "Fechar conta", "cash-outline"], ["cancelarPedido", "Cancelar pedido", "ban-outline"],
  ];
  return <>
    <Card title={garcomEditandoId ? "Editar garçom" : "Cadastrar garçom"} icon="person-add-outline" subtitle={starterMobile ? `Starter Mobile: ${garcons.length}/2 garçons cadastrados.` : "Cadastre acesso, PIN e permissões do app."} action={(garcomEditandoId || garcomForm.nome) ? <MiniButton title="Limpar" icon="close-outline" onPress={limparGarcom} /> : null}>
      <Field label="Nome" value={garcomForm.nome} onChangeText={(v) => setGarcomForm({ ...garcomForm, nome: v })} />
      <Field label="Apelido" value={garcomForm.apelido} onChangeText={(v) => setGarcomForm({ ...garcomForm, apelido: v })} />
      <Field label="Telefone" value={garcomForm.telefone} onChangeText={(v) => setGarcomForm({ ...garcomForm, telefone: v })} keyboardType="phone-pad" />
      <Field label={garcomEditandoId ? "Novo PIN (opcional)" : "PIN"} value={garcomForm.pin} onChangeText={(v) => setGarcomForm({ ...garcomForm, pin: v.replace(/\D/g, "").slice(0, 8) })} keyboardType="number-pad" secureTextEntry />
      <Text style={styles.label}>Permissões</Text>
      {perms.map(([key, label, icon]) => <ToggleLine key={key} label={label} value={!!garcomForm.permissoes?.[key]} onValueChange={(v) => setPermGarcom(key, v)} hint={icon ? undefined : undefined} />)}
      <Button title={garcomEditandoId ? "Salvar garçom" : "Criar garçom"} icon="person-add-outline" onPress={criarGarcom} disabled={garcomLimitReached || !!actionLabel} />
    </Card>
    <Card title="Garçons cadastrados" icon="people-outline" subtitle={`${garcons.length} garçom(ns)`}>
      {garcons.length ? garcons.map((g) => <View key={getId(g)} style={styles.entityCard}><View style={styles.entityIcon}><Ionicons name="person-outline" size={20} color="#ff3b8a" /></View><View style={{ flex: 1 }}><Text style={styles.categoryName}>{g.nome || g.name || "Garçom"}</Text><Text style={styles.categoryMeta}>{g.telefone || "sem telefone"} • {g.ativo === false ? "inativo" : "ativo"}</Text><View style={styles.badgeRow}>{Object.entries(normalizePerms(g.permissoes)).filter(([,v]) => v).slice(0,4).map(([k]) => <Pill key={k} active>{k}</Pill>)}</View></View><View style={styles.entityActions}><MiniButton title="Editar" icon="create-outline" onPress={() => iniciarEdicaoGarcom(g)} /><MiniButton title={g.ativo === false ? "Ativar" : "Inativar"} icon="power-outline" onPress={() => alternarGarcom(g)} /><MiniButton title="Remover" danger icon="trash-outline" onPress={() => removerGarcom(g)} /></View></View>) : <EmptyState icon="people-outline" text="Nenhum garçom cadastrado." />}
    </Card>
  </>;
}

function MercadoPagoHubView({ rest, mpLoading, conectar, atualizar, desconectar, toggleCartao }) {
  const conectado = !!(rest?.mercadoPago?.conectado || rest?.mercadoPagoConectado || rest?.recipient_id);
  return <Card title="Mercado Pago" icon="card-outline" subtitle="Integração para Pix/cartão na vitrine e split do marketplace.">
    <View style={styles.statusLine}><Pill active={conectado} danger={!conectado}>{conectado ? "Conectado" : "Não conectado"}</Pill>{rest?.mercadoPago?.userId ? <Text style={styles.text}>User ID: {rest.mercadoPago.userId}</Text> : null}</View>
    <View style={styles.chipRow}>{!conectado ? <MiniButton title={mpLoading ? "Abrindo..." : "Conectar"} icon="link-outline" onPress={conectar} disabled={mpLoading} /> : <MiniButton title="Desconectar" danger icon="unlink-outline" onPress={desconectar} disabled={mpLoading} />}<MiniButton title="Atualizar status" icon="refresh-outline" onPress={atualizar} disabled={mpLoading} /></View>
    <ToggleLine label="Pagamento com cartão na vitrine" value={!!rest.pagamentoCartaoAtivo} onValueChange={toggleCartao} hint={conectado ? "Libera cartão de crédito à vista para o cliente." : "Conecte o Mercado Pago para usar cartão."} />
  </Card>;
}


function WhatsAppBotHubView({ status, qrImageUrl, loading, conectar, mostrarQr, atualizar, desconectar, resetar }) {
  const conectado = !!status?.conectado;
  const ligado = !!status?.ligado;
  return <Card title="WhatsApp Bot" icon="logo-whatsapp" subtitle="Conecte a instância do restaurante. Se já estiver conectada pelo Desktop Movyo, o Hub apenas informa o status.">
    <View style={styles.statusLine}>
      <Pill active={conectado} danger={!conectado && !ligado}>{conectado ? "Conectado" : ligado ? "Aguardando conexão" : "Desligado"}</Pill>
      <Text style={styles.text}>Status: {status?.estado || "desconhecido"}</Text>
    </View>

    {conectado ? <View style={styles.successBox}><Ionicons name="checkmark-circle-outline" size={22} color="#16a34a" /><Text style={styles.successText}>WhatsApp já conectado. Não é necessário gerar novo QR Code.</Text></View> : null}
    {!conectado && ligado ? <Text style={styles.infoBox}>Bot iniciado. Toque em Mostrar QR Code para escanear ou aguarde a atualização do status.</Text> : null}
    {!conectado && !ligado ? <Text style={styles.infoBox}>Clique em Conectar WhatsApp para iniciar a instância do bot deste restaurante.</Text> : null}
    {!!status?.erroConexao ? <Text style={styles.errorBox}>{status.erroConexao}</Text> : null}

    <View style={styles.chipRow}>
      <MiniButton title={loading ? "Aguarde..." : conectado ? "Já conectado" : "Conectar"} icon="logo-whatsapp" onPress={conectar} disabled={loading || conectado} />
      <MiniButton title="Mostrar QR" icon="qr-code-outline" onPress={mostrarQr} disabled={loading || conectado} />
      <MiniButton title="Atualizar" icon="refresh-outline" onPress={atualizar} disabled={loading} />
      <MiniButton title="Desconectar" danger icon="power-outline" onPress={desconectar} disabled={loading || (!ligado && !conectado)} />
      <MiniButton title="Resetar" danger icon="trash-outline" onPress={resetar} disabled={loading} />
    </View>

    {qrImageUrl && !conectado ? <View style={styles.qrBox}>
      <Image source={{ uri: qrImageUrl }} style={styles.qrImage} />
      <Text style={styles.hint}>No WhatsApp, vá em Aparelhos conectados e escaneie este QR Code.</Text>
    </View> : null}
  </Card>;
}

function Metric({ label, value, icon, tone = "pink" }) {
  const tones = { pink: ["#fff1f2", "#ff3b8a"], orange: ["#fff7ed", "#ea580c"], purple: ["#faf5ff", "#9333ea"], green: ["#ecfdf5", "#16a34a"] };
  const [bg, color] = tones[tone] || tones.pink;
  return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: bg }]}><Ionicons name={icon} size={18} color={color} /></View><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue} numberOfLines={1}>{value}</Text></View>;
}

function LicenseStatusCard({ info }) {
  const palette = {
    success: { bg: "#ecfdf5", border: "#bbf7d0", iconBg: "#dcfce7", icon: "#16a34a", title: "#166534", chipBg: "#bbf7d0", chipText: "#166534" },
    warning: { bg: "#fffbeb", border: "#fde68a", iconBg: "#fef3c7", icon: "#f59e0b", title: "#92400e", chipBg: "#fde68a", chipText: "#92400e" },
    danger: { bg: "#fff1f2", border: "#fecdd3", iconBg: "#ffe4e6", icon: "#ef4444", title: "#be123c", chipBg: "#fecdd3", chipText: "#be123c" },
    neutral: { bg: "#f8fafc", border: "#e2e8f0", iconBg: "#f1f5f9", icon: "#64748b", title: "#334155", chipBg: "#e2e8f0", chipText: "#334155" },
  };
  const p = palette[info?.tone] || palette.neutral;
  const chipText = info?.hasDate
    ? info.daysLeft < 0
      ? "Vencida"
      : info.daysLeft === 0
        ? "Vence hoje"
        : `${info.daysLeft} ${info.daysLeft === 1 ? "dia" : "dias"}`
    : "Sem data";

  return (
    <View style={[styles.licenseCard, { backgroundColor: p.bg, borderColor: p.border }]}> 
      <View style={[styles.licenseIcon, { backgroundColor: p.iconBg }]}> 
        <Ionicons name={info?.icon || "shield-checkmark-outline"} size={24} color={p.icon} />
      </View>
      <View style={styles.licenseContent}>
        <Text style={[styles.licenseKicker, { color: p.title }]}>LICENÇA MOVYO</Text>
        <Text style={[styles.licenseTitle, { color: p.title }]}>{info?.title || "Status da licença"}</Text>
        <Text style={styles.licenseSubtitle}>{info?.subtitle || "Acompanhe o vencimento da licença do restaurante."}</Text>
      </View>
      <View style={[styles.licenseChip, { backgroundColor: p.chipBg }]}> 
        <Text style={[styles.licenseChipText, { color: p.chipText }]}>{chipText}</Text>
      </View>
    </View>
  );
}

function CategoriasView(props) {
  const { categoriaForm, setCategoriaForm, setCategoriaTipo, tipoExtraForm, setTipoExtraForm, tipoExtraItem, setTipoExtraItem, adicionarItemAoTipoExtra, adicionarTipoExtraCategoria, removerTipoExtraCategoria, salvarCategoria, limparCategoria, categoriaEditandoId, categorias, categoriasFiltradas, categoriaBusca, setCategoriaBusca, iniciarEdicaoCategoria, deletarCategoria } = props;
  return <>
    <Card title={categoriaEditandoId ? "Editar categoria" : "Cadastrar categoria"} icon="albums-outline" subtitle="Configure categorias simples, pizzas, bordas, adicionais e extras." action={(categoriaEditandoId || categoriaForm.nome) ? <MiniButton title="Limpar" icon="close-outline" onPress={limparCategoria} /> : null}>
      <View style={styles.formHero}><Ionicons name="sparkles-outline" size={20} color="#ff3b8a" /><Text style={styles.formHeroText}>Use categorias para controlar o comportamento do cardápio e liberar opções no produto.</Text></View>
      <Field label="Nome da categoria" value={categoriaForm.nome} onChangeText={(v) => setCategoriaForm({ ...categoriaForm, nome: v })} />
      <Text style={styles.label}>Tipo da categoria</Text>
      <View style={styles.chipRow}>
        <OptionChip icon="fast-food-outline" label="Simples" active={categoriaForm.tipoCategoria === TIPO_CATEGORIA.SIMPLES} onPress={() => setCategoriaTipo(TIPO_CATEGORIA.SIMPLES)} />
        <OptionChip icon="pizza-outline" label="Pizza" active={categoriaForm.tipoCategoria === TIPO_CATEGORIA.PIZZA} onPress={() => setCategoriaTipo(TIPO_CATEGORIA.PIZZA)} />
        <OptionChip icon="git-merge-outline" label="Pizza 2 sabores" active={categoriaForm.tipoCategoria === TIPO_CATEGORIA.PIZZA_DUAS} onPress={() => setCategoriaTipo(TIPO_CATEGORIA.PIZZA_DUAS)} />
      </View>
      {categoriaForm.tipoCategoria === TIPO_CATEGORIA.PIZZA_DUAS ? <Text style={styles.infoBox}>Pizza 2 sabores: cliente escolhe 2 sabores e o preço pode seguir maior valor ou média.</Text> : null}
      {categoriaForm.tipoCategoria !== TIPO_CATEGORIA.SIMPLES ? <>
        <ToggleLine label="Permite bordas" value={categoriaForm.permiteBordas} onValueChange={(v) => setCategoriaForm({ ...categoriaForm, permiteBordas: v })} />
        <ToggleLine label="Permite adicionais" value={categoriaForm.permiteAdicionais} onValueChange={(v) => setCategoriaForm({ ...categoriaForm, permiteAdicionais: v })} />
      </> : null}
      <ToggleLine label="Categoria ativa na vitrine" value={categoriaForm.ativa !== false} onValueChange={(v) => setCategoriaForm({ ...categoriaForm, ativa: v })} />
    </Card>

    <Card title="Grupos extras da categoria" icon="options-outline" subtitle="Ex.: tamanho, ponto da carne, acompanhamentos obrigatórios.">
      <Field label="Nome do grupo" value={tipoExtraForm.nome} onChangeText={(v) => setTipoExtraForm({ ...tipoExtraForm, nome: v })} placeholder="Ex.: Escolha o tamanho" />
      <View style={styles.chipRow}>
        <OptionChip label="Único" active={tipoExtraForm.tipoSelecion !== "multiplo"} onPress={() => setTipoExtraForm({ ...tipoExtraForm, tipoSelecion: "unico", maximoSelecionados: "1" })} />
        <OptionChip label="Múltiplo" active={tipoExtraForm.tipoSelecion === "multiplo"} onPress={() => setTipoExtraForm({ ...tipoExtraForm, tipoSelecion: "multiplo" })} />
      </View>
      <ToggleLine label="Obrigatório" value={tipoExtraForm.obrigatorio} onValueChange={(v) => setTipoExtraForm({ ...tipoExtraForm, obrigatorio: v })} />
      <View style={styles.row}><View style={{ flex: 1 }}><Field label="Mínimo" value={tipoExtraForm.minimoSelecionados} onChangeText={(v) => setTipoExtraForm({ ...tipoExtraForm, minimoSelecionados: v })} keyboardType="number-pad" /></View><View style={{ width: 10 }} /><View style={{ flex: 1 }}><Field label="Máximo" value={tipoExtraForm.maximoSelecionados} onChangeText={(v) => setTipoExtraForm({ ...tipoExtraForm, maximoSelecionados: v })} keyboardType="number-pad" /></View></View>
      <View style={styles.row}><View style={{ flex: 1.4 }}><Field label="Item" value={tipoExtraItem.nome} onChangeText={(v) => setTipoExtraItem({ ...tipoExtraItem, nome: v })} /></View><View style={{ width: 10 }} /><View style={{ flex: 1 }}><Field label="Preço" value={tipoExtraItem.preco} onChangeText={(v) => setTipoExtraItem({ ...tipoExtraItem, preco: v })} keyboardType="decimal-pad" /></View></View>
      <MiniButton title="Adicionar item ao grupo" icon="add-outline" onPress={adicionarItemAoTipoExtra} />
      {tipoExtraForm.itens?.length ? tipoExtraForm.itens.map((it, i) => <Text key={`${it.nome}-${i}`} style={styles.item}>{it.nome} — {moeda(it.preco)}</Text>) : <Text style={styles.text}>Nenhum item no grupo ainda.</Text>}
      <Button title="Adicionar grupo à categoria" icon="add-circle-outline" onPress={adicionarTipoExtraCategoria} />
      {(categoriaForm.tiposExtras || []).length ? <View style={{ marginTop: 12 }}>{categoriaForm.tiposExtras.map((t, i) => <View key={`${t.nome}-${i}`} style={styles.extraCard}><View style={{ flex: 1 }}><Text style={styles.categoryName}>{t.nome}</Text><Text style={styles.categoryMeta}>{t.tipoSelecion === "multiplo" ? "Múltiplo" : "Único"} • {(t.itens || []).length} opções</Text></View><MiniButton title="Remover" danger icon="trash-outline" onPress={() => removerTipoExtraCategoria(i)} /></View>)}</View> : null}
      <Button title={categoriaEditandoId ? "Salvar alterações" : "Cadastrar categoria"} icon="save-outline" onPress={salvarCategoria} />
    </Card>

    <Card title="Categorias cadastradas" icon="list-outline" subtitle={`${categorias.length} categoria(s) no cardápio`}>
      <SearchBox value={categoriaBusca} onChangeText={setCategoriaBusca} placeholder="Buscar categoria..." />
      {categoriasFiltradas.length ? categoriasFiltradas.map((cat) => <CategoryItem key={getId(cat)} cat={cat} onEdit={iniciarEdicaoCategoria} onDelete={deletarCategoria} />) : <EmptyState icon="albums-outline" text="Nenhuma categoria encontrada." />}
    </Card>
  </>;
}

function ProdutosView(props) {
  const { produtoForm, setProdutoForm, produtoEditandoId, categorias, categoriaSelecionada, tempInputs, setTempInputs, adicionarItemProduto, removerItemProduto, adicionarExtraProduto, removerExtraProduto, salvarProduto, limparProduto, produtos, produtosFiltrados, produtoBusca, setProdutoBusca, produtoFiltro, setProdutoFiltro, iniciarEdicaoProduto, deletarProduto } = props;
  return <>
    <Card title={produtoEditandoId ? "Editar produto" : "Cadastrar produto"} icon="fast-food-outline" subtitle="Cadastro rápido com vitrine, cozinha, complementos e extras." action={(produtoEditandoId || produtoForm.nome) ? <MiniButton title="Limpar" icon="close-outline" onPress={limparProduto} /> : null}>
      <Text style={styles.label}>Categoria</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{categorias.map((cat) => <OptionChip key={getId(cat)} label={cat.nome} active={produtoForm.categoria === getId(cat)} onPress={() => setProdutoForm({ ...produtoForm, categoria: getId(cat) })} />)}</ScrollView>
      {categoriaSelecionada ? <Text style={styles.infoBox}>Categoria selecionada: {categoriaSelecionada.nome}</Text> : <Text style={styles.infoBox}>Escolha a categoria para liberar sabores, bordas, adicionais e extras.</Text>}
      <Field label="Nome do produto" value={produtoForm.nome} onChangeText={(v) => setProdutoForm({ ...produtoForm, nome: v })} />
      <Field label="Descrição" value={produtoForm.descricao} onChangeText={(v) => setProdutoForm({ ...produtoForm, descricao: v })} multiline />
      <View style={styles.row}><View style={{ flex: 1 }}><Field label="Preço base" value={produtoForm.precoBase} onChangeText={(v) => setProdutoForm({ ...produtoForm, precoBase: v })} keyboardType="decimal-pad" /></View><View style={{ width: 10 }} /><View style={{ flex: 1 }}><Field label="Imagem URL" value={produtoForm.imagem} onChangeText={(v) => setProdutoForm({ ...produtoForm, imagem: v })} /></View></View>
      {produtoForm.imagem ? <Image source={{ uri: produtoForm.imagem }} style={styles.previewImage} /> : <View style={styles.previewPlaceholder}><Ionicons name="image-outline" size={24} color="#94a3b8" /><Text style={styles.hint}>Prévia da imagem do produto</Text></View>}
      <View style={styles.toggleGrid}>
        <ToggleLine label="Destaque" value={produtoForm.destaque} onValueChange={(v) => setProdutoForm({ ...produtoForm, destaque: v })} />
        <ToggleLine label="Ativo na vitrine" value={produtoForm.ativoVitrine !== false} onValueChange={(v) => setProdutoForm({ ...produtoForm, ativoVitrine: v })} />
        <ToggleLine label="Imprimir na cozinha" value={!!produtoForm.imprimir} onValueChange={(v) => setProdutoForm({ ...produtoForm, imprimir: v })} />
      </View>
      <Field label="Receita vinculada (ID opcional)" value={produtoForm.receita} onChangeText={(v) => setProdutoForm({ ...produtoForm, receita: v })} />
      <Button title={produtoEditandoId ? "Salvar alterações" : "Cadastrar produto"} icon="save-outline" onPress={salvarProduto} />
    </Card>

    {categoriaSelecionada?.permiteSabores ? <GrupoProduto title="Sabores" groupKey="sabores" items={produtoForm.sabores} temp={tempInputs.sabores} setTemp={(obj) => setTempInputs({ ...tempInputs, sabores: obj })} onAdd={() => adicionarItemProduto("sabores")} onRemove={(i) => removerItemProduto("sabores", i)} /> : null}
    {categoriaSelecionada?.permiteBordas ? <GrupoProduto title="Bordas" groupKey="bordas" items={produtoForm.bordas} temp={tempInputs.bordas} setTemp={(obj) => setTempInputs({ ...tempInputs, bordas: obj })} onAdd={() => adicionarItemProduto("bordas")} onRemove={(i) => removerItemProduto("bordas", i)} /> : null}
    {categoriaSelecionada?.permiteAdicionais ? <GrupoProduto title="Adicionais" groupKey="adicionais" items={produtoForm.adicionais} temp={tempInputs.adicionais} setTemp={(obj) => setTempInputs({ ...tempInputs, adicionais: obj })} onAdd={() => adicionarItemProduto("adicionais")} onRemove={(i) => removerItemProduto("adicionais", i)} /> : null}
    <GrupoProduto title="Complementos" groupKey="complementos" items={produtoForm.complementos} temp={tempInputs.complementos} setTemp={(obj) => setTempInputs({ ...tempInputs, complementos: obj })} onAdd={() => adicionarItemProduto("complementos")} onRemove={(i) => removerItemProduto("complementos", i)} />
    {(categoriaSelecionada?.tiposExtras || []).map((tipo) => <GrupoExtraProduto key={tipo.nome} tipo={tipo} items={produtoForm.extras?.[tipo.nome] || []} temp={tempInputs.extras?.[tipo.nome] || emptyItemPreco()} setTemp={(obj) => setTempInputs({ ...tempInputs, extras: { ...(tempInputs.extras || {}), [tipo.nome]: obj } })} onAdd={() => adicionarExtraProduto(tipo.nome)} onRemove={(i) => removerExtraProduto(tipo.nome, i)} />)}

    <Card title="Produtos cadastrados" icon="list-outline" subtitle={`${produtos.length} produto(s) no cardápio`}>
      <SearchBox value={produtoBusca} onChangeText={setProdutoBusca} placeholder="Buscar por produto ou categoria..." />
      <View style={styles.chipRow}>
        <OptionChip label="Todos" active={produtoFiltro === "todos"} onPress={() => setProdutoFiltro("todos")} />
        <OptionChip label="Na vitrine" active={produtoFiltro === "ativos"} onPress={() => setProdutoFiltro("ativos")} />
        <OptionChip label="Fora" active={produtoFiltro === "inativos"} onPress={() => setProdutoFiltro("inativos")} />
        <OptionChip label="Destaques" active={produtoFiltro === "destaques"} onPress={() => setProdutoFiltro("destaques")} />
      </View>
      {produtosFiltrados.length ? produtosFiltrados.slice(0, 120).map((p) => <ProductItem key={getId(p)} prod={p} categoria={categorias.find((c) => getId(c) === (getId(p.categoria) || p.categoria))?.nome} onEdit={iniciarEdicaoProduto} onDelete={deletarProduto} />) : <EmptyState icon="fast-food-outline" text="Nenhum produto encontrado." />}
    </Card>
  </>;
}

function GrupoProduto({ title, items, temp, setTemp, onAdd, onRemove }) {
  return <Card title={title} icon="add-circle-outline"><View style={styles.row}><View style={{ flex: 1.4 }}><Field label="Nome" value={temp.nome} onChangeText={(v) => setTemp({ ...temp, nome: v })} /></View><View style={{ width: 10 }} /><View style={{ flex: 1 }}><Field label="Preço" value={temp.preco} onChangeText={(v) => setTemp({ ...temp, preco: v })} keyboardType="decimal-pad" /></View></View><MiniButton title={`Adicionar ${title.toLowerCase()}`} icon="add-outline" onPress={onAdd} />{items?.length ? items.map((it, i) => <View key={`${it.nome}-${i}`} style={styles.optionRow}><Text style={styles.itemFlex}>{it.nome} — {moeda(it.preco)}</Text><MiniButton title="Remover" danger icon="trash-outline" onPress={() => onRemove(i)} /></View>) : <Text style={styles.text}>Nenhum item adicionado.</Text>}</Card>;
}

function GrupoExtraProduto({ tipo, items, temp, setTemp, onAdd, onRemove }) {
  return <Card title={tipo.nome} icon="options-outline" subtitle={`${tipo.tipoSelecion === "multiplo" ? "Múltipla escolha" : "Escolha única"} • min ${tipo.minimoSelecionados || 0} máx ${tipo.maximoSelecionados || 1}`}><View style={styles.row}><View style={{ flex: 1.4 }}><Field label="Nome" value={temp.nome} onChangeText={(v) => setTemp({ ...temp, nome: v })} /></View><View style={{ width: 10 }} /><View style={{ flex: 1 }}><Field label="Preço" value={temp.preco} onChangeText={(v) => setTemp({ ...temp, preco: v })} keyboardType="decimal-pad" /></View></View><MiniButton title="Adicionar opção" icon="add-outline" onPress={onAdd} />{items?.length ? items.map((it, i) => <View key={`${it.nome}-${i}`} style={styles.optionRow}><Text style={styles.itemFlex}>{it.nome} — {moeda(it.preco)}</Text><MiniButton title="Remover" danger icon="trash-outline" onPress={() => onRemove(i)} /></View>) : <Text style={styles.text}>Nenhum item personalizado no produto.</Text>}</Card>;
}

function CategoryItem({ cat, onEdit, onDelete }) {
  const tipo = cat.tipoCategoria || (cat.pizzaMultisabor ? "pizza 2 sabores" : cat.permiteSabores ? "pizza" : "simples");
  return <View style={styles.entityCard}><View style={styles.entityIcon}><Ionicons name={tipo.includes("pizza") ? "pizza-outline" : "albums-outline"} size={20} color="#ff3b8a" /></View><View style={{ flex: 1 }}><Text style={styles.categoryName}>{cat.nome}</Text><Text style={styles.categoryMeta}>{cat.ativa === false ? "Inativa" : "Ativa"} • {tipo} • {(cat.tiposExtras || []).length} grupos extras</Text></View><View style={styles.entityActions}><MiniButton title="Editar" icon="create-outline" onPress={() => onEdit(cat)} /><MiniButton title="Excluir" danger icon="trash-outline" onPress={() => onDelete(cat)} /></View></View>;
}

function ProductItem({ prod, categoria, onEdit, onDelete }) {
  return <View style={styles.entityCard}>{prod.imagem ? <Image source={{ uri: prod.imagem }} style={styles.thumb} /> : <View style={styles.thumbPlaceholder}><Ionicons name="fast-food-outline" size={20} color="#94a3b8" /></View>}<View style={{ flex: 1 }}><Text style={styles.categoryName}>{prod.nome}</Text><Text style={styles.categoryMeta}>{categoria || "Sem categoria"} • {moeda(prod.precoBase ?? prod.preco)} • {prod.ativoVitrine === false ? "fora da vitrine" : "na vitrine"}</Text><View style={styles.badgeRow}>{prod.destaque ? <Pill active>Destaque</Pill> : null}{prod.imprimir === false || prod.imprimeNaCozinha === false ? <Pill danger>Sem cozinha</Pill> : null}</View></View><View style={styles.entityActions}><MiniButton title="Editar" icon="create-outline" onPress={() => onEdit(prod)} /><MiniButton title="Excluir" danger icon="trash-outline" onPress={() => onDelete(prod)} /></View></View>;
}

function List({ title, items }) {
  return <Card title={title} icon="list-outline">{items.length ? items.slice(0, 40).map((x, i) => <Text key={i} style={styles.item}>{x}</Text>) : <EmptyState icon="file-tray-outline" text="Nenhum registro encontrado." />}</Card>;
}

function EmptyState({ icon, text }) {
  return <View style={styles.emptyState}><Ionicons name={icon} size={28} color="#94a3b8" /><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f6f7fb" },
  pickerWrap: { marginBottom: 10 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f172a", gap: 12 },
  loading: { color: "#fff", fontWeight: "900", marginTop: 8 },
  inlineLoader: { position: "absolute", zIndex: 20, top: 48, left: 18, right: 18, minHeight: 48, borderRadius: 18, backgroundColor: "rgba(255,255,255,.96)", borderWidth: 1, borderColor: "#ffe4ee", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, shadowColor: "#0f172a", shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  inlineLoaderText: { color: "#334155", fontWeight: "900" },
  hero: { paddingTop: 52, paddingHorizontal: 18, paddingBottom: 16, backgroundColor: "#0f172a", borderBottomLeftRadius: 32, borderBottomRightRadius: 32, shadowColor: "#0f172a", shadowOpacity: 0.25, shadowRadius: 18, elevation: 8 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  kicker: { fontSize: 11, color: "#fb7185", fontWeight: "900", letterSpacing: 1.4 },
  logo: { fontSize: 24, fontWeight: "900", color: "#fff", marginTop: 2 },
  sub: { marginTop: 4, color: "#cbd5e1", fontWeight: "700" },
  logout: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#ff3b8a", alignItems: "center", justifyContent: "center" },
  quickScroll: { gap: 8, marginTop: 18, paddingRight: 8 },
  quickAction: { minWidth: 92, minHeight: 58, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 10 },
  quickActionActive: { backgroundColor: "#ff3b8a" },
  quickText: { marginTop: 4, fontSize: 10, fontWeight: "900", color: "#334155" },
  quickTextActive: { color: "#fff" },
  content: { padding: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 },
  sectionKicker: { fontSize: 11, color: "#64748b", fontWeight: "900", textTransform: "uppercase" },
  sectionTitle: { fontSize: 24, color: "#0f172a", fontWeight: "900" },
  licenseCard: { marginBottom: 12, borderRadius: 24, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  licenseIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  licenseContent: { flex: 1, minWidth: 0 },
  licenseKicker: { fontSize: 10, fontWeight: "900", letterSpacing: 0.9, marginBottom: 2 },
  licenseTitle: { fontSize: 18, fontWeight: "900" },
  licenseSubtitle: { marginTop: 2, color: "#475569", fontSize: 12, fontWeight: "800", lineHeight: 17 },
  licenseChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  licenseChipText: { fontSize: 11, fontWeight: "900" },
  metrics: { flexDirection: "row", gap: 10, marginBottom: 12 },
  metric: { flex: 1, backgroundColor: "#fff", borderRadius: 22, padding: 12, borderWidth: 1, borderColor: "#e2e8f0", shadowColor: "#0f172a", shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  metricIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#fff1f2", marginBottom: 7 },
  metricLabel: { fontSize: 10, color: "#64748b", fontWeight: "800" },
  metricValue: { fontSize: 15, color: "#0f172a", fontWeight: "900", marginTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 26, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#e2e8f0", shadowColor: "#0f172a", shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 },
  cardTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  iconBubble: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff1f2", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  cardSubtitle: { fontSize: 11, color: "#64748b", fontWeight: "700", marginTop: 2 },
  formHero: { flexDirection: "row", gap: 9, backgroundColor: "#fff7fb", borderWidth: 1, borderColor: "#ffe4ee", padding: 12, borderRadius: 18, marginBottom: 12 },
  formHeroText: { flex: 1, color: "#475569", fontWeight: "800", fontSize: 12, lineHeight: 17 },
  field: { marginBottom: 10 },
  label: { fontSize: 12, color: "#64748b", fontWeight: "900", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12, color: "#0f172a", backgroundColor: "#f8fafc", fontWeight: "700" },
  inputMultiline: { minHeight: 82, textAlignVertical: "top" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 17, backgroundColor: "#f8fafc", paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, minHeight: 44, color: "#0f172a", fontWeight: "800" },
  button: { marginTop: 8, backgroundColor: "#ff3b8a", borderRadius: 999, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  buttonDanger: { backgroundColor: "#ef4444" },
  buttonGhost: { backgroundColor: "#f1f5f9" },
  buttonText: { color: "#fff", fontWeight: "900" },
  buttonGhostText: { color: "#334155" },
  miniButton: { minHeight: 34, borderRadius: 999, backgroundColor: "#f1f5f9", paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  miniDanger: { backgroundColor: "#fff1f2" },
  miniText: { fontSize: 11, fontWeight: "900", color: "#334155" },
  miniDangerText: { color: "#ef4444" },
  text: { color: "#475569", fontWeight: "700", marginBottom: 8 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", color: "#334155", fontWeight: "800" },
  itemFlex: { flex: 1, paddingVertical: 9, color: "#334155", fontWeight: "800" },
  toggleLine: { marginVertical: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#eef2f7", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  toggleGrid: { gap: 2 },
  rememberText: { fontWeight: "900", color: "#334155", flex: 1 },
  hint: { fontSize: 11, color: "#64748b", fontWeight: "700", marginTop: 2, marginBottom: 8 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#e2e8f0", marginBottom: 6 },
  pillActive: { backgroundColor: "#dcfce7" },
  pillDanger: { backgroundColor: "#fff1f2" },
  pillText: { fontSize: 11, fontWeight: "900", color: "#475569" },
  pillTextActive: { color: "#166534" },
  pillTextDanger: { color: "#ef4444" },
  row: { flexDirection: "row" },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  optionChip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", alignItems: "center", gap: 5 },
  optionChipActive: { backgroundColor: "#ff3b8a", borderColor: "#ff3b8a" },
  optionChipText: { fontSize: 12, fontWeight: "900", color: "#334155" },
  optionChipTextActive: { color: "#fff" },
  infoBox: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 12, color: "#475569", fontWeight: "800", marginBottom: 10 },
  extraCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 16, backgroundColor: "#f8fafc", marginTop: 8 },
  entityCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  entityIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#fff1f2" },
  entityActions: { alignItems: "flex-end", gap: 6 },
  categoryName: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  categoryMeta: { fontSize: 12, fontWeight: "800", color: "#64748b", marginTop: 2 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  previewImage: { width: "100%", height: 165, borderRadius: 20, backgroundColor: "#e2e8f0", marginBottom: 10 },
  previewPlaceholder: { width: "100%", height: 126, borderRadius: 20, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  thumb: { width: 58, height: 58, borderRadius: 16, backgroundColor: "#e2e8f0" },
  thumbPlaceholder: { width: 58, height: 58, borderRadius: 16, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  emptyState: { minHeight: 110, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#f8fafc", borderRadius: 20, borderWidth: 1, borderColor: "#eef2f7" },
  emptyText: { color: "#64748b", fontWeight: "900" },
  successBox: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0", borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  successText: { flex: 1, color: "#166534", fontWeight: "900", fontSize: 12, lineHeight: 17 },
  errorBox: { backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3", borderRadius: 16, padding: 12, color: "#be123c", fontWeight: "900", marginBottom: 10 },
  qrBox: { alignItems: "center", backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 22, padding: 14, marginTop: 8 },
  qrImage: { width: 250, height: 250, borderRadius: 16, backgroundColor: "#fff" },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "47%", minHeight: 86, borderRadius: 20, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e2e8f0", padding: 8 },
  tileAttention: { borderColor: "rgba(255,59,138,0.55)", backgroundColor: "#fff1f2" },
  tileText: { marginTop: 6, fontWeight: "900", color: "#334155", textAlign: "center" },
  tileSub: { marginTop: 4, color: "#64748b", fontSize: 11, fontWeight: "800", textAlign: "center" },
  bottomNav: { position: "absolute", left: 10, right: 10, bottom: 10, minHeight: 70, backgroundColor: "#fff", borderRadius: 26, borderWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 6, shadowColor: "#0f172a", shadowOpacity: 0.14, shadowRadius: 16, elevation: 8 },
  bottomItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  bottomText: { fontSize: 8, fontWeight: "900", color: "#94a3b8", marginTop: 3 },
  bottomTextActive: { color: "#ff3b8a" },
  // Layout premium responsivo
  contentContainer: { paddingHorizontal: 16, paddingTop: 16 },
  contentContainerTablet: { width: "100%", maxWidth: 1040, alignSelf: "center", paddingHorizontal: 24 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 2 },
  brandLine: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  heroMark: { width: 45, height: 45, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.16)", borderWidth: 1, borderColor: "rgba(255,255,255,.22)" },
  heroMarkText: { color: "#fff", fontSize: 23, fontWeight: "900" },
  heroTopTablet: { maxWidth: 1040, width: "100%", alignSelf: "center" },
  heroStatusRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 15 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(225,29,72,.24)", borderWidth: 1, borderColor: "rgba(254,205,211,.25)" },
  statusPillOk: { backgroundColor: "rgba(22,163,74,.22)", borderColor: "rgba(187,247,208,.25)" },
  statusPillPending: { backgroundColor: "rgba(245,158,11,.22)", borderColor: "rgba(253,230,138,.25)" },
  statusPillText: { fontSize: 10, color: "#fecdd3", fontWeight: "900" },
  statusPillTextOk: { color: "#d1fae5" },
  statusPillTextPending: { color: "#fef3c7" },
  syncText: { fontSize: 11, color: "#94a3b8", fontWeight: "700", marginTop: 4 },
  refreshButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ffe4ee", alignItems: "center", justifyContent: "center", shadowColor: "#0f172a", shadowOpacity: .07, shadowRadius: 10, elevation: 2 },
  pressed: { opacity: .72, transform: [{ scale: .985 }] },
  loadingLogo: { width: 68, height: 68, borderRadius: 23, backgroundColor: "rgba(255,255,255,.17)", borderWidth: 1, borderColor: "rgba(255,255,255,.25)", alignItems: "center", justifyContent: "center" },
  loadingLogoText: { fontSize: 34, fontWeight: "900", color: "#fff" },

  financialHero: { minHeight: 112, borderRadius: 22, padding: 17, marginBottom: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#111827" },
  financialEyebrow: { color: "#fda4af", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  financialTotal: { color: "#fff", fontSize: 27, fontWeight: "900", marginTop: 5 },
  financialCaption: { color: "#cbd5e1", fontSize: 11, fontWeight: "700", marginTop: 5 },
  financialHeroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#ff3b8a", alignItems: "center", justifyContent: "center" },
  paymentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  paymentItem: { minWidth: "47%", flexGrow: 1, flexBasis: 145, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderRadius: 17, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#eef2f7" },
  paymentIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#fff1f2" },
  paymentLabel: { fontSize: 10, color: "#64748b", fontWeight: "800" },
  paymentValue: { fontSize: 13, color: "#0f172a", fontWeight: "900", marginTop: 2 },

  operationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  operationItem: { minWidth: "47%", flexGrow: 1, flexBasis: 145, flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderRadius: 17, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#eef2f7" },
  operationDot: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#fff1f2" },
  operationDotOk: { backgroundColor: "#ecfdf5" },
  operationLabel: { fontSize: 10, fontWeight: "800", color: "#64748b" },
  operationValue: { marginTop: 2, fontSize: 12, fontWeight: "900", color: "#be123c" },
  operationValueOk: { color: "#166534" },
  inventoryStrip: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 7, padding: 10, borderRadius: 15, backgroundColor: "#111827" },
  inventoryText: { color: "#e2e8f0", fontSize: 10, fontWeight: "800" },
  inventoryDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#ff3b8a" },

  dashboardTile: { width: "48%", minHeight: 112, borderRadius: 21, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", padding: 13, justifyContent: "flex-end", overflow: "hidden" },
  dashboardTileAttention: { backgroundColor: "#fff1f2", borderColor: "#fda4af" },
  dashboardTileIcon: { width: 41, height: 41, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#fff1f2", marginBottom: 10 },
  dashboardTileIconAttention: { backgroundColor: "#ff3b8a" },
  dashboardTileTitle: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  dashboardTileSubtitle: { color: "#64748b", fontSize: 10, fontWeight: "700", marginTop: 3, paddingRight: 18 },
  dashboardTileArrow: { position: "absolute", right: 10, bottom: 12 },

  orderCard: { borderRadius: 20, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff", padding: 13, marginBottom: 10, shadowColor: "#0f172a", shadowOpacity: .04, shadowRadius: 8, elevation: 1 },
  orderTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  orderNumberWrap: { flex: 1, minWidth: 0 },
  orderNumber: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  orderTime: { color: "#94a3b8", fontSize: 10, fontWeight: "700", marginTop: 2 },
  orderStatus: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  orderStatusText: { fontSize: 10, fontWeight: "900" },
  orderCustomer: { color: "#334155", fontSize: 13, fontWeight: "800", marginTop: 10 },
  orderMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 },
  orderMeta: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  orderMetaText: { color: "#64748b", fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  orderTotal: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  orderActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f1f5f9" },

  reportSummaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 14 },
  reportSummaryCard: { width: "48%", flexGrow: 1, minHeight: 105, borderRadius: 21, padding: 13, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", justifyContent: "space-between", shadowColor: "#0f172a", shadowOpacity: .05, shadowRadius: 9, elevation: 1 },
  reportSummaryCardAccent: { backgroundColor: "#111827", borderColor: "#111827" },
  reportSummaryLabel: { color: "#64748b", fontSize: 10, fontWeight: "800", marginTop: 8 },
  reportSummaryLabelAccent: { color: "#cbd5e1" },
  reportSummaryValue: { color: "#0f172a", fontSize: 18, fontWeight: "900", marginTop: 3 },
  reportSummaryValueAccent: { color: "#fff" },
  reportLine: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  reportLineTitle: { color: "#0f172a", fontSize: 13, fontWeight: "900" },
  reportLineMeta: { color: "#64748b", fontSize: 10, fontWeight: "700", marginTop: 3 },
  reportLineValue: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  responsiveRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  responsiveField: { flex: 1, minWidth: 155 },
  cashMovementRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, padding: 11, borderRadius: 15, backgroundColor: "#f8fafc" },
  cashMovementText: { color: "#166534", fontSize: 11, fontWeight: "900" },

  bottomIconWrap: { width: 38, height: 32, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bottomIconWrapActive: { backgroundColor: "#ff3b8a" },
  bottomBadge: { position: "absolute", right: -7, top: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: "#e11d48", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  bottomBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,.55)", justifyContent: "flex-end", padding: 10 },
  moreSheet: { width: "100%", maxWidth: 720, alignSelf: "center", backgroundColor: "#fff", borderRadius: 30, padding: 17, paddingBottom: 25, shadowColor: "#000", shadowOpacity: .2, shadowRadius: 24, elevation: 15 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: "#cbd5e1", alignSelf: "center", marginBottom: 13 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 15 },
  sheetKicker: { color: "#ff3b8a", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  sheetTitle: { color: "#0f172a", fontSize: 22, fontWeight: "900", marginTop: 2 },
  sheetClose: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" },
  moreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moreItem: { width: "31%", flexGrow: 1, minWidth: 96, minHeight: 102, borderRadius: 20, padding: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  moreItemActive: { backgroundColor: "#fff1f2", borderColor: "#fda4af" },
  moreItemIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#fff1f2" },
  moreItemIconActive: { backgroundColor: "#ff3b8a" },
  moreItemText: { marginTop: 8, color: "#334155", fontSize: 11, fontWeight: "900", textAlign: "center" },
  moreItemTextActive: { color: "#be123c" },

  // Sobrescritas finais para iOS, Android e tablets
  hero: { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 17, backgroundColor: "#0f172a", borderBottomLeftRadius: 30, borderBottomRightRadius: 30, shadowColor: "#0f172a", shadowOpacity: .22, shadowRadius: 16, elevation: 7 },
  content: { flex: 1 },
  metric: { minWidth: "47%", flexGrow: 1, flexBasis: 145, backgroundColor: "#fff", borderRadius: 21, padding: 13, borderWidth: 1, borderColor: "#e2e8f0", shadowColor: "#0f172a", shadowOpacity: .06, shadowRadius: 10, elevation: 2 },
  metricValue: { fontSize: 17, color: "#0f172a", fontWeight: "900", marginTop: 5 },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  bottomNav: { position: "absolute", left: 10, right: 10, bottom: 7, minHeight: 69, backgroundColor: "rgba(255,255,255,.98)", borderRadius: 25, borderWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-around", paddingTop: 7, paddingHorizontal: 5, shadowColor: "#0f172a", shadowOpacity: .16, shadowRadius: 18, elevation: 10 },
  bottomItem: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "flex-start", paddingVertical: 1 },
  bottomText: { fontSize: 9, fontWeight: "900", color: "#94a3b8", marginTop: 3 },
  bottomTextActive: { color: "#ff3b8a" },

});
