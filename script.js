import { _supabase } from './supabaseClient.js';
import { checkUserSession, setupLogoutButton } from './modules/auth.js'; 
import { initUI, showToast, openModal, closeModal } from './modules/ui.js'; 
import { initCRM, carregarClientes } from './modules/crm.js'; 
import { initDataManager, renderizarTabelaTecidos, renderizarTabelaConfeccao, renderizarTabelaTrilho, renderizarTabelaFrete, renderizarTabelaInstalacao } from './modules/dataManager.js'; 
import { initCalculator, showCalculatorView } from './modules/calculator.js'; 
import { initTeamManager } from './modules/team.js';
import { loadPermissions } from './modules/permissions.js';
import { initRealtime } from './modules/realtime.js';
const BACKEND_API_URL = 'https://painel-de-controle-gcv.onrender.com';

let tecidosDataGlobal = [];
let confeccaoDataGlobal = []; 
let trilhoDataGlobal = [];    
let freteDataGlobal = [];     
let instalacaoDataGlobal = []; 
let amorimModCortina = [];
let amorimCorCortina = [];
let amorimModToldo = [];
let amorimCorToldo = [];
let currentClientIdGlobal = { value: null };
let isDataLoadedFlag = { value: false }; 
let itemParaExcluirGenericoInfo = null; 
let triggerTecidosSort = null; 
let triggerConfeccaoSort = null;
let triggerTrilhoSort = null;
let triggerFreteSort = null;
let triggerInstalacaoSort = null;
let elements = {}; 
const dataRefs = {
    tecidos: tecidosDataGlobal,
    confeccao: confeccaoDataGlobal,
    trilho: trilhoDataGlobal,
    frete: freteDataGlobal,
    instalacao: instalacaoDataGlobal,
    amorim_modelos_cortina: amorimModCortina,
    amorim_cores_cortina: amorimCorCortina,
    amorim_modelos_toldo: amorimModToldo,
    amorim_cores_toldo: amorimCorToldo
};
const calculatorDataRefs = {
     tecidos: tecidosDataGlobal,
     confeccao: {}, 
     trilho: {},    
     frete: {},    
     instalacao: {} 
};

function showClientListLocal() {
    if (document.getElementById('client-list-view')) document.getElementById('client-list-view').style.display = 'block';
    if (document.getElementById('calculator-view')) document.getElementById('calculator-view').style.display = 'none';
    currentClientIdGlobal.value = null;
    if (window.location.hash) {
        window.location.hash = ''; 
    }
}

function handleRouting() {
    const hash = window.location.hash;
    if (hash.startsWith('#cliente/')) {
        const clientId = hash.split('/')[1];
        if (!clientId) {
            showClientListLocal();
            return;
        }
        const card = elements.listaClientes?.querySelector(`.cliente-card[data-id="${clientId}"]`);
        if (card) {
            const clientName = card.dataset.nome;
            currentClientIdGlobal.value = clientId;
            showCalculatorView(clientId, clientName); 
        } else {
            console.warn(`Roteador: Cliente ${clientId} não encontrado no DOM. Recarregando clientes...`);
            carregarClientes().then(() => {
                 const cardRetry = elements.listaClientes?.querySelector(`.cliente-card[data-id="${clientId}"]`);
                 if(cardRetry) {
                     const clientName = cardRetry.dataset.nome;
                     currentClientIdGlobal.value = clientId;
                     showCalculatorView(clientId, clientName);
                 } else {
                    console.error(`Cliente ${clientId} não encontrado após recarregar.`);
                    showToast(`Cliente com ID ${clientId} não encontrado. Voltando para a lista.`, 'error');
                    showClientListLocal(); 
                 }
            });
        }
    } else {
        showClientListLocal(); 
    }
}

async function buscarDadosBaseDoBackend() {
  console.log("Iniciando busca de dados base...");
  isDataLoadedFlag.value = false; 
  try {
    const { data: { session }, error: sessionError } = await _supabase.auth.getSession();
    if (sessionError || !session) throw new Error("Sessão não encontrada.");
    
    // 1. Descobrir o ID da Loja do usuário atual
    const { data: perfil } = await _supabase
        .from('perfis')
        .select('loja_id')
        .eq('user_id', session.user.id)
        .single();
        
    if (!perfil || !perfil.loja_id) throw new Error("Loja não identificada para este usuário.");
    const lojaId = perfil.loja_id;

    // 2. Buscar dados padrão da API (Tecidos, etc)
    const token = session.access_token;
    const response = await fetch(`${BACKEND_API_URL}/api/dados-base`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    let dadosApi = {};
    if (response.ok) {
        dadosApi = await response.json();
    } else {
        console.warn("API de dados-base falhou, tentando carregar o possível.");
    }

    // 3. Buscar dados AMORIM diretamente do Supabase (Garante que venha atualizado)
    const [resModCortina, resCorCortina, resModToldo, resCorToldo] = await Promise.all([
        _supabase.from('amorim_modelos_cortina').select('*').eq('loja_id', lojaId),
        _supabase.from('amorim_cores_cortina').select('*').eq('loja_id', lojaId),
        _supabase.from('amorim_modelos_toldo').select('*').eq('loja_id', lojaId),
        _supabase.from('amorim_cores_toldo').select('*').eq('loja_id', lojaId)
    ]);

    // Limpeza dos Arrays Globais
    tecidosDataGlobal.length = 0;
    confeccaoDataGlobal.length = 0;
    trilhoDataGlobal.length = 0;
    freteDataGlobal.length = 0;
    instalacaoDataGlobal.length = 0;
    amorimModCortina.length = 0;
    amorimCorCortina.length = 0;
    amorimModToldo.length = 0;
    amorimCorToldo.length = 0;

    // Popular Arrays com dados da API
    tecidosDataGlobal.push(...(dadosApi.tecidos || []));
    confeccaoDataGlobal.push(...(dadosApi.confeccao || []));
    trilhoDataGlobal.push(...(dadosApi.trilho || []));
    freteDataGlobal.push(...(dadosApi.frete || []));
    instalacaoDataGlobal.push(...(dadosApi.instalacao || []));

    // Popular Arrays Amorim com dados diretos do Supabase
    if(resModCortina.data) amorimModCortina.push(...resModCortina.data);
    if(resCorCortina.data) amorimCorCortina.push(...resCorCortina.data);
    if(resModToldo.data) amorimModToldo.push(...resModToldo.data);
    if(resCorToldo.data) amorimCorToldo.push(...resCorToldo.data);

    // Configurar Calculadora
    calculatorDataRefs.confeccao = dadosApi.confeccao || []; 
    calculatorDataRefs.trilho = (dadosApi.trilho || []).reduce((acc, item) => { acc[item.opcao] = item.valor; return acc; }, {});
    
    calculatorDataRefs.frete = (dadosApi.frete || []).reduce((acc, item) => {
        const valor = item.valor || 0;
        const valorFormatado = `R$ ${valor.toFixed(2).replace('.', ',')}`;
        const key = (item.opcao && item.opcao.trim() !== '') ? `${item.opcao}` : valorFormatado;
        acc[key] = valor;
        return acc;
     }, {});

    calculatorDataRefs.instalacao = (dadosApi.instalacao || []).reduce((acc, item) => {
        const valor = item.valor || 0;
        const valorFormatado = `R$ ${valor.toFixed(2).replace('.', ',')}`;
        const key = (item.opcao && item.opcao.trim() !== '') ? `${item.opcao}` : valorFormatado;
        acc[key] = valor;
        return acc;
     }, {});

    isDataLoadedFlag.value = true; 
    document.dispatchEvent(new CustomEvent('dadosBaseCarregados')); 
    console.log("Dados carregados com sucesso (Híbrido API + Supabase).");

  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    showToast("Erro ao sincronizar dados. Verifique sua conexão.", "error");
    isDataLoadedFlag.value = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => { 

    const loadingOverlay = document.getElementById('loading-overlay');

    elements = {
        toast: document.getElementById('toast-notification'),
        userEmail: document.getElementById('user-email'),
        btnLogout: document.getElementById('btn-logout'),
        clientListView: document.getElementById('client-list-view'),
        calculatorView: document.getElementById('calculator-view'),
        listaClientes: document.getElementById('lista-clientes'),
        inputPesquisaClientes: document.getElementById('input-pesquisa'),
        btnToggleFilter: document.getElementById('btn-toggle-filter'),
        selectClientFilter: document.getElementById('select-client-filter'),
        btnToggleSortOrder: document.getElementById('btn-toggle-sort-order'),
        modalAddCliente: document.getElementById('modal-add-cliente'),
        formAddCliente: document.getElementById('form-add-cliente'),
        modalEditarCliente: document.getElementById('modal-editar-cliente'),
        formEditarCliente: document.getElementById('form-editar-cliente'),
        modalExcluirCliente: document.getElementById('modal-confirm-excluir-cliente'),
        btnConfirmarExcluirCliente: document.getElementById('btn-confirmar-excluir-cliente'),
        tabelaTecidosBody: document.querySelector('#tabela-tecidos-body'),
        tabelaConfeccaoBody: document.querySelector('#tabela-confeccao-body'),
        tabelaTrilhoBody: document.querySelector('#tabela-trilho-body'),
        inputPesquisaTecidos: document.getElementById('input-pesquisa-tecidos'),
        inputPesquisaConfeccao: document.getElementById('input-pesquisa-confeccao'),
        inputPesquisaTrilho: document.getElementById('input-pesquisa-trilho'),
        btnAbrirModalAddTecidos: document.getElementById('btn-abrir-modal-add-tecido'),
        modalAddTecidos: document.getElementById('modal-add-tecido'),
        formAddTecidos: document.getElementById('form-add-tecido'),
        btnCancelAddTecidos: document.getElementById('btn-cancelar-add-tecido'),
        btnAbrirModalAddConfeccao: document.getElementById('btn-abrir-modal-add-confeccao'),
        modalAddConfeccao: document.getElementById('modal-add-confeccao'),
        formAddConfeccao: document.getElementById('form-add-confeccao'),
        btnCancelAddConfeccao: document.getElementById('btn-cancelar-add-confeccao'),
        btnAbrirModalAddTrilho: document.getElementById('btn-abrir-modal-add-trilho'),
        modalAddTrilho: document.getElementById('modal-add-trilho'),
        formAddTrilho: document.getElementById('form-add-trilho'),
        btnCancelAddTrilho: document.getElementById('btn-cancelar-add-trilho'),
        modalEditTecidos: document.getElementById('modal-edit-tecido'),
        formEditTecidos: document.getElementById('form-edit-tecido'),
        btnCancelEditTecidos: document.getElementById('btn-cancelar-edit-tecido'),
        modalEditConfeccao: document.getElementById('modal-edit-confeccao'),
        formEditConfeccao: document.getElementById('form-edit-confeccao'),
        btnCancelEditConfeccao: document.getElementById('btn-cancelar-edit-confeccao'),
        modalEditTrilho: document.getElementById('modal-edit-trilho'),
        formEditTrilho: document.getElementById('form-edit-trilho'),
        btnCancelEditTrilho: document.getElementById('btn-cancelar-edit-trilho'),
        tabelaFreteBody: document.querySelector('#tabela-frete-body'),
        inputPesquisaFrete: document.getElementById('input-pesquisa-frete'),
        btnAbrirModalAddFrete: document.getElementById('btn-abrir-modal-add-frete'),
        modalAddFrete: document.getElementById('modal-add-frete'),
        formAddFrete: document.getElementById('form-add-frete'),
        btnCancelAddFrete: document.getElementById('btn-cancelar-add-frete'),
        modalEditFrete: document.getElementById('modal-edit-frete'),
        formEditFrete: document.getElementById('form-edit-frete'),
        btnCancelEditFrete: document.getElementById('btn-cancelar-edit-frete'),
        tabelaInstalacaoBody: document.querySelector('#tabela-instalacao-body'),
        inputPesquisaInstalacao: document.getElementById('input-pesquisa-instalacao'),
        inputPesquisaAmorim_modelos_cortina: document.getElementById('input-pesquisa-amorim-modelos-cortina'),
        inputPesquisaAmorim_cores_cortina: document.getElementById('input-pesquisa-amorim-cores-cortina'),
        inputPesquisaAmorim_modelos_toldo: document.getElementById('input-pesquisa-amorim-modelos-toldo'),
        inputPesquisaAmorim_cores_toldo: document.getElementById('input-pesquisa-amorim-cores-toldo'),
        btnAbrirModalAddInstalacao: document.getElementById('btn-abrir-modal-add-instalacao'),
        modalAddInstalacao: document.getElementById('modal-add-instalacao'),
        formAddInstalacao: document.getElementById('form-add-instalacao'),
        btnCancelAddInstalacao: document.getElementById('btn-cancelar-add-instalacao'),
        modalEditInstalacao: document.getElementById('modal-edit-instalacao'),
        formEditInstalacao: document.getElementById('form-edit-instalacao'),
        btnCancelEditInstalacao: document.getElementById('btn-cancelar-edit-instalacao'),
        modalExcluirGenerico: document.getElementById('modal-confirm-excluir-generico'),
        btnConfirmarExcluirGenerico: document.getElementById('btn-confirmar-excluir-generico'),
        btnCancelExcluirGenerico: document.getElementById('btn-cancelar-excluir-generico'),
        spanItemNomeExcluir: document.getElementById('item-nome-excluir'),
        calculatorClientName: document.getElementById('calculator-client-name'),
        calculatorTableBody: document.getElementById('corpo-tabela-calculo-cliente'), 
        saveStatusMessage: document.getElementById('save-status-message'),
        btnManualSave: document.getElementById('btn-manual-save'),
        btnPrintOrcamento: document.getElementById('btn-print-orcamento'),
        calculatorMarkupInput: document.getElementById('input-markup-base-calc'),
        selectParcelamentoGlobal: document.getElementById('select-parcelamento-global'),
        inputValorEntradaGlobal: document.getElementById('input-valor-entrada-global'),
        selectFreteGlobal: document.getElementById('select-frete-global'),
        btnVoltarClientes: document.getElementById('btn-voltar-clientes'),
        modalExcluirLinha: document.getElementById('modal-confirm-excluir-linha'),
        btnConfirmarExcluirLinha: document.getElementById('btn-confirmar-excluir-linha'),
        btnCancelarExcluirLinha: document.getElementById('btn-cancelar-excluir-linha'),
        spanAmbienteNomeExcluir: document.getElementById('ambiente-nome-excluir'),
        btnAbrirConfigCalculadora: document.getElementById('btn-abrir-config-calculadora'),
        modalConfigCalculadora: document.getElementById('modal-config-calculadora'),
        btnFecharConfigCalculadora: document.getElementById('btn-fechar-config-calculadora'),
        tabsContainer: document.getElementById('calc-tabs-container'),
        btnAddAba: document.getElementById('btn-add-aba-calc'),
        summaryContainer: document.getElementById('calculator-summary'),
        summaryTotalGeral: document.getElementById('summary-total-geral'),
        summaryTotalAvista: document.getElementById('summary-total-avista'),
        summaryTotalParcelado: document.getElementById('summary-total-parcelado'),
        summaryParceladoLabel: document.getElementById('summary-parcelado-label'),
        summaryTotalEntrada: document.getElementById('summary-total-entrada'),
        summaryTotalEntradaValue: document.getElementById('summary-total-entrada-value'),
        summaryTotalRestante: document.getElementById('summary-total-restante'),
        summaryRestanteLabel: document.getElementById('summary-restante-label'),
        summaryTotalRestanteValue: document.getElementById('summary-total-restante-value'),
        modalExcluirAba: document.getElementById('modal-confirm-excluir-aba'),
        btnConfirmarExcluirAba: document.getElementById('btn-confirmar-excluir-aba'),
        btnCancelarExcluirAba: document.getElementById('btn-cancelar-excluir-aba'),
        spanAbaNomeExcluir: document.getElementById('aba-nome-excluir'),
        chkSummaryVendaRealizada: document.getElementById('chk-summary-venda-realizada'),
        modalConfirmSair: document.getElementById('modal-confirm-sair'),
        btnCancelarSair: document.getElementById('btn-cancelar-sair'),
        btnConfirmarSair: document.getElementById('btn-confirmar-sair'),
        btnSalvarESair: document.getElementById('btn-salvar-e-sair'),
        btnThemeToggle: document.getElementById('btn-theme-toggle'),
        modalExcluirSecao: document.getElementById('modal-confirm-excluir-secao'),
        btnConfirmarExcluirSecao: document.getElementById('btn-confirmar-excluir-secao'),
        btnCancelarExcluirSecao: document.getElementById('btn-cancelar-excluir-secao'),
        quoteSectionsContainer: document.getElementById('quote-sections-container'),
        sectionControlsContainer: document.getElementById('section-controls'),
        spanSecaoNomeExcluir: document.getElementById('secao-nome-excluir'),
        btnAbrirModalAddMembro: document.getElementById('btn-abrir-modal-add-membro'),
        modalAddMembro: document.getElementById('modal-add-membro'),
        formAddMembro: document.getElementById('form-add-membro'),
        btnCancelarAddMembro: document.getElementById('btn-cancelar-add-membro'),
        modalExcluirMembro: document.getElementById('modal-excluir-membro'),
        btnConfirmarExcluirMembro: document.getElementById('btn-confirmar-excluir-membro'),
        btnCancelarExcluirMembro: document.getElementById('btn-cancelar-excluir-membro')
    };

    initCRM(elements);
    initDataManager(elements, dataRefs); 
    initCalculator(elements, calculatorDataRefs, currentClientIdGlobal, isDataLoadedFlag); 
    initTeamManager(elements);
    await checkUserSession();
    await loadPermissions();
    initRealtime();
    setupLogoutButton();
    initUI(elements);
    if (elements.btnThemeToggle) {
        const body = document.body;
        const applyTheme = (theme) => {
            if (theme === 'dark') {
                body.classList.add('dark-mode');
                elements.btnThemeToggle.textContent = '☀️'; 
            } else {
                body.classList.remove('dark-mode');
                elements.btnThemeToggle.textContent = '🌙';
            }
            localStorage.setItem('theme', theme); 
        };

        const currentTheme = localStorage.getItem('theme') || 'light';
        applyTheme(currentTheme);

        elements.btnThemeToggle.addEventListener('click', () => {
            const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
            elements.btnThemeToggle.classList.add('toggling');
            applyTheme(newTheme);
            setTimeout(() => {
                elements.btnThemeToggle.classList.remove('toggling');
            }, 400); 
        });
    }

    document.addEventListener('dadosBaseAlterados', async () => {
        console.log("Evento 'dadosBaseAlterados' recebido, recarregando dados base do backend...");
        await buscarDadosBaseDoBackend(); 
        renderizarTabelaTecidos(dataRefs.tecidos);
        renderizarTabelaConfeccao(dataRefs.confeccao);
        renderizarTabelaTrilho(dataRefs.trilho);
        renderizarTabelaFrete(dataRefs.frete);
        renderizarTabelaInstalacao(dataRefs.instalacao);
        document.dispatchEvent(new CustomEvent('tabelaTecidosSortRequest'));
        document.dispatchEvent(new CustomEvent('tabelaConfeccaoSortRequest'));
        document.dispatchEvent(new CustomEvent('tabelaTrilhoSortRequest'));
        document.dispatchEvent(new CustomEvent('tabelaFreteSortRequest'));
        document.dispatchEvent(new CustomEvent('tabelaInstalacaoSortRequest'));
    });

    if (elements.btnConfirmarExcluirGenerico) {
        elements.btnConfirmarExcluirGenerico.addEventListener('click', async () => {
             if (!itemParaExcluirGenericoInfo) return;
             const { id, tabela, loja_id } = itemParaExcluirGenericoInfo;
             if (!loja_id) {
                 showToast("Erro: Loja não identificada para exclusão.", "error");
                 return;
             }
            const { error } = await _supabase.from(tabela).delete().match({ id: id, loja_id: loja_id });

            if (error) {
                 console.error(`Erro ao excluir ${tabela} (ID: ${id}):`, error);
                 let userMessage = 'Erro ao excluir item.';
                 if (error.message.includes('violates row-level security policy')) {
                     userMessage += " Você não tem permissão.";
                 } else {
                     userMessage += ` Detalhe: ${error.message}`;
                 }
                 showToast(userMessage, 'error');
            } else {
                showToast('Item excluído com sucesso.');
                itemParaExcluirGenericoInfo.elemento?.remove();
                if (['tecidos', 'confeccao', 'trilho', 'frete', 'instalacao'].includes(tabela)) {
                    document.dispatchEvent(new CustomEvent('dadosBaseAlterados'));
                }
            }
            closeModal(elements.modalExcluirGenerico);
            itemParaExcluirGenericoInfo = null;
        });
    }
    if (elements.btnCancelExcluirGenerico) {
        elements.btnCancelExcluirGenerico.addEventListener('click', () => {
            closeModal(elements.modalExcluirGenerico);
            itemParaExcluirGenericoInfo = null;
        });
    }
    window.prepararExclusaoGenerica = (info) => {
        itemParaExcluirGenericoInfo = info; 
        if (elements.spanItemNomeExcluir) {
            elements.spanItemNomeExcluir.textContent = info.nome || 'este item';
        }
        openModal(elements.modalExcluirGenerico);
    };

    document.addEventListener('tabelaTecidosSortRequest', () => { if (triggerTecidosSort) triggerTecidosSort(); });
    document.addEventListener('tabelaConfeccaoSortRequest', () => { if (triggerConfeccaoSort) triggerConfeccaoSort(); });
    document.addEventListener('tabelaTrilhoSortRequest', () => { if (triggerTrilhoSort) triggerTrilhoSort(); });
    document.addEventListener('tabelaFreteSortRequest', () => { if (triggerFreteSort) triggerFreteSort(); });
    document.addEventListener('tabelaInstalacaoSortRequest', () => { if (triggerInstalacaoSort) triggerInstalacaoSort(); });

    console.log("Iniciando carregamento de dados (Clientes e Dados Base)...");
    try {
        await Promise.all([
            carregarClientes(),             
            buscarDadosBaseDoBackend()    
        ]);

        console.log("Carregamento inicial concluído.");

        renderizarTabelaTecidos(dataRefs.tecidos);
        renderizarTabelaConfeccao(dataRefs.confeccao);
        renderizarTabelaTrilho(dataRefs.trilho);
        renderizarTabelaFrete(dataRefs.frete);
        renderizarTabelaInstalacao(dataRefs.instalacao);

        setupTableSorting('tabela-tecidos', dataRefs.tecidos, renderizarTabelaTecidos);
        setupTableSorting('tabela-confeccao', dataRefs.confeccao, renderizarTabelaConfeccao);
        setupTableSorting('tabela-trilho', dataRefs.trilho, renderizarTabelaTrilho);
        setupTableSorting('tabela-frete', dataRefs.frete, renderizarTabelaFrete);
        setupTableSorting('tabela-instalacao', dataRefs.instalacao, renderizarTabelaInstalacao);

        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
        }

        console.log("Iniciando roteador...");
        handleRouting(); 
        window.addEventListener('hashchange', handleRouting); 

    } catch (error) {
        console.error("Erro fatal durante o carregamento inicial:", error);
        if (loadingOverlay) {
            loadingOverlay.innerHTML = `<p style="color: red; padding: 20px; text-align: center;">Erro crítico ao inicializar.<br>Verifique o console e a conexão.</p>`;
        }
    }
});

function setupTableSorting(tableId, dataArray, renderFunction) {
    const table = document.getElementById(tableId);
    if (!table) {
        console.warn(`Tabela com ID '${tableId}' não encontrada para ordenação.`);
        return;
    }
    const headers = table.querySelectorAll('th.sortable-header');
    let sortConfig = { key: null, asc: true }; 

    const sortAndRender = () => {
        if (!sortConfig.key) return; 
        
        dataArray.sort((a, b) => {
            if (a.hasOwnProperty('favorito') && b.hasOwnProperty('favorito')) {
                if (a.favorito && !b.favorito) return -1;
                if (!a.favorito && b.favorito) return 1;
            }

            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortConfig.asc ? valA - valB : valB - valA;
            }
            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortConfig.asc
                    ? valA.localeCompare(valB, undefined, { sensitivity: 'base' })
                    : valB.localeCompare(valA, undefined, { sensitivity: 'base' });
            }
            if (valA > valB || valA === null || valA === undefined) return sortConfig.asc ? 1 : -1;
            if (valA < valB || valB === null || valB === undefined) return sortConfig.asc ? -1 : 1;
            return 0; 
        });
        renderFunction(dataArray); 
    };

   if (tableId === 'tabela-tecidos') triggerTecidosSort = sortAndRender;
   else if (tableId === 'tabela-confeccao') triggerConfeccaoSort = sortAndRender;
   else if (tableId === 'tabela-trilho') triggerTrilhoSort = sortAndRender;
   else if (tableId === 'tabela-frete') triggerFreteSort = sortAndRender;
   else if (tableId === 'tabela-instalacao') triggerInstalacaoSort = sortAndRender;

    headers.forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sortKey;
            if (!sortKey) return;

            let newAsc = true;
            if (sortConfig.key === sortKey) {
                newAsc = !sortConfig.asc;
            }

            headers.forEach(h => {
                h.classList.remove('asc', 'desc');
                const span = h.querySelector('span.sort-arrow');
                if (span) span.textContent = '';
            });
            header.classList.add(newAsc ? 'asc' : 'desc');
            const arrowSpan = header.querySelector('span.sort-arrow');
            if (arrowSpan) arrowSpan.textContent = newAsc ? ' ▲' : ' ▼';

            sortConfig = { key: sortKey, asc: newAsc };
            sortAndRender();
        });
    });

     let initialSortKey = null;
    if (headers.length > 0) {
        initialSortKey = headers[1]?.dataset.sortKey || headers[0].dataset.sortKey;
    }
     if (initialSortKey) {
        sortConfig = { key: initialSortKey, asc: true };
        const initialHeader = Array.from(headers).find(h => h.dataset.sortKey === initialSortKey);
        if(initialHeader){
            initialHeader.classList.add('asc');
            const arrowSpan = initialHeader.querySelector('span.sort-arrow');
            if (arrowSpan) arrowSpan.textContent = ' ▲';
        }
        sortAndRender();
     }
}