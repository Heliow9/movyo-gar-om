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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, authEvents } from "../api/api";
import { clearSession, getSession, updateSessionRestaurantePatch } from "../api/storage/session";
import { getAuthBlockMessageFromError, getRestauranteAccessBlockMessage } from "../utils/licenseGuard";
import { connectSocket, getSocket } from "../socket/socket";

const TIPO_CATEGORIA = { SIMPLES: "simples", PIZZA: "pizza", PIZZA_DUAS: "pizza_duas" };
const MOCK_IMAGE = "https://cdn.pixabay.com/photo/2017/12/09/08/18/pizza-3007395_960_720.jpg";
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const onlyNumber = (v) => String(v || "").replace(/[^0-9.,-]/g, "").replace(",", ".");
const getId = (o) => o?._id || o?.id;

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
const emptyOperador = () => ({ nome: "", apelido: "", pin: "", observacao: "", ativo: true });
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

  const starterMobile = String(rest?.plano || "").toLowerCase() === "starter-mobile";
  const garcomLimitReached = starterMobile && !garcomEditandoId && garcons.length >= 2;
  const operadoresAtivos = useMemo(() => operadoresCaixa.filter((o) => o?.ativo !== false), [operadoresCaixa]);
  const operadorAbertura = useMemo(() => operadoresCaixa.find((o) => String(getId(o)) === String(caixaForm.operadorId)), [operadoresCaixa, caixaForm.operadorId]);
  const operadorFechamento = useMemo(() => operadoresCaixa.find((o) => String(getId(o)) === String(caixa?.operadorId || caixa?.operadorCaixaId)), [operadoresCaixa, caixa]);
  const fechamentoExigePin = !!String(caixa?.operador?.pin || caixa?.operadorPin || operadorFechamento?.pin || "").trim();
  const aberturaExigePin = !!String(operadorAbertura?.pin || "").trim();

  const categoriaSelecionada = useMemo(() => categorias.find((c) => getId(c) === produtoForm.categoria), [categorias, produtoForm.categoria]);
  const resumo = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const pedidosHoje = pedidos.filter((p) => String(p.criadoEm || p.createdAt || "").slice(0, 10) === hoje || pedidos.length <= 20);
    const totalHoje = pedidosHoje.reduce((acc, p) => acc + Number(p.total || p.valorTotal || 0), 0);
    const pendentes = pedidos.filter((p) => ["pendente", "preparando", "em preparo", "aceito"].includes(String(p.status || "").toLowerCase())).length;
    return { totalHoje, pendentes, mesasOcupadas: mesas.filter((m) => String(m.status).toLowerCase() !== "livre").length };
  }, [pedidos, mesas]);

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
      const localBlock = getRestauranteAccessBlockMessage(s?.restaurante);
      if (localBlock) { authEvents.emit({ type: "AUTH_LOGOUT_REQUIRED", message: localBlock }); return; }

      const me = await api.get("/api/restaurantes/me");
      const r = me.data?.restaurante || me.data || {};
      const remoteBlock = getRestauranteAccessBlockMessage(r);
      if (remoteBlock) { authEvents.emit({ type: "AUTH_LOGOUT_REQUIRED", message: remoteBlock }); return; }

      setRest(r);
      await updateSessionRestaurantePatch(r);
      const id = getId(r) || getId(s?.restaurante);
      const reqs = [
        api.get(`/api/categorias/${id}`).catch(() => ({ data: [] })),
        api.get(`/api/produtos/${id}`).catch(() => ({ data: [] })),
        api.get(`/api/mesas/restaurante/${id}`).catch(() => ({ data: [] })),
        api.get("/api/garcons").catch(() => ({ data: [] })),
        api.get("/api/garcons/app/pedidos").catch(() => ({ data: [] })),
        api.get(`/api/caixa/${id}/atual`).catch(() => ({ data: null })),
        api.get(`/api/caixa/${id}/operadores`).catch(() => ({ data: [] })),
        api.get(`/api/mercadopago/status/${id}`).catch(() => ({ data: null })),
        api.get(`/api/bot/status/${id}`).catch(() => ({ data: null })),
      ];
      const [c, p, m, g, pe, cx, op, mp, bot] = await Promise.all(reqs);
      setCategorias(Array.isArray(c.data) ? c.data : c.data?.categorias || c.data?.items || []);
      setProdutos(Array.isArray(p.data) ? p.data : p.data?.produtos || p.data?.items || []);
      setMesas(Array.isArray(m.data) ? m.data : m.data?.mesas || m.data?.items || []);
      setGarcons((Array.isArray(g.data) ? g.data : g.data?.garcons || g.data?.items || []).map((item) => ({ ...item, permissoes: normalizePerms(item?.permissoes) })));
      setPedidos(Array.isArray(pe.data) ? pe.data : pe.data?.pedidos || pe.data?.items || []);
      setCaixa(cx.data?.caixa || cx.data?.sessao || cx.data || null);
      setOperadoresCaixa(Array.isArray(op.data) ? op.data : op.data?.operadores || op.data?.items || []);
      if (mp.data) setRest((prev) => ({ ...prev, mercadoPago: { ...(prev?.mercadoPago || {}), ...mp.data } }));
      if (bot.data) setBotStatus(normalizarBotStatus(bot.data));
    } catch (e) {
      const blockMsg = getAuthBlockMessageFromError(e);
      if (blockMsg) { authEvents.emit({ type: "AUTH_LOGOUT_REQUIRED", message: blockMsg }); return; }
      Alert.alert("Erro", e?.response?.data?.mensagem || e?.response?.data?.message || e.message || "Falha ao carregar o Hub.");
    } finally {
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
    eventos.forEach((ev) => socket?.on?.(ev, atualizar));
    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      const current = getSocket();
      eventos.forEach((ev) => current?.off?.(ev, atualizar));
    };
  }, [restauranteId, refreshDashboardNow]);

  useEffect(() => {
    if (tab !== "dashboard") return undefined;
    const id = setInterval(() => refreshDashboardNow(), 20000);
    return () => clearInterval(id);
  }, [tab, refreshDashboardNow]);

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
  const iniciarEdicaoOperador = (op) => { setOperadorEditandoId(getId(op)); setOperadorForm({ nome: op.nome || "", apelido: op.apelido || "", pin: "", observacao: op.observacao || "", ativo: op.ativo !== false }); };
  const salvarOperador = async () => {
    if (!String(operadorForm.nome || "").trim()) return Alert.alert("Ops", "Informe o nome do operador.");
    await runAction(operadorEditandoId ? "Salvando operador..." : "Cadastrando operador...", async () => {
      const payload = { nome: operadorForm.nome.trim(), apelido: operadorForm.apelido?.trim() || null, observacao: operadorForm.observacao || "", ativo: operadorForm.ativo !== false };
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

  const tabs = [["dashboard", "Início", "grid-outline"], ["categorias", "Categorias", "albums-outline"], ["produtos", "Produtos", "fast-food-outline"], ["mesas", "Mesas", "restaurant-outline"], ["pedidos", "Pedidos", "receipt-outline"], ["caixa", "Caixa", "cash-outline"], ["garcons", "Garçons", "people-outline"], ["config", "Config", "settings-outline"]];
  const quickTabs = tabs.slice(0, 4);

  if (loading && !restauranteId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ff3b8a" />
        <Text style={styles.loading}>Carregando Movyo Hub...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {actionLabel || refreshing ? <View style={styles.inlineLoader}><ActivityIndicator size="small" color="#ff3b8a" /><Text style={styles.inlineLoaderText}>{actionLabel || "Atualizando dados..."}</Text></View> : null}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>MOVYO HUB</Text>
            <Text style={styles.logo}>{rest?.nome || "Restaurante"}</Text>
            <Text style={styles.sub}>{rest?.plano || "Painel premium"} • gestão pelo celular</Text>
          </View>
          <Pressable onPress={logout} style={styles.logout}><Ionicons name="log-out-outline" size={21} color="#fff" /></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickScroll}>
          {quickTabs.map((t) => <Pressable key={t[0]} onPress={() => setTab(t[0])} style={[styles.quickAction, tab === t[0] && styles.quickActionActive]}><Ionicons name={t[2]} size={20} color={tab === t[0] ? "#fff" : "#ff3b8a"} /><Text style={[styles.quickText, tab === t[0] && styles.quickTextActive]}>{t[1]}</Text></Pressable>)}
        </ScrollView>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 112 }}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionKicker}>Painel do restaurante</Text>
            <Text style={styles.sectionTitle}>{tabs.find((t) => t[0] === tab)?.[1] || "Início"}</Text>
          </View>
          <MiniButton title="Atualizar" icon="refresh-outline" onPress={() => load({ silent: true })} />
        </View>

        {tab === "dashboard" && <>
          <LicenseStatusCard info={licenseInfo} />
          <View style={styles.metrics}>
            <Metric label="Hoje" value={moeda(resumo.totalHoje)} icon="cash-outline" />
            <Metric label="Pendentes" value={resumo.pendentes} icon="time-outline" />
            <Metric label="Mesas ocupadas" value={resumo.mesasOcupadas} icon="restaurant-outline" />
          </View>
          <Card title="Atalhos operacionais" icon="flash-outline" subtitle="Acesse rapidamente as áreas mais usadas.">
            <View style={styles.grid2}>
              {tabs.slice(1, 7).map((t) => <Pressable key={t[0]} onPress={() => setTab(t[0])} style={styles.tile}><Ionicons name={t[2]} size={23} color="#ff3b8a" /><Text style={styles.tileText}>{t[1]}</Text></Pressable>)}
            </View>
          </Card>
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

        {tab === "pedidos" && <List title="Controle de pedidos" items={pedidos.map((p) => `#${p.numeroPedido || getId(p)?.slice(-6) || ""} • ${p.status || "pendente"} • ${moeda(p.total || p.valorTotal)}`)} />}

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
          <Card title="Geral" icon="business-outline">
            <Field label="Nome" value={rest.nome} onChangeText={(v) => setRest({ ...rest, nome: v })} />
            <Field label="Telefone" value={rest.telefone} onChangeText={(v) => setRest({ ...rest, telefone: v })} />
            <Field label="Endereço" value={rest.endereco || rest.enderecoCompleto} onChangeText={(v) => setRest({ ...rest, endereco: v, enderecoCompleto: v })} multiline />
            <ToggleLine label="Loja aberta" value={rest.aberto !== false} onValueChange={(v) => setRest({ ...rest, aberto: v })} />
            <Button title={saving ? "Salvando..." : "Salvar configurações"} icon="save-outline" onPress={salvarConfig} disabled={saving || !!actionLabel} />
          </Card>
          <MercadoPagoHubView rest={rest} mpLoading={mpLoading} conectar={conectarMercadoPago} atualizar={atualizarStatusMercadoPago} desconectar={desconectarMercadoPago} toggleCartao={toggleCartaoVitrine} />
          <WhatsAppBotHubView status={botStatus} qrImageUrl={botQrImageUrl} loading={botLoading} conectar={conectarBot} mostrarQr={buscarQrBot} atualizar={() => carregarStatusBot({ alertar: true })} desconectar={desconectarBot} resetar={resetarBot} />
        </>}
      </ScrollView>

      <View style={styles.bottomNav}>{tabs.map((t) => <Pressable key={t[0]} onPress={() => setTab(t[0])} style={styles.bottomItem}><Ionicons name={t[2]} size={20} color={tab === t[0] ? "#ff3b8a" : "#94a3b8"} /><Text style={[styles.bottomText, tab === t[0] && styles.bottomTextActive]}>{t[1]}</Text></Pressable>)}</View>
    </View>
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

function Metric({ label, value, icon }) {
  return <View style={styles.metric}><View style={styles.metricIcon}><Ionicons name={icon} size={17} color="#ff3b8a" /></View><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
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
  tile: { width: "47%", minHeight: 86, borderRadius: 20, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  tileText: { marginTop: 6, fontWeight: "900", color: "#334155" },
  bottomNav: { position: "absolute", left: 10, right: 10, bottom: 10, minHeight: 70, backgroundColor: "#fff", borderRadius: 26, borderWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 6, shadowColor: "#0f172a", shadowOpacity: 0.14, shadowRadius: 16, elevation: 8 },
  bottomItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  bottomText: { fontSize: 8, fontWeight: "900", color: "#94a3b8", marginTop: 3 },
  bottomTextActive: { color: "#ff3b8a" },
});
