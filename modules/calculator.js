import { showToast, openModal, closeModal } from './ui.js';
import { _supabase } from '../supabaseClient.js'; 
import { can } from './permissions.js';

const BACKEND_API_URL = 'https://painel-de-controle-gcv.onrender.com';

const DADOS_FRANZ_CORTINA = ["3.0", "2.8", "2.5", "2.0", "1.5", "1.2", "1.0"];
const DADOS_FRANZ_BLACKOUT = ["2.5", "2.0", "1.5", "1.2", "1.0"];

const TAXAS_PADRAO = {
    'DÉBITO': 0.0099, '1x': 0.0299, '2x': 0.0409, '3x': 0.0478, '4x': 0.0547, '5x': 0.0614, 
    '6x': 0.0681, '7x': 0.0767, '8x': 0.0833, '9x': 0.0898, '10x': 0.0963, '11x': 0.1026,
    '12x': 0.1090, '13x': 0.1152, '14x': 0.1214, '15x': 0.1276, '16x': 0.1337, '17x': 0.1397,
    '18x': 0.1457
};
let TAXAS_PARCELAMENTO = { ...TAXAS_PADRAO };
const DEFAULT_CORTINA = [
    "CELULAR", "ATENA", "ATENA PAINEL", "CORTINA TETO", "ILLUMINE", "LAMOUR", 
    "LUMIERE", "MELIADE", "ROLO STILLO", "PAINEL", "PERSIANA VERTICAL", 
    "PH 25", "PH 50", "PH 75", "PLISSADA", "ROLO", "ROMANA", 
    "TRILHO MOTORIZADO", "VERTIGLISS"
];
const DEFAULT_TOLDO = [
    "PERGOLA", "BALI", "BERGAMO", "BERLIM", "CAPRI", "MILAO", "MILAO COMPACT", 
    "MILAO MATIK", "MILAO PLUS", "MILAO SEMI BOX", "MONACO", "ZURIQUE", "ZIP SYSTEM"
];
const DEFAULT_CORES = ["PADRAO", "BRANCO", "BRONZE", "CINZA", "MARFIM", "MARROM", "PRETO"];
let DADOS_MODELO_CORTINA = [];
let DADOS_MODELO_TOLDO = [];
let DADOS_COR_ACESSORIOS = [];
const DADOS_COMANDO = ["MANUAL", "MOTORIZADO"];
const DADOS_LADO_COMANDO = ["DIREITO", "ESQUERDO"];

let elements = {};
let dataRefs = {};
let currentClientIdRef = { value: null };
let isDataLoadedRef = { value: false };
const formatadorReaisCalc = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let estadoAbas = [];
let abaAtivaIndex = 0;
let linhaParaExcluir = null;
let abaParaExcluir = { index: null, element: null };
let secaoParaExcluir = { element: null, type: null, button: null };
let isDirty = false;

async function getAuthToken() {
  const { data: { session }, error } = await _supabase.auth.getSession();
  if (error || !session) return null;
  return session.access_token;
}

function setDirty() {
    if (isDirty) return; 
    isDirty = true;
    if (elements.btnManualSave && !elements.btnManualSave.disabled) {
        elements.btnManualSave.classList.remove('hidden');
    }
}

export function initCalculator(domElements, dataArrays, clientIdRef, isDataLoadedFlag) {
    elements = domElements;
    dataRefs = dataArrays;
    if (dataRefs.amorim_modelos_cortina && dataRefs.amorim_modelos_cortina.length > 0) {
        DADOS_MODELO_CORTINA = dataRefs.amorim_modelos_cortina.map(i => i.opcao).sort();
    } else { 
        DADOS_MODELO_CORTINA = [...DEFAULT_CORTINA].sort(); 
    }

    if (dataRefs.amorim_modelos_toldo && dataRefs.amorim_modelos_toldo.length > 0) {
        DADOS_MODELO_TOLDO = dataRefs.amorim_modelos_toldo.map(i => i.opcao).sort();
    } else { 
        DADOS_MODELO_TOLDO = [...DEFAULT_TOLDO].sort(); 
    }

    const coresBanco = [...(dataRefs.amorim_cores_cortina||[]), ...(dataRefs.amorim_cores_toldo||[])];
    if (coresBanco.length > 0) {
        DADOS_COR_ACESSORIOS = [...new Set(coresBanco.map(i => i.opcao))].sort();
    } else {
        DADOS_COR_ACESSORIOS = [...DEFAULT_CORES].sort();
    }
    currentClientIdRef = clientIdRef;
    isDataLoadedRef = isDataLoadedFlag;
    carregarTaxasDoBanco();
    const btnConfigTaxas = document.getElementById('btn-config-taxas');
    const modalConfigTaxas = document.getElementById('modal-config-taxas');
    const formConfigTaxas = document.getElementById('form-config-taxas');
    const btnCancelarTaxas = document.getElementById('btn-cancelar-taxas');
    const btnRestaurarTaxas = document.getElementById('btn-restaurar-taxas');

    if (btnConfigTaxas) {
        btnConfigTaxas.addEventListener('click', () => {
            if (!can('perm_calc_taxas')) {
                showToast("Sem permissão para configurar taxas.", "error");
                return;
            }
            abrirModalTaxas();
        });
    }
    if (btnCancelarTaxas) btnCancelarTaxas.addEventListener('click', () => closeModal(modalConfigTaxas));
    if (btnRestaurarTaxas) {
        btnRestaurarTaxas.addEventListener('click', async () => {
            if(confirm("Isso apagará as taxas personalizadas e voltará ao padrão. Continuar?")) {
                TAXAS_PARCELAMENTO = { ...TAXAS_PADRAO };
                await salvarNovasTaxasNoBanco(TAXAS_PADRAO); 
                preencherSelectParcelamento();
                recalcularParceladoAmorimToldos();
                recalcularTotaisSelecionados();
                closeModal(modalConfigTaxas);
                showToast("Taxas padrão restauradas.");
            }
        });
    }
    if (formConfigTaxas) {
        formConfigTaxas.addEventListener('submit', async (e) => {
            e.preventDefault();
            await aplicarEdicaoTaxas();
        });
    }

    if (elements.btnVoltarClientes) {
        elements.btnVoltarClientes.addEventListener('click', async () => {
            if (isDirty) {
                const modalTitle = elements.modalConfirmSair.querySelector('h2');
                const modalText = elements.modalConfirmSair.querySelector('p');
                const btnSalvarSair = elements.btnSalvarESair;

                if (!can('perm_calc_save')) {
                    modalTitle.textContent = "Sem Permissão";
                    modalText.textContent = "Você não tem permissão para salvar. Deseja sair sem salvar?";
                    if(btnSalvarSair) btnSalvarSair.style.display = 'none'; 
                } else {
                    modalTitle.textContent = "Alterações não salvas";
                    modalText.textContent = "Você possui alterações não salvas. Deseja realmente sair sem salvar?";
                    if(btnSalvarSair) btnSalvarSair.style.display = 'inline-block'; 
                }
                openModal(elements.modalConfirmSair);
            } else {
                window.location.hash = '';
            }
        });
    }

    const btnAddSectionTecido = document.getElementById('btn-add-section-tecido');
    const btnAddSectionAmorim = document.getElementById('btn-add-section-amorim');
    const btnAddSectionToldos = document.getElementById('btn-add-section-toldos');
    
    if (btnAddSectionTecido) btnAddSectionTecido.addEventListener('click', (e) => addSection('tecido', e.target));
    if (btnAddSectionAmorim) btnAddSectionAmorim.addEventListener('click', (e) => addSection('amorim', e.target));
    if (btnAddSectionToldos) btnAddSectionToldos.addEventListener('click', (e) => addSection('toldos', e.target));

    const globalTriggers = document.querySelectorAll('.global-calc-trigger');
    globalTriggers.forEach(input => {
        const eventType = (input.tagName === 'SELECT') ? 'change' : 'input';
        input.removeEventListener(eventType, recalcularTodasLinhas); 
        input.addEventListener(eventType, () => {
            recalcularTodasLinhas();
            recalcularTotaisSelecionados(); 
            setDirty();
        });
    });

    if (elements.btnManualSave) {
        elements.btnManualSave.addEventListener('click', async () => {
            if (!can('perm_calc_save')) {
                showToast("Sem permissão para salvar.", "error");
                return;
            }
            if (!currentClientIdRef.value) return;
            
            elements.btnManualSave.disabled = true;
            if (elements.saveStatusMessage) {
                elements.saveStatusMessage.textContent = 'Salvando...';
                elements.saveStatusMessage.className = 'save-status-message saving';
            }
            await salvarEstadoCalculadora(currentClientIdRef.value);
            elements.btnManualSave.disabled = false;
        });
    }

    if (elements.btnPrintOrcamento) {
        elements.btnPrintOrcamento.addEventListener('click', () => window.print());
    }
    if (elements.btnConfirmarSair) {
        elements.btnConfirmarSair.addEventListener('click', () => {
            isDirty = false; 
            closeModal(elements.modalConfirmSair);
            window.location.hash = ''; 
        });
    }
    if (elements.btnCancelarSair) {
        elements.btnCancelarSair.addEventListener('click', () => closeModal(elements.modalConfirmSair));
    }
    if (elements.btnSalvarESair) {
        elements.btnSalvarESair.addEventListener('click', async () => {
            if (!can('perm_calc_save')) {
                showToast("Sem permissão para salvar.", "error");
                return;
            }
            elements.btnSalvarESair.disabled = true;
            elements.btnSalvarESair.textContent = "Salvando...";
            await salvarEstadoCalculadora(currentClientIdRef.value);
            elements.btnSalvarESair.disabled = false;
            elements.btnSalvarESair.textContent = "Sair e Salvar";
            if (!isDirty) {
                closeModal(elements.modalConfirmSair);
                window.location.hash = '';
            }
        });
    }
    if (elements.selectParcelamentoGlobal) {
        elements.selectParcelamentoGlobal.addEventListener('change', () => {
             atualizarHeaderParcelado();
             recalcularParceladoAmorimToldos(); 
             recalcularTotaisSelecionados(); 
             setDirty();
        });
    }
    
    setupCurrencyFormatting(elements.inputValorEntradaGlobal);

    if (elements.btnAddAba) elements.btnAddAba.addEventListener('click', adicionarAba);
    
    if (elements.tabsContainer) {
        elements.tabsContainer.addEventListener('click', (e) => {
            const tabElement = e.target.closest('.calc-tab');
            if (!tabElement) return;
            const tabIndex = parseInt(tabElement.dataset.index, 10);
            if (e.target.classList.contains('btn-close-aba')) {
                prepararExclusaoAba(tabIndex, tabElement);
            } else if (tabIndex !== abaAtivaIndex) {
                ativarAba(tabIndex);
            }
        });
        elements.tabsContainer.addEventListener('dblclick', (e) => {
             const tabNameElement = e.target.closest('.calc-tab-name');
             if(tabNameElement) renomearAba(tabNameElement);
        });
        let lastTap = 0;
        elements.tabsContainer.addEventListener('touchend', (e) => {
            const tabNameElement = e.target.closest('.calc-tab-name');
            if (!tabNameElement) return;
            const now = new Date().getTime();
            if ((now - lastTap < 300) && (now - lastTap > 0)) {
                e.preventDefault(); renomearAba(tabNameElement);
            }
            lastTap = now;
        });
    }

    if (elements.btnConfirmarExcluirAba) {
        elements.btnConfirmarExcluirAba.addEventListener('click', () => {
            if (abaParaExcluir.index !== null) executarExclusaoAba(abaParaExcluir.index);
        });
    }
    if (elements.btnCancelarExcluirAba) {
        elements.btnCancelarExcluirAba.addEventListener('click', () => {
            closeModal(elements.modalExcluirAba);
            abaParaExcluir = { index: null, element: null };
        });
    }
    if (elements.chkSummaryVendaRealizada) {
        elements.chkSummaryVendaRealizada.addEventListener('change', () => {
            if (abaAtivaIndex < 0 || abaAtivaIndex >= estadoAbas.length) return;
            estadoAbas[abaAtivaIndex].venda_realizada = elements.chkSummaryVendaRealizada.checked;
            renderizarTabs();
            atualizarStatusVendaCliente(true, currentClientIdRef.value); 
            setDirty();
        });        
    }
    
    if (elements.btnConfirmarExcluirLinha) {
        elements.btnConfirmarExcluirLinha.addEventListener('click', () => {
            if (linhaParaExcluir) {
                linhaParaExcluir.remove();
                recalcularTotaisSelecionados();
                setDirty();
            }
            closeModal(elements.modalExcluirLinha); 
            linhaParaExcluir = null;
        });
    }
    if (elements.btnCancelarExcluirLinha) elements.btnCancelarExcluirLinha.addEventListener('click', () => closeModal(elements.modalExcluirLinha));

    if (elements.btnConfirmarExcluirSecao) elements.btnConfirmarExcluirSecao.addEventListener('click', executarExclusaoSecao);
    if (elements.btnCancelarExcluirSecao) elements.btnCancelarExcluirSecao.addEventListener('click', () => closeModal(elements.modalExcluirSecao));
    if (elements.btnFecharConfigCalculadora) elements.btnFecharConfigCalculadora.addEventListener('click', () => closeModal(elements.modalConfigCalculadora));
}

async function carregarTaxasDoBanco() {
    try {
        const token = await getAuthToken();
        if (!token) return;
        const response = await fetch(`${BACKEND_API_URL}/api/config/taxas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const taxasSalvas = await response.json();
            if (taxasSalvas) {
                TAXAS_PARCELAMENTO = taxasSalvas;
                preencherSelectParcelamento(); 
            }
        }
    } catch (e) { console.error("Erro ao carregar taxas:", e); }
}

function abrirModalTaxas() {
    const container = document.getElementById('container-inputs-taxas');
    const modal = document.getElementById('modal-config-taxas');
    if (!container || !modal) return;
    container.innerHTML = '';
    const chaves = Object.keys(TAXAS_PARCELAMENTO);
    chaves.sort((a, b) => {
        if (a === 'DÉBITO') return -1; if (b === 'DÉBITO') return 1;
        return (parseInt(a.replace('x','')) || 0) - (parseInt(b.replace('x','')) || 0);
    });
    chaves.forEach(chave => {
        const valorPercentual = (TAXAS_PARCELAMENTO[chave] * 100).toFixed(2).replace('.', ',');
        const div = document.createElement('div');
        div.style.display = 'flex'; div.style.flexDirection = 'column';
        div.innerHTML = `<label style="font-weight:bold;font-size:12px;">${chave}</label>
                         <input type="text" name="taxa_${chave}" value="${valorPercentual}" style="padding:5px;border:1px solid #ccc;border-radius:4px;">`;
        const input = div.querySelector('input');
        input.addEventListener('input', (e) => e.target.value = e.target.value.replace(/[^0-9,.]/g, ''));
        container.appendChild(div);
    });
    openModal(modal);
}

async function aplicarEdicaoTaxas() {
    const container = document.getElementById('container-inputs-taxas');
    const inputs = container.querySelectorAll('input');
    const btnSalvar = document.querySelector('#form-config-taxas .btn-salvar');
    let novasTaxas = {};
    let erro = false;
    inputs.forEach(input => {
        const chave = input.name.replace('taxa_', '');
        let valorNum = parseFloat(input.value.replace(',', '.'));
        if (isNaN(valorNum)) erro = true;
        else novasTaxas[chave] = valorNum / 100;
    });
    if (erro) { showToast("Verifique os valores.", "error"); return; }
    if (btnSalvar) { btnSalvar.textContent = "Salvando..."; btnSalvar.disabled = true; }
    const sucesso = await salvarNovasTaxasNoBanco(novasTaxas);
    if (btnSalvar) { btnSalvar.textContent = "Salvar Taxas"; btnSalvar.disabled = false; }
    if (sucesso) {
        TAXAS_PARCELAMENTO = novasTaxas;
        preencherSelectParcelamento();
        recalcularParceladoAmorimToldos(); 
        recalcularTotaisSelecionados();
        closeModal(document.getElementById('modal-config-taxas'));
        showToast("Taxas atualizadas!");
    }
}

async function salvarNovasTaxasNoBanco(taxas) {
    try {
        const token = await getAuthToken();
        if (!token) return false;
        const response = await fetch(`${BACKEND_API_URL}/api/config/taxas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ taxas })
        });
        if (!response.ok) throw new Error("Erro API");
        return true;
    } catch (error) {
        showToast("Erro ao salvar taxas.", "error");
        return false;
    }
}

function executarExclusaoSecao() {
    if (secaoParaExcluir && secaoParaExcluir.element) {
        secaoParaExcluir.element.remove();
        if(secaoParaExcluir.button) secaoParaExcluir.button.classList.remove('hidden');
        checkSectionControls();
        updateMoveButtonsVisibility();
        recalcularTotaisSelecionados();
        setDirty();
    }
    closeModal(elements.modalExcluirSecao);
    secaoParaExcluir = { element: null, type: null, button: null };
}

function checkSectionControls() {
    if (!elements.sectionControlsContainer) return;
    const btnTecido = document.getElementById('btn-add-section-tecido');
    const btnAmorim = document.getElementById('btn-add-section-amorim');
    const btnToldos = document.getElementById('btn-add-section-toldos');
    const allHidden = btnTecido.classList.contains('hidden') && btnAmorim.classList.contains('hidden') && btnToldos.classList.contains('hidden');
    elements.sectionControlsContainer.style.display = allHidden ? 'none' : 'flex';
}

function addSection(sectionType, buttonElement, isInitialLoad = false) {
    if (!isDataLoadedRef.value) { showToast("Aguarde, carregando dados...", "error"); return; }
    const template = document.getElementById(`template-section-${sectionType}`);
    if (!template) return;
    const sectionClone = template.content.cloneNode(true);
    const sectionElement = sectionClone.querySelector('.quote-section');
    const tableBody = sectionElement.querySelector('.tabela-calculo-body');
    
    sectionElement.querySelector('.btn-add-linha').addEventListener('click', () => {
        if(sectionType==='tecido') adicionarLinhaTecido(tableBody, null, false);
        else if(sectionType==='amorim') adicionarLinhaAmorim(tableBody, null, false);
        else if(sectionType==='toldos') adicionarLinhaToldos(tableBody, null, false);
    });
    sectionElement.querySelector('.btn-remover-secao').addEventListener('click', () => {
        secaoParaExcluir = { element: sectionElement, type: sectionType, button: buttonElement };
        if (elements.spanSecaoNomeExcluir) elements.spanSecaoNomeExcluir.textContent = sectionElement.querySelector('h3').textContent;
        openModal(elements.modalExcluirSecao);
    });
    
    const btnConfig = sectionElement.querySelector('.btn-abrir-config-calculadora');
    if (btnConfig) btnConfig.addEventListener('click', () => {
        if (!can('perm_calc_config')) { showToast("Sem permissão.", "error"); return; }
        openModal(elements.modalConfigCalculadora);
    });

    const btnUp = sectionElement.querySelector('.btn-move-up');
    const btnDown = sectionElement.querySelector('.btn-move-down');
    if(btnUp) btnUp.addEventListener('click', () => moverSecao(sectionElement, 'up'));
    if(btnDown) btnDown.addEventListener('click', () => moverSecao(sectionElement, 'down'));

    if(sectionType==='tecido') adicionarLinhaTecido(tableBody, null, isInitialLoad);
    else if(sectionType==='amorim') adicionarLinhaAmorim(tableBody, null, isInitialLoad);
    else if(sectionType==='toldos') adicionarLinhaToldos(tableBody, null, isInitialLoad);

    document.getElementById('quote-sections-container').appendChild(sectionElement);
    if (buttonElement) buttonElement.classList.add('hidden');
    
    atualizarHeaderParcelado();
    checkSectionControls(); 
    updateMoveButtonsVisibility();
    if (!isInitialLoad) setDirty();
}

function moverSecao(section, direction) {
    const container = elements.quoteSectionsContainer;
    if (direction === 'up' && section.previousElementSibling) {
        container.insertBefore(section, section.previousElementSibling);
    } else if (direction === 'down' && section.nextElementSibling) {
        container.insertBefore(section.nextElementSibling, section);
    }
    updateMoveButtonsVisibility();
    setDirty();
}

function calcularParceladoLinhaAmorim(linha, taxaParcelamento) {
    if (!linha) return;
    const inputTotal = linha.querySelector('.resultado-preco-total');
    const inputParcelado = linha.querySelector('.resultado-preco-parcelado');
    if (!inputTotal || !inputParcelado) return;
    const valorTotal = parseCurrencyValue(inputTotal.value);
    inputParcelado.value = formatadorReaisCalc.format(valorTotal * (1 + taxaParcelamento));
}

function recalcularParceladoAmorimToldos() {
    const parcelamentoKey = elements.selectParcelamentoGlobal?.value || 'DÉBITO'; 
    const taxa = TAXAS_PARCELAMENTO[parcelamentoKey] || 0.0;
    document.querySelectorAll('.linha-calculo-cliente[data-linha-type="amorim"], .linha-calculo-cliente[data-linha-type="toldos"]').forEach(linha => {
        calcularParceladoLinhaAmorim(linha, taxa);
    });
}

function updateMoveButtonsVisibility() {
    if (!elements.quoteSectionsContainer) return;
    const sections = elements.quoteSectionsContainer.querySelectorAll('.quote-section');
    sections.forEach((section, index) => {
        const btnUp = section.querySelector('.btn-move-up');
        const btnDown = section.querySelector('.btn-move-down');
        if (btnUp) btnUp.style.display = (index === 0) ? 'none' : 'inline-block';
        if (btnDown) btnDown.style.display = (index === sections.length - 1) ? 'none' : 'inline-block';
    });
}

async function atualizarStatusVendaCliente(triggerSave, clientId) {
    if (!clientId || clientId === 'null') return;
    const algumaVenda = estadoAbas.some(aba => aba.venda_realizada);
    try {
        const { error } = await _supabase.from('clientes').update({ venda_realizada: algumaVenda, updated_at: new Date().toISOString() }).match({ id: clientId });
        if (!error) document.dispatchEvent(new CustomEvent('clienteAtualizado'));
    } catch(e) { console.error(e); }
}

function preencherSelectParcelamento() {
    const select = elements.selectParcelamentoGlobal;
    if (!select) return;
    const valAntigo = select.value;
    select.innerHTML = '';
    for (const key in TAXAS_PARCELAMENTO) {
        const txt = key.includes('x') ? `${key} (${(TAXAS_PARCELAMENTO[key]*100).toFixed(2).replace('.',',')}%)` : `${key} (${(TAXAS_PARCELAMENTO[key]*100).toFixed(2).replace('.',',')}%)`;
        select.appendChild(new Option(key.replace('x',''), key)).textContent = txt;
    }
    select.value = valAntigo || 'DÉBITO';
    if(select.selectedIndex === -1) select.value = 'DÉBITO';
}

function atualizarHeaderParcelado() {
    if (!elements.selectParcelamentoGlobal) return;
    const txt = elements.selectParcelamentoGlobal.value;
    document.querySelectorAll('.th-parcelado-header').forEach(h => h.textContent = txt);
    if(elements.summaryParceladoLabel) elements.summaryParceladoLabel.textContent = txt;
}

function aguardarDadosBase() {
    return new Promise((resolve) => {
        if (isDataLoadedRef.value) return resolve();
        const onDados = () => resolve();
        document.addEventListener('dadosBaseCarregados', onDados, { once: true });
        setTimeout(() => resolve(), 5000); 
    });
}

function preencherSelectCalculadora(select, dados, usarChaves = false, defaultText = "Nenhum", valueAsNumber = false) {
    if (!select) return;
    select.innerHTML = '';
    if (usarChaves) {
        select.appendChild(new Option(defaultText, valueAsNumber ? '0' : '-'));
        Object.keys(dados).forEach(chave => {
            const opt = new Option(chave, valueAsNumber ? dados[chave] : chave);
            if (!valueAsNumber) opt.dataset.valorReal = dados[chave];
            select.appendChild(opt);
        });
    } else {
        dados.forEach(v => select.appendChild(new Option(v, v)));
    }
}

function preencherSelectTecidosCalculadora(select, filtroCategoria = null) {
    if (!select) return;
    const valorAtual = select.value; 
    select.innerHTML = '<option value="SEM TECIDO">SEM TECIDO</option>';
    
    let lista = (dataRefs.tecidos || []).filter(t => t.produto && t.produto !== '-' && t.produto !== 'SEM TECIDO');
    if (filtroCategoria) {
        lista = lista.filter(t => {
            if (!t.categorias || t.categorias.length === 0) return true; 
            return t.categorias.includes(filtroCategoria);
        });
    }

    lista.sort((a, b) => (a.favorito === b.favorito) ? a.produto.localeCompare(b.produto) : (b.favorito ? 1 : -1))
         .forEach(t => select.appendChild(new Option(t.produto, t.produto)));
         
    if(valorAtual) select.value = valorAtual;
}

function adicionarLinhaTecido(tableBody, estadoLinha, isInitialLoad) {
    const template = document.getElementById('template-linha-tecido');
    const novaLinha = template.content.cloneNode(true).querySelector('tr');
    
    setupDecimalFormatting(novaLinha.querySelector('.input-largura'), 3);
    setupDecimalFormatting(novaLinha.querySelector('.input-altura'), 3);
    preencherSelectCalculadora(novaLinha.querySelector('.select-franzCortina'), DADOS_FRANZ_CORTINA);
    preencherSelectCalculadora(novaLinha.querySelector('.select-franzBlackout'), DADOS_FRANZ_BLACKOUT);
    preencherSelectTecidosCalculadora(novaLinha.querySelector('.select-codTecidoCortina'), 'cortina');
    preencherSelectTecidosCalculadora(novaLinha.querySelector('.select-codTecidoForro'), 'forro'); 
    preencherSelectTecidosCalculadora(novaLinha.querySelector('.select-codTecidoBlackout'), 'blackout');
    
    const selConf = novaLinha.querySelector('.select-confecao');
    selConf.innerHTML = '<option value="-" data-valor-real="0">NENHUM</option>';
    
    preencherSelectCalculadora(novaLinha.querySelector('.select-trilho'), dataRefs.trilho, true, "NENHUM");
    preencherSelectCalculadora(novaLinha.querySelector('.select-instalacao'), dataRefs.instalacao, true, "NENHUM", true);

    novaLinha.querySelector('.input-altura').addEventListener('blur', () => { atualizarOpcoesConfeccao(novaLinha); calcularOrcamentoLinha(novaLinha); setDirty(); });
    novaLinha.querySelector('.input-largura').addEventListener('blur', () => { calcularOrcamentoLinha(novaLinha); setDirty(); });

    if (estadoLinha) {
        novaLinha.querySelector('.input-ambiente').value = estadoLinha.ambiente || '';
        novaLinha.querySelector('.input-largura').value = formatDecimal(estadoLinha.largura, 3);
        novaLinha.querySelector('.input-altura').value = formatDecimal(estadoLinha.altura, 3);
        atualizarOpcoesConfeccao(novaLinha);
        if(estadoLinha.confecaoTexto) selConf.value = estadoLinha.confecaoTexto;
        novaLinha.querySelector('.select-franzCortina').value = estadoLinha.franzCortina || DADOS_FRANZ_CORTINA[0];
        novaLinha.querySelector('.select-codTecidoCortina').value = estadoLinha.codTecidoCortina || 'SEM TECIDO';
        novaLinha.querySelector('.select-codTecidoForro').value = estadoLinha.codTecidoForro || 'SEM TECIDO';
        novaLinha.querySelector('.select-franzBlackout').value = estadoLinha.franzBlackout || '1.2';
        novaLinha.querySelector('.select-codTecidoBlackout').value = estadoLinha.codTecidoBlackout || 'SEM TECIDO';
        novaLinha.querySelector('.select-trilho').value = estadoLinha.trilhoTexto || '-';
        novaLinha.querySelector('.select-instalacao').value = estadoLinha.instalacao || '0';
        const vOutros = parseFloat(String(estadoLinha.outros).replace(/[^\d,]/g,'').replace(',','.')) || 0;
        novaLinha.querySelector('.input-outros').value = vOutros > 0 ? formatadorReaisCalc.format(vOutros) : '';
        novaLinha.querySelector('.input-observacao').value = estadoLinha.observacao || '';
        novaLinha.querySelector('.select-linha-checkbox').checked = estadoLinha.selecionado === true;
        calcularOrcamentoLinha(novaLinha);
    } else {
        novaLinha.querySelector('.select-franzBlackout').value = "1.2";
    }

    novaLinha.querySelectorAll('input, select').forEach(el => {
        el.addEventListener(el.tagName==='SELECT'?'change':'input', () => {
            if(el.classList.contains('select-linha-checkbox')) recalcularTotaisSelecionados();
            else setTimeout(() => calcularOrcamentoLinha(novaLinha), 10);
            setDirty();
        });
    });
    novaLinha.querySelector('.btn-remover-linha').addEventListener('click', () => removerLinhaCalculadora(novaLinha));
    
    const inOutros = novaLinha.querySelector('.input-outros');
    setupCurrencyFormatting(inOutros);

    tableBody.appendChild(novaLinha);
    if(!estadoLinha) { atualizarOpcoesConfeccao(novaLinha); calcularOrcamentoLinha(novaLinha); if(!isInitialLoad) setDirty(); }
}

function adicionarLinhaAmorim(tableBody, estadoLinha, isInitialLoad) {
    const template = document.getElementById('template-linha-amorim');
    const novaLinha = template.content.cloneNode(true).querySelector('tr');
    
    preencherSelectCalculadora(novaLinha.querySelector('.select-modelo-cortina'), DADOS_MODELO_CORTINA);
    preencherSelectCalculadora(novaLinha.querySelector('.select-cor-acessorios'), DADOS_COR_ACESSORIOS);
    preencherSelectCalculadora(novaLinha.querySelector('.select-comando'), DADOS_COMANDO);
    preencherSelectCalculadora(novaLinha.querySelector('.select-lado-comando'), DADOS_LADO_COMANDO);
    setupDecimalFormatting(novaLinha.querySelector('.input-largura'), 3);
    setupDecimalFormatting(novaLinha.querySelector('.input-altura'), 3);
    setupCurrencyFormatting(novaLinha.querySelector('.input-valor-manual'));

    const selComando = novaLinha.querySelector('.select-comando');
    const inpManual = novaLinha.querySelector('.input-altura-comando-manual');
    const selMotor = novaLinha.querySelector('.select-altura-comando-motor');
    const toggleCmd = () => {
        if(selComando.value === 'MOTORIZADO') { inpManual.classList.add('hidden'); selMotor.classList.remove('hidden'); }
        else { inpManual.classList.remove('hidden'); selMotor.classList.add('hidden'); }
    };
    selComando.addEventListener('change', toggleCmd);

    if (estadoLinha) {
        novaLinha.querySelector('.input-ambiente').value = estadoLinha.ambiente || '';
        novaLinha.querySelector('.input-largura').value = formatDecimal(estadoLinha.largura, 3);
        novaLinha.querySelector('.input-altura').value = formatDecimal(estadoLinha.altura, 3);
        novaLinha.querySelector('.select-modelo-cortina').value = estadoLinha.modelo_cortina || DADOS_MODELO_CORTINA[0];
        novaLinha.querySelector('.input-cod-tecido').value = estadoLinha.codigo_tecido || '';
        novaLinha.querySelector('.input-colecao').value = estadoLinha.colecao || '';
        novaLinha.querySelector('.select-cor-acessorios').value = estadoLinha.cor_acessorios || DADOS_COR_ACESSORIOS[0];
        selComando.value = estadoLinha.comando || DADOS_COMANDO[0];
        novaLinha.querySelector('.select-lado-comando').value = estadoLinha.lado_comando || DADOS_LADO_COMANDO[0];
        if(estadoLinha.comando === 'MOTORIZADO') selMotor.value = estadoLinha.altura_comando || '127v';
        else inpManual.value = estadoLinha.altura_comando || '';
        toggleCmd();
        novaLinha.querySelector('.input-valor-manual').value = estadoLinha.valor_manual || '';
        novaLinha.querySelector('.input-observacao').value = estadoLinha.observacao || '';
        novaLinha.querySelector('.select-linha-checkbox').checked = estadoLinha.selecionado === true;
    } else toggleCmd();

    novaLinha.querySelectorAll('input, select').forEach(el => el.addEventListener(el.tagName==='SELECT'?'change':'input', () => { recalcularTotaisSelecionados(); setDirty(); }));
    novaLinha.querySelector('.input-valor-manual').addEventListener('blur', () => {
        const taxa = TAXAS_PARCELAMENTO[elements.selectParcelamentoGlobal?.value || 'DÉBITO'] || 0;
        calcularParceladoLinhaAmorim(novaLinha, taxa);
    });
    novaLinha.querySelector('.btn-remover-linha').addEventListener('click', () => removerLinhaCalculadora(novaLinha));
    
    tableBody.appendChild(novaLinha);
    const taxa = TAXAS_PARCELAMENTO[elements.selectParcelamentoGlobal?.value || 'DÉBITO'] || 0;
    calcularParceladoLinhaAmorim(novaLinha, taxa);
    if(!estadoLinha && !isInitialLoad) setDirty();
}

function adicionarLinhaToldos(tableBody, estadoLinha, isInitialLoad) {
    const template = document.getElementById('template-linha-toldos');
    const novaLinha = template.content.cloneNode(true).querySelector('tr');
    preencherSelectCalculadora(novaLinha.querySelector('.select-modelo-toldo'), DADOS_MODELO_TOLDO);
    preencherSelectCalculadora(novaLinha.querySelector('.select-cor-acessorios'), DADOS_COR_ACESSORIOS);
    preencherSelectCalculadora(novaLinha.querySelector('.select-comando'), DADOS_COMANDO);
    preencherSelectCalculadora(novaLinha.querySelector('.select-lado-comando'), DADOS_LADO_COMANDO);
    setupDecimalFormatting(novaLinha.querySelector('.input-largura'), 3);
    setupDecimalFormatting(novaLinha.querySelector('.input-altura'), 3);
    setupCurrencyFormatting(novaLinha.querySelector('.input-valor-manual'));

    const selComando = novaLinha.querySelector('.select-comando');
    const inpManual = novaLinha.querySelector('.input-altura-comando-manual');
    const selMotor = novaLinha.querySelector('.select-altura-comando-motor');
    const toggleCmd = () => {
        if(selComando.value === 'MOTORIZADO') { inpManual.classList.add('hidden'); selMotor.classList.remove('hidden'); }
        else { inpManual.classList.remove('hidden'); selMotor.classList.add('hidden'); }
    };
    selComando.addEventListener('change', toggleCmd);

    if (estadoLinha) {
        novaLinha.querySelector('.input-ambiente').value = estadoLinha.ambiente || '';
        novaLinha.querySelector('.input-largura').value = formatDecimal(estadoLinha.largura, 3);
        novaLinha.querySelector('.input-altura').value = formatDecimal(estadoLinha.altura, 3);
        novaLinha.querySelector('.select-modelo-toldo').value = estadoLinha.modelo_toldo || DADOS_MODELO_TOLDO[0];
        novaLinha.querySelector('.input-cod-tecido').value = estadoLinha.codigo_tecido || '';
        novaLinha.querySelector('.input-colecao').value = estadoLinha.colecao || '';
        novaLinha.querySelector('.select-cor-acessorios').value = estadoLinha.cor_acessorios || DADOS_COR_ACESSORIOS[0];
        selComando.value = estadoLinha.comando || DADOS_COMANDO[0];
        novaLinha.querySelector('.select-lado-comando').value = estadoLinha.lado_comando || DADOS_LADO_COMANDO[0];
        if(estadoLinha.comando === 'MOTORIZADO') selMotor.value = estadoLinha.altura_comando || '127v';
        else inpManual.value = estadoLinha.altura_comando || '';
        toggleCmd();
        novaLinha.querySelector('.input-valor-manual').value = estadoLinha.valor_manual || '';
        novaLinha.querySelector('.input-observacao').value = estadoLinha.observacao || '';
        novaLinha.querySelector('.select-linha-checkbox').checked = estadoLinha.selecionado === true;
    } else toggleCmd();

    novaLinha.querySelectorAll('input, select').forEach(el => el.addEventListener(el.tagName==='SELECT'?'change':'input', () => { recalcularTotaisSelecionados(); setDirty(); }));
    novaLinha.querySelector('.input-valor-manual').addEventListener('blur', () => {
        const taxa = TAXAS_PARCELAMENTO[elements.selectParcelamentoGlobal?.value || 'DÉBITO'] || 0;
        calcularParceladoLinhaAmorim(novaLinha, taxa);
    });
    novaLinha.querySelector('.btn-remover-linha').addEventListener('click', () => removerLinhaCalculadora(novaLinha));
    tableBody.appendChild(novaLinha);
    const taxa = TAXAS_PARCELAMENTO[elements.selectParcelamentoGlobal?.value || 'DÉBITO'] || 0;
    calcularParceladoLinhaAmorim(novaLinha, taxa);
    if(!estadoLinha && !isInitialLoad) setDirty();
}

function recalcularTodasLinhas() {
    document.querySelectorAll('#quote-sections-container .linha-calculo-cliente[data-linha-type="tecido"]').forEach(l => calcularOrcamentoLinha(l));
}

function removerLinhaCalculadora(linha) {
    if (!linha) return;
    linhaParaExcluir = linha;
    if (elements.spanAmbienteNomeExcluir) elements.spanAmbienteNomeExcluir.textContent = linha.querySelector('.input-ambiente')?.value || 'sem nome';
    openModal(elements.modalExcluirLinha);
}

function obterValorRealSelect(select) {
    return select ? (parseFloat(select.options[select.selectedIndex]?.dataset.valorReal) || 0) : 0;
}

function parseCurrencyValue(val) {
    return parseFloat(String(val).replace(/[R$\.\s]/g, "").replace(",", ".")) || 0;
}

function recalcularTotaisSelecionados() {
    let totalGeral = 0;      
    let totalSelecionado = 0;
    let totalInstalacao = 0;
    let algumSelect = false;
    let temLinhas = false;

    const taxa = TAXAS_PARCELAMENTO[elements.selectParcelamentoGlobal?.value || 'DÉBITO'] || 0;
    
    document.querySelectorAll('#quote-sections-container .linha-calculo-cliente').forEach(linha => {
        temLinhas = true;
        const valorLinha = parseCurrencyValue(linha.querySelector('.resultado-preco-total')?.value);
        
        totalGeral += valorLinha;

        if (linha.querySelector('.select-linha-checkbox')?.checked) {
            algumSelect = true;
            totalSelecionado += valorLinha;
            if(linha.dataset.linhaType === 'tecido') {
                totalInstalacao += parseFloat(linha.querySelector('.select-instalacao')?.value) || 0;
            }
        }
    });

    const frete = parseFloat(elements.selectFreteGlobal?.value) || 0;
    const entrada = parseCurrencyValue(elements.inputValorEntradaGlobal?.value);
    
    let totalFinalSelecionado = 0, parceladoFinal = 0;
    
    totalGeral += frete;

    if (algumSelect) {
        totalFinalSelecionado = totalSelecionado + frete;
        let baseParcelar = Math.max(0, (totalSelecionado - totalInstalacao) - entrada); 
        parceladoFinal = (baseParcelar * (1 + taxa)) + frete + totalInstalacao;
    }

    if (elements.summaryContainer) {
        elements.summaryContainer.style.display = (temLinhas || algumSelect) ? 'block' : 'none';
        
        if (elements.summaryTotalGeral) {
            elements.summaryTotalGeral.textContent = formatadorReaisCalc.format(totalGeral);
        }

        elements.summaryTotalAvista.textContent = formatadorReaisCalc.format(totalFinalSelecionado);
        elements.summaryTotalParcelado.textContent = formatadorReaisCalc.format(parceladoFinal);
        
        if(elements.summaryParceladoLabel) elements.summaryParceladoLabel.textContent = elements.selectParcelamentoGlobal?.value;
        
        if(entrada > 0 && algumSelect) {
            elements.summaryTotalEntrada.style.display = 'block';
            elements.summaryTotalEntradaValue.textContent = formatadorReaisCalc.format(entrada);
            elements.summaryTotalRestante.style.display = 'block';
            elements.summaryTotalRestanteValue.textContent = formatadorReaisCalc.format(totalFinalSelecionado - entrada);
        } else {
            elements.summaryTotalEntrada.style.display = 'none';
            elements.summaryTotalRestante.style.display = 'none';
        }
    }
}

async function calcularOrcamentoLinha(linha) {
    if (!linha || !isDataLoadedRef.value) return;
    const dados = {
        largura: parseFloat(linha.querySelector('.input-largura')?.value.replace(',', '.')) || 0,
        altura: parseFloat(linha.querySelector('.input-altura')?.value.replace(',', '.')) || 0,
        franzCortina: parseFloat(linha.querySelector('.select-franzCortina')?.value) || 1,
        franzBlackout: parseFloat(linha.querySelector('.select-franzBlackout')?.value) || 1,
        valorConfecao: obterValorRealSelect(linha.querySelector('.select-confecao')),
        valorTrilho: obterValorRealSelect(linha.querySelector('.select-trilho')),
        valorInstalacao: parseFloat(linha.querySelector('.select-instalacao')?.value) || 0,
        valorOutros: parseCurrencyValue(linha.querySelector('.input-outros')?.value),
        markupBase: (parseFloat(elements.calculatorMarkupInput?.value) || 100) / 100
    };
    
    const findTecido = (nome) => (dataRefs.tecidos||[]).find(t=>t.produto===nome) || {largura:0, atacado:0};
    dados.tecidoCortina = { ...findTecido(linha.querySelector('.select-codTecidoCortina')?.value), preco: findTecido(linha.querySelector('.select-codTecidoCortina')?.value).atacado };
    dados.tecidoForro = { ...findTecido(linha.querySelector('.select-codTecidoForro')?.value), preco: findTecido(linha.querySelector('.select-codTecidoForro')?.value).atacado };
    dados.tecidoBlackout = { ...findTecido(linha.querySelector('.select-codTecidoBlackout')?.value), preco: findTecido(linha.querySelector('.select-codTecidoBlackout')?.value).atacado };

    try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch(`${BACKEND_API_URL}/api/calcular`, {
            method: 'POST', headers: {'Content-Type':'application/json', 'Authorization':`Bearer ${token}`}, body: JSON.stringify(dados)
        });
        if(!res.ok) throw new Error("Erro API");
        const result = await res.json();
        
        const setVal = (sel, val) => { const el = linha.querySelector(sel); if(el) el.value = val; };
        setVal('td:nth-child(8) input', result.qtdTecidoCortina?.toFixed(3).replace('.',','));
        setVal('td:nth-child(10) input', result.qtdTecidoForro?.toFixed(3).replace('.',','));
        setVal('td:nth-child(13) input', result.qtdTecidoBlackout?.toFixed(3).replace('.',','));
        setVal('.resultado-preco-total', formatadorReaisCalc.format(result.orcamentoBase || 0));
        
        const taxa = TAXAS_PARCELAMENTO[elements.selectParcelamentoGlobal?.value || 'DÉBITO'] || 0;
        const parcelado = ((result.orcamentoBase - dados.valorInstalacao) * (1 + taxa)) + dados.valorInstalacao;
        setVal('.resultado-preco-parcelado', formatadorReaisCalc.format(parcelado));

    } catch (e) { console.error(e); }
    recalcularTotaisSelecionados();
}

export async function showCalculatorView(clientId, clientName) {
    if (!elements.clientListView) return;
    elements.clientListView.style.display = 'none';
    elements.calculatorView.style.display = 'block';
    elements.calculatorClientName.textContent = `Orçamento: ${clientName}`;
    if(elements.saveStatusMessage) elements.saveStatusMessage.textContent = 'Carregando...';
    
    try {
        await aguardarDadosBase();
        preencherSelectParcelamento();
        preencherSelectCalculadora(elements.selectFreteGlobal, dataRefs.frete, true, "SEM FRETE", true);
        await carregarEstadoCalculadora(clientId);
        atualizarHeaderParcelado();
        if(elements.saveStatusMessage) elements.saveStatusMessage.textContent = '';

    } catch (e) { 
        showToast("Erro ao abrir calculadora.", "error"); 
        if(elements.saveStatusMessage) elements.saveStatusMessage.textContent = '';
    }
}
async function carregarEstadoCalculadora(clientId) {
    isDirty = false;
    const container = document.getElementById('quote-sections-container');
    if(container) container.innerHTML = '';
    estadoAbas = []; abaAtivaIndex = 0;
    
    try {
        const token = await getAuthToken();
        const res = await fetch(`${BACKEND_API_URL}/api/orcamentos/${clientId}`, { headers: {'Authorization':`Bearer ${token}`} });
        if (!res.ok && res.status !== 404) throw new Error();
        
        if (res.status === 404) {
            estadoAbas = [{ nome: "Orçamento 1", sections: {}, venda_realizada: false }];
            if(elements.calculatorMarkupInput) elements.calculatorMarkupInput.value = '100';
        } else {
            const data = await res.json();
            estadoAbas = data.abas || [{ nome: "Orçamento 1", sections: {}, venda_realizada: false }];
            if(elements.calculatorMarkupInput) elements.calculatorMarkupInput.value = data.markup || '100';
            if(elements.selectParcelamentoGlobal) elements.selectParcelamentoGlobal.value = data.parcelamento || 'DÉBITO';
            if(elements.selectFreteGlobal) elements.selectFreteGlobal.value = data.frete || '0';
            if(elements.inputValorEntradaGlobal) elements.inputValorEntradaGlobal.value = data.entrada || '';
        }
        renderizarTabs();
        ativarAba(0, true);
    } catch (e) {
        console.error(e);
        estadoAbas = [{ nome: "Orçamento 1", sections: {}, venda_realizada: false }];
        renderizarTabs(); ativarAba(0, true);
    }
}

async function salvarEstadoCalculadora(clientId) {
    if (abaAtivaIndex < 0) return;
    
    const sections = {};
    document.querySelectorAll('#quote-sections-container .quote-section').forEach(sec => {
        sections[sec.dataset.sectionType] = { active: true, ambientes: obterEstadoSection(sec) };
    });
    estadoAbas[abaAtivaIndex].sections = sections;
    estadoAbas[abaAtivaIndex].venda_realizada = elements.chkSummaryVendaRealizada?.checked || false;
    
    const payload = {
        abas: estadoAbas,
        markup: elements.calculatorMarkupInput?.value,
        parcelamento: elements.selectParcelamentoGlobal?.value,
        frete: elements.selectFreteGlobal?.value,
        entrada: elements.inputValorEntradaGlobal?.value
    };

    try {
        const token = await getAuthToken();
        await fetch(`${BACKEND_API_URL}/api/orcamentos/${clientId}`, {
            method: 'PUT', headers: {'Content-Type':'application/json', 'Authorization':`Bearer ${token}`}, body: JSON.stringify(payload)
        });
        isDirty = false;
        if(elements.saveStatusMessage) {
            elements.saveStatusMessage.textContent = `Salvo às ${new Date().toLocaleTimeString()}`;
            elements.saveStatusMessage.className = 'save-status-message saved';
        }
        atualizarStatusVendaCliente(false, clientId);
    } catch (e) { showToast("Erro ao salvar.", "error"); }
}

function obterEstadoSection(section) {
    const type = section.dataset.sectionType;
    const linhas = [];
    section.querySelectorAll('.linha-calculo-cliente').forEach(l => {
        let obj = {
            ambiente: l.querySelector('.input-ambiente')?.value,
            largura: l.querySelector('.input-largura')?.value,
            altura: l.querySelector('.input-altura')?.value,
            selecionado: l.querySelector('.select-linha-checkbox')?.checked,
            observacao: l.querySelector('.input-observacao')?.value
        };
        if(type === 'tecido') {
            obj.franzCortina = l.querySelector('.select-franzCortina')?.value;
            obj.codTecidoCortina = l.querySelector('.select-codTecidoCortina')?.value;
            obj.codTecidoForro = l.querySelector('.select-codTecidoForro')?.value;
            obj.franzBlackout = l.querySelector('.select-franzBlackout')?.value;
            obj.codTecidoBlackout = l.querySelector('.select-codTecidoBlackout')?.value;
            obj.confecaoTexto = l.querySelector('.select-confecao')?.value;
            obj.trilhoTexto = l.querySelector('.select-trilho')?.value;
            obj.instalacao = l.querySelector('.select-instalacao')?.value;
            obj.outros = l.querySelector('.input-outros')?.value;
        } else { 
            obj.modelo_cortina = l.querySelector('.select-modelo-cortina')?.value; 
            obj.modelo_toldo = l.querySelector('.select-modelo-toldo')?.value;
            obj.codigo_tecido = l.querySelector('.input-cod-tecido')?.value;
            obj.colecao = l.querySelector('.input-colecao')?.value;
            obj.cor_acessorios = l.querySelector('.select-cor-acessorios')?.value;
            obj.comando = l.querySelector('.select-comando')?.value;
            obj.lado_comando = l.querySelector('.select-lado-comando')?.value;
            obj.altura_comando = (obj.comando==='MOTORIZADO') ? l.querySelector('.select-altura-comando-motor')?.value : l.querySelector('.input-altura-comando-manual')?.value;
            obj.valor_manual = l.querySelector('.input-valor-manual')?.value;
        }
        linhas.push(obj);
    });
    return linhas;
}

function renderizarTabs() {
    const container = elements.tabsContainer;
    if (!container) return;
    container.querySelectorAll('.calc-tab').forEach(t => t.remove());
    estadoAbas.forEach((aba, i) => {
        const div = document.createElement('div');
        div.className = `calc-tab ${i === abaAtivaIndex ? 'active' : ''} ${aba.venda_realizada ? 'venda-realizada' : ''}`;
        div.dataset.index = i;
        div.innerHTML = `<span class="calc-tab-name">${aba.nome || 'Orçamento'}</span><button class="btn-close-aba">×</button>`;
        container.insertBefore(div, elements.btnAddAba);
    });
}

function ativarAba(index, isInitialLoad) {
    if(!isInitialLoad && abaAtivaIndex >= 0) {
        const sections = {};
        document.querySelectorAll('#quote-sections-container .quote-section').forEach(sec => {
            sections[sec.dataset.sectionType] = { active: true, ambientes: obterEstadoSection(sec) };
        });
        estadoAbas[abaAtivaIndex].sections = sections;
        estadoAbas[abaAtivaIndex].venda_realizada = elements.chkSummaryVendaRealizada?.checked;
    }
    
    abaAtivaIndex = index;
    renderizarTabs();
    
    const container = document.getElementById('quote-sections-container');
    container.innerHTML = '';
    
    const aba = estadoAbas[index];
    const sections = aba.sections || {};
    const order = aba.sectionOrder || ['tecido', 'amorim', 'toldos'];
    
    order.forEach(type => {
        const data = sections[type];
        if (data && data.active) {
            const btn = document.getElementById(`btn-add-section-${type}`);
            addSection(type, btn, isInitialLoad);
            const body = container.querySelector(`.quote-section[data-section-type="${type}"] tbody`);
            body.innerHTML = '';
            (data.ambientes || []).forEach(amb => {
                if(type==='tecido') adicionarLinhaTecido(body, amb);
                else if(type==='amorim') adicionarLinhaAmorim(body, amb);
                else adicionarLinhaToldos(body, amb);
            });
        }
    });
    
    if(elements.chkSummaryVendaRealizada) elements.chkSummaryVendaRealizada.checked = aba.venda_realizada;
    checkSectionControls();
    recalcularTotaisSelecionados();
}

function adicionarAba() {
    if(abaAtivaIndex >= 0) {
        const sections = {};
        document.querySelectorAll('#quote-sections-container .quote-section').forEach(sec => {
            sections[sec.dataset.sectionType] = { active: true, ambientes: obterEstadoSection(sec) };
        });
        estadoAbas[abaAtivaIndex].sections = sections;
    }
    estadoAbas.push({ nome: `Orçamento ${estadoAbas.length+1}`, sections: {} });
    ativarAba(estadoAbas.length-1);
    setDirty();
}

function prepararExclusaoAba(index) {
    if (estadoAbas.length <= 1) { showToast("Mínimo 1 aba.", "error"); return; }
    abaParaExcluir = { index };
    if(elements.spanAbaNomeExcluir) elements.spanAbaNomeExcluir.textContent = estadoAbas[index].nome;
    openModal(elements.modalExcluirAba);
}

function executarExclusaoAba(index) {
    estadoAbas.splice(index, 1);
    if (abaAtivaIndex >= index) abaAtivaIndex = Math.max(0, abaAtivaIndex - 1);
    ativarAba(abaAtivaIndex);
    closeModal(elements.modalExcluirAba);
    setDirty();
}

function renomearAba(span) {
    const input = document.createElement('input');
    input.value = span.textContent;
    input.className = 'calc-tab-name-input';
    span.replaceWith(input);
    input.focus();
    const save = () => {
        estadoAbas[parseInt(input.closest('.calc-tab').dataset.index)].nome = input.value;
        span.textContent = input.value;
        input.replaceWith(span);
        setDirty();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if(e.key==='Enter') save(); });
}

function setupDecimalFormatting(input, places) {
    input.addEventListener('blur', e => {
        const v = parseFloat(e.target.value.replace(',','.'))||0;
        e.target.value = v === 0 ? '' : v.toFixed(places).replace('.',',');
    });
}
function setupCurrencyFormatting(input) {
    input.addEventListener('blur', e => {
        const v = parseFloat(e.target.value.replace(/[R$\s.]/g,'').replace(',','.'))||0;
        e.target.value = v === 0 ? '' : formatadorReaisCalc.format(v);
        recalcularTotaisSelecionados();
        setDirty();
    });
}
function formatDecimal(val, places) {
    const v = parseFloat(String(val).replace(',','.'))||0;
    return v.toFixed(places).replace('.',',');
}
function atualizarOpcoesConfeccao(linha) {
    const h = parseFloat(linha.querySelector('.input-altura').value.replace(',','.'))||0;
    const sel = linha.querySelector('.select-confecao');
    const valOld = sel.value;
    sel.innerHTML = '<option value="-" data-valor-real="0">NENHUM</option>';
    (dataRefs.confeccao||[]).forEach(c => {
        if ((h >= 3.5 && c.altura_especial) || (h < 3.5 && !c.altura_especial)) {
            const opt = new Option(c.opcao, c.opcao); opt.dataset.valorReal = c.valor; sel.appendChild(opt);
        }
    });
    sel.value = valOld; if(sel.selectedIndex===-1) sel.value='-';
}