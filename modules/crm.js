import { _supabase } from '../supabaseClient.js';
import { showToast, openModal, closeModal } from './ui.js';
import { can } from './permissions.js';

let listaClientesEl, inputPesquisaClientesEl, formAddClienteEl, formEditarClienteEl;
let modalAddClienteEl, modalEditarClienteEl, modalExcluirClienteEl;
let btnConfirmarExcluirClienteEl;
let clienteParaExcluirInfo = null;
let btnToggleFilterEl, selectClientFilterEl, btnToggleSortOrderEl;
let cachedLojaIdCrm = null; 
let isSortAscending = true;
async function getMyLojaIdCrm() {
    _supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
            cachedLojaIdCrm = null;
        }
    });
    if (cachedLojaIdCrm) return cachedLojaIdCrm;
    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");

        const { data, error, status } = await _supabase
            .from('perfis')
            .select('loja_id') 
            .eq('user_id', user.id) 
            .single();

        if (error && status !== 406) throw error;
        if (!data || !data.loja_id) throw new Error("Perfil ou loja_id não encontrados.");
        cachedLojaIdCrm = data.loja_id;
        return cachedLojaIdCrm;
    } catch (error) {
        console.error("Erro ao buscar loja_id do perfil (CRM):", error);
        showToast(`Erro crítico: Não foi possível identificar sua loja (${error.message}).`, "error");
        return null;
    }
}

export function initCRM(elements) {
    listaClientesEl = elements.listaClientes;
    inputPesquisaClientesEl = elements.inputPesquisaClientes;
    formAddClienteEl = elements.formAddCliente;
    formEditarClienteEl = elements.formEditarCliente;
    modalAddClienteEl = elements.modalAddCliente;
    modalEditarClienteEl = elements.modalEditarCliente;
    modalExcluirClienteEl = elements.modalExcluirCliente;
    btnConfirmarExcluirClienteEl = elements.btnConfirmarExcluirCliente;
    btnToggleFilterEl = elements.btnToggleFilter; 
    selectClientFilterEl = elements.selectClientFilter;
    
    if (elements.btnToggleSortOrder) { 
        btnToggleSortOrderEl = elements.btnToggleSortOrder;
    } else {
        btnToggleSortOrderEl = document.getElementById('btn-toggle-sort-order');
    }

    setupAddClienteButton();
    setupAddClienteForm(); 
    setupPesquisaClientes();
    setupAcoesCardCliente();
    setupModaisCliente();
    setupFiltroClientes();
    document.addEventListener('clienteAtualizado', () => {
        console.log("Evento clienteAtualizado recebido, recarregando clientes...");
        aplicarFiltroEOrdenacao(); 
    });
}

export async function carregarClientes(filterOptions = {}) {
    console.log("Carregando clientes com opções:", filterOptions);

    const lojaId = await getMyLojaIdCrm(); 
    if (!lojaId) {
        showToast("Erro: Não foi possível identificar sua loja. Tente fazer login novamente.", "error");
        renderizarListaClientes([]); 
        return;
    }

    let query = _supabase.from('clientes')
                       .select('*, updated_by_name')
                       .eq('loja_id', lojaId); 

    if (filterOptions.venda_realizada === true) query = query.eq('venda_realizada', true);
    else if (filterOptions.venda_realizada === false) query = query.or('venda_realizada.is.null,venda_realizada.eq.false');
    if (filterOptions.searchTerm) query = query.ilike('nome', `%${filterOptions.searchTerm}%`);

    const orderBy = filterOptions.orderBy || 'nome';
    const ascending = filterOptions.ascending !== false;
    query = query.order(orderBy, { ascending: ascending });

    const { data: clientes, error } = await query;

    if (error) {
        console.error('Erro ao carregar/filtrar clientes:', error);
        let userMessage = "Erro ao carregar/filtrar clientes.";
        if (error.message.includes('row-level security policy') || error.code === '42501') {
             userMessage = "Acesso bloqueado. Verifique o status da sua assinatura.";
             renderizarListaClientes([]);
        }
        showToast(userMessage, "error");
        if (userMessage.startsWith("Erro")) renderizarListaClientes([]);
    } else {
        renderizarListaClientes(clientes || []);
    }
}

function formatarDataHora(isoString) {
    if (!isoString) return 'N/A';
    try {
        return new Date(isoString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        console.warn("Erro ao formatar data:", isoString, e);
        return 'Data inválida';
    }
}

function renderizarListaClientes(clientes) {
    if (!listaClientesEl) return;
    listaClientesEl.innerHTML = '';
    if (!clientes || clientes.length === 0) {
        listaClientesEl.innerHTML = '<p style="text-align: center; color: #777;">Nenhum cliente encontrado.</p>';
        return;
    }

    const podeEditar = can('perm_clientes_edit');
    const podeExcluir = can('perm_clientes_delete');

    clientes.forEach(cliente => {
        const card = document.createElement('div');
        card.className = `cliente-card ${cliente.venda_realizada ? 'venda-realizada' : ''}`;
        card.dataset.id = cliente.id; 
        card.dataset.nome = cliente.nome; 

        const criadoEm = formatarDataHora(cliente.created_at); 
        const atualizadoEm = formatarDataHora(cliente.updated_at);
        const atualizadoPor = cliente.updated_by_name ? ` por ${cliente.updated_by_name}` : ''; 

        let botoesHtml = '';
        if (podeEditar) botoesHtml += `<button class="btn-editar">Editar</button>`;
        if (podeExcluir) botoesHtml += `<button class="btn-excluir">Excluir</button>`;

        card.innerHTML = `
            <div class="card-content">
                <div class="card-header"><p class="cliente-nome"><strong>${cliente.nome || 'Sem nome'}</strong></p><div class="cliente-timestamps"><span class="timestamp updated">Última Edição: ${atualizadoEm}${atualizadoPor}</span><span class="timestamp created">Criado: ${criadoEm}</span></div></div>
                <div class="cliente-details"><span>${cliente.telefone || 'Sem telefone'} | ${cliente.email || 'Sem email'}</span><p>${cliente.endereco || 'Sem endereço'}</p></div>
            </div>
            <div class="cliente-acoes">${botoesHtml}</div>`; 
        listaClientesEl.appendChild(card);
    });
}

function setupAddClienteButton() {
    const button = document.getElementById('btn-abrir-modal-add');
    if (button) {
            button.addEventListener('click', () => {
                if(formAddClienteEl) formAddClienteEl.reset();
                openModal(modalAddClienteEl);
            });
        }
    }

function setupAddClienteForm() {
    if (!formAddClienteEl) return;
    formAddClienteEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = formAddClienteEl.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try { 
            const dadosForm = new FormData(formAddClienteEl);
            const lojaId = await getMyLojaIdCrm();
            if (!lojaId) return; 

            const novoCliente = {
                nome: dadosForm.get('nome'), telefone: dadosForm.get('telefone'), email: dadosForm.get('email'), endereco: dadosForm.get('endereco'),
                loja_id: lojaId 
            };

            const { error } = await _supabase.from('clientes').insert(novoCliente);

            if (error) {
                console.error('Erro ao salvar cliente:', error);
                let userMessage = 'Erro ao salvar cliente.';
                showToast(userMessage, "error");
            } else {
                formAddClienteEl.reset();
                closeModal(modalAddClienteEl);
                await aplicarFiltroEOrdenacao(); 
                showToast('✅ Cliente cadastrado!');
            }
        
        } finally {
            if (submitButton) submitButton.disabled = false; 
        }
        
    });
}

function setupPesquisaClientes() {
    if (!inputPesquisaClientesEl) return;
    inputPesquisaClientesEl.addEventListener('input', () => {
        const termo = inputPesquisaClientesEl.value.trim().toLowerCase();
        aplicarFiltroEOrdenacao({ searchTerm: termo }); 
    });
}

function setupFiltroClientes() {
    if (selectClientFilterEl) {
        selectClientFilterEl.addEventListener('change', () => {
            if (inputPesquisaClientesEl) inputPesquisaClientesEl.value = '';
            isSortAscending = true; 
            aplicarFiltroEOrdenacao();
        });
    }

    if (btnToggleSortOrderEl) {
        btnToggleSortOrderEl.addEventListener('click', () => {
            isSortAscending = !isSortAscending; 
            aplicarFiltroEOrdenacao();
        });
    }
}

function aplicarFiltroEOrdenacao(additionalOptions = {}) {
    if (!selectClientFilterEl || !btnToggleSortOrderEl) {
        carregarClientes(additionalOptions); 
        return;
    }

    const valorSelecionado = selectClientFilterEl.value;
    let options = { ...additionalOptions };
    let orderByKey = 'nome'; 
    let isDateSort = false;

    switch (valorSelecionado) {
        case 'nome':
            orderByKey = 'nome';
            isDateSort = false;
            break;
        case 'venda_realizada_true':
            options.venda_realizada = true;
            orderByKey = 'updated_at'; 
            isDateSort = true;
            break;
        case 'venda_realizada_false':
            options.venda_realizada = false;
            orderByKey = 'updated_at'; 
            isDateSort = true;
            break;
        case 'updated_at':
            orderByKey = 'updated_at';
            isDateSort = true;
            break;
        case 'created_at':
            orderByKey = 'created_at';
            isDateSort = true;
            break;
        default:
            orderByKey = 'nome';
            isDateSort = false;
    }

    let ascending;
    if (isDateSort) {
        ascending = !isSortAscending; 
        btnToggleSortOrderEl.textContent = isSortAscending ? 'Mais Recentes' : 'Mais Antigos';
    } else {
        ascending = isSortAscending;
        btnToggleSortOrderEl.textContent = isSortAscending ? 'A-Z' : 'Z-A';
    }

    options.orderBy = orderByKey;
    options.ascending = ascending;
    
    carregarClientes(options);
}

function setupAcoesCardCliente() {
    if (!listaClientesEl) return;
    listaClientesEl.addEventListener('click', (e) => {
        const card = e.target.closest('.cliente-card');
        if (!card) return;
        const clientId = card.dataset.id;
        const clientName = card.dataset.nome;

        if (e.target.classList.contains('btn-excluir')) {
            const spanNome = document.getElementById('cliente-nome-excluir');
            if(spanNome) spanNome.textContent = clientName || 'este cliente';
            clienteParaExcluirInfo = { id: clientId, cardElemento: card }; 
            openModal(modalExcluirClienteEl);
            return;
        }
        if (e.target.classList.contains('btn-editar')) {
            if(formEditarClienteEl){ 
                formEditarClienteEl.querySelector('#edit-id').value = card.dataset.id;
                formEditarClienteEl.querySelector('#edit-nome').value = card.dataset.nome;
                formEditarClienteEl.querySelector('#edit-telefone').value = card.dataset.telefone;
                formEditarClienteEl.querySelector('#edit-email').value = card.dataset.email;
                formEditarClienteEl.querySelector('#edit-endereco').value = card.dataset.endereco;
            }
            openModal(modalEditarClienteEl);
            return;
        }
        window.location.hash = `#cliente/${clientId}`;
    });
}

function setupModaisCliente() {
    const btnCancelAdd = document.getElementById('btn-cancelar-add');
    if(btnCancelAdd) btnCancelAdd.addEventListener('click', () => closeModal(modalAddClienteEl));

    const btnCancelEdit = document.getElementById('btn-cancelar-editar');
    if(btnCancelEdit) btnCancelEdit.addEventListener('click', () => closeModal(modalEditarClienteEl));

    if(formEditarClienteEl) formEditarClienteEl.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const dadosForm = new FormData(formEditarClienteEl); 

    let nomeUsuario = null; 
    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");

        const { data: perfil, error } = await _supabase
            .from('perfis')
            .select('nome_usuario')
            .eq('user_id', user.id) 
            .single(); 
            
        if (error) throw error;
        if (perfil && perfil.nome_usuario) nomeUsuario = perfil.nome_usuario; 
    } catch (e) {
        console.warn("Nao foi possivel obter nome do usuario para 'updated_by_name'");
    }   

    const dadosCliente = { 
        nome: dadosForm.get('nome'), 
        telefone: dadosForm.get('telefone'), 
        email: dadosForm.get('email'), 
        endereco: dadosForm.get('endereco'),
        updated_by_name: nomeUsuario,
        updated_at: new Date().toISOString()
    };
    const lojaId = await getMyLojaIdCrm();
    if (!lojaId) {
         showToast("Erro: Não foi possível identificar sua loja. Tente fazer login novamente.", "error");
         return;
    }

    const { error } = await _supabase.from('clientes')
        .update(dadosCliente)
        .match({ id: dadosForm.get('id'), loja_id: lojaId })
        .select();
    if (error) {
        console.error('Erro ao atualizar cliente:', error);
        let userMessage = 'Erro ao salvar dados.';
        if (error.message.includes('violates row-level security policy')) userMessage += " Verifique permissões ou status da assinatura.";
        else userMessage += ` Detalhe: ${error.message}`;
        showToast(userMessage, "error");
    } else {
        closeModal(modalEditarClienteEl);
        await aplicarFiltroEOrdenacao();
        showToast('✅ Dados salvos!');
    }
});

    const btnCancelExcluir = document.getElementById('btn-cancelar-excluir-cliente');
    if(btnCancelExcluir) btnCancelExcluir.addEventListener('click', () => {
        closeModal(modalExcluirClienteEl); clienteParaExcluirInfo = null;
    });

    if(btnConfirmarExcluirClienteEl) btnConfirmarExcluirClienteEl.addEventListener('click', async () => {
        if (!clienteParaExcluirInfo) return;
        const { id, cardElemento } = clienteParaExcluirInfo;

        const lojaId = await getMyLojaIdCrm();
        if (!lojaId) return;

        const { error } = await _supabase.from('clientes').delete().match({ id: id, loja_id: lojaId }); 

        if (error) {
            console.error('Erro ao excluir cliente:', error);
            let userMessage = 'Erro ao excluir cliente.';
            if (error.message.includes('violates row-level security policy')) userMessage += " Você não tem permissão para excluir.";
            else userMessage += ` Detalhe: ${error.message}`;
            showToast(userMessage, "error");
        } else {
            cardElemento.remove();
            showToast('Cliente excluído.');
        }
        closeModal(modalExcluirClienteEl);
        clienteParaExcluirInfo = null;
    });
}