import { _supabase } from '../supabaseClient.js';
import { showToast, openModal, closeModal } from './ui.js'; 
import { can } from './permissions.js';

let elements = {};
let dataArrays = {}; 

let cachedLojaId = null;
async function getMyLojaId() {
    _supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
            cachedLojaId = null;
        }
    });

    if (cachedLojaId) return cachedLojaId;
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
        cachedLojaId = data.loja_id;
        return cachedLojaId;
    } catch (error) {
        console.error("Erro ao buscar loja_id:", error);
        return null; 
    }
}

function formatDecimal(value, decimalPlaces = 2) { 
    const num = parseFloat(String(value).replace(',', '.'));
    if (isNaN(num)) { return (0).toFixed(decimalPlaces).replace('.', ','); }
    return num.toFixed(decimalPlaces).replace('.', ',');
}

function setupInputFormatting(inputId, formatType) {
    const inputElement = document.getElementById(inputId);
    if (!inputElement) return;

    const isCurrency = formatType === 'currency';
    const decimalPlaces = (formatType === 'measure') ? 3 : 2;
    const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }); 

    inputElement.addEventListener('focus', (e) => {
        let value = e.target.value.replace('R$ ', '').trim();
        if (isCurrency) {
            value = value.replace(/\./g, "").replace(",", "."); 
        }
        let num = parseFloat(value) || 0;
        
        e.target.value = (num > 0) ? String(num).replace('.', ',') : ''; 
    });

    inputElement.addEventListener('blur', (e) => {
        let value = e.target.value;
        let num = parseFloat(String(value).replace(',', '.')) || 0;
        
        if (isCurrency) {
            e.target.value = formatador.format(num);
        } else {
            e.target.value = num.toFixed(decimalPlaces).replace('.', ',');
        }
    });
}

function initDataManager(domElements, dataRefs) {
    elements = domElements;
    dataArrays = dataRefs; 

    setupCRUD('tecidos');
    setupCRUD('confeccao');
    setupCRUD('trilho');
    setupCRUD('frete');
    setupCRUD('instalacao');

    setupAmorim(
        'amorim_modelos_cortina', 
        'btn-abrir-modal-add-modelo-cortina', 
        'modal-add-modelo-cortina', 
        'form-add-modelo-cortina',
        'modal-edit-modelo-cortina', 
        'form-edit-modelo-cortina', 
        'tabela-modelo-cortina-body'
    );

    setupAmorim(
        'amorim_cores_cortina', 
        'btn-abrir-modal-add-cor-cortina', 
        'modal-add-cor-cortina', 
        'form-add-cor-cortina',
        'modal-edit-cor-cortina', 
        'form-edit-cor-cortina', 
        'tabela-cor-cortina-body'
    );

    setupAmorim(
        'amorim_modelos_toldo', 
        'btn-abrir-modal-add-modelo-toldo', 
        'modal-add-modelo-toldo', 
        'form-add-modelo-toldo',
        'modal-edit-modelo-toldo', 
        'form-edit-modelo-toldo', 
        'tabela-modelo-toldo-body'
    );

    setupAmorim(
        'amorim_cores_toldo', 
        'btn-abrir-modal-add-cor-toldo', 
        'modal-add-cor-toldo', 
        'form-add-cor-toldo',
        'modal-edit-cor-toldo', 
        'form-edit-cor-toldo', 
        'tabela-cor-toldo-body'
    );

    setupPesquisa('tecidos', 'produto');
    setupPesquisa('confeccao', 'opcao');
    setupPesquisa('trilho', 'opcao');
    setupPesquisa('frete', 'opcao'); 
    setupPesquisa('instalacao', 'opcao'); 
    setupPesquisa('amorim_modelos_cortina', 'opcao');
    setupPesquisa('amorim_cores_cortina', 'opcao');
    setupPesquisa('amorim_modelos_toldo', 'opcao');
    setupPesquisa('amorim_cores_toldo', 'opcao');
    
    setupInputFormatting('add-tecido-largura', 'measure');
    setupInputFormatting('add-tecido-atacado', 'currency');
    setupInputFormatting('edit-tecido-largura', 'measure');
    setupInputFormatting('edit-tecido-atacado', 'currency');
    setupInputFormatting('add-confeccao-valor', 'currency');
    setupInputFormatting('edit-confeccao-valor', 'currency');
    setupInputFormatting('add-trilho-valor', 'currency');
    setupInputFormatting('edit-trilho-valor', 'currency');
    setupInputFormatting('add-frete-valor', 'currency');
    setupInputFormatting('edit-frete-valor', 'currency');
    setupInputFormatting('add-instalacao-valor', 'currency');
    setupInputFormatting('edit-instalacao-valor', 'currency');
    setupInputFormatting('add-confeccao-limite', 'measure'); 
    setupInputFormatting('edit-confeccao-limite', 'measure');
}

function getRenderFunction(tabela) { 
     switch (tabela) {
        case 'tecidos': return renderizarTabelaTecidos;
        case 'confeccao': return renderizarTabelaConfeccao;
        case 'trilho': return renderizarTabelaTrilho;
        case 'frete': return renderizarTabelaFrete;
        case 'instalacao': return renderizarTabelaInstalacao;
        case 'amorim_modelos_cortina': return (dados) => renderizarTabelaAmorimGen(dados, 'tabela-modelo-cortina-body');
        case 'amorim_cores_cortina': return (dados) => renderizarTabelaAmorimGen(dados, 'tabela-cor-cortina-body');
        case 'amorim_modelos_toldo': return (dados) => renderizarTabelaAmorimGen(dados, 'tabela-modelo-toldo-body');
        case 'amorim_cores_toldo': return (dados) => renderizarTabelaAmorimGen(dados, 'tabela-cor-toldo-body');
        default: return null;
    }
}

function gerarBotoesAcao() {
    let html = '';
    if (can('perm_data_edit')) {
        html += `<button class="btn-editar">Editar</button>`;
    }
    if (can('perm_data_delete')) {
        html += `<button class="btn-excluir">Excluir</button>`;
    }
    return html;
}

function renderizarTabelaAmorimGen(dados, bodyId) {
    const tbody = document.getElementById(bodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    const lista = dados || [];
    
    if (lista.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Nenhum item encontrado.</td></tr>'; 
        return; 
    }
    
    lista.sort((a,b) => a.opcao.localeCompare(b.opcao));

    lista.forEach(d => {
        const row = tbody.insertRow();
        row.dataset.id = d.id;
        row.dataset.opcao = d.opcao; 
        
        row.innerHTML = `
            <td>${d.opcao}</td>
            <td style="text-align: center;">
                <button class="btn-editar">Editar</button> 
                <button class="btn-excluir">Excluir</button>
            </td>`;
    });
}

function renderizarTabelaFrete(opcoes) { 
    const tbody = elements.tabelaFreteBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtradas = (opcoes || []).filter(item => item.opcao !== '-');
    
    if (filtradas.length === 0) { tbody.innerHTML = '<tr><td colspan="3">Nenhuma opção encontrada.</td></tr>'; return; }
    
    const botoes = gerarBotoesAcao();

    filtradas.forEach(d => {
        const row = tbody.insertRow();
        row.dataset.id = d.id;
        row.dataset.opcao = d.opcao || ''; 
        row.dataset.valor = d.valor || 0;
        
        const nomeExibicao = d.opcao && d.opcao.trim() !== '' ? d.opcao : `R$ ${formatDecimal(d.valor, 2)}`;
        
        row.innerHTML = `
            <td>${nomeExibicao}</td>
            <td>R$ ${formatDecimal(d.valor, 2)}</td>
            <td style="text-align: center;">${botoes}</td>`;
    });
}

function renderizarTabelaInstalacao(opcoes) { 
    const tbody = elements.tabelaInstalacaoBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtradas = (opcoes || []).filter(item => item.opcao !== '-');
    
    if (filtradas.length === 0) { tbody.innerHTML = '<tr><td colspan="3">Nenhuma opção encontrada.</td></tr>'; return; }
   
    const botoes = gerarBotoesAcao();

    filtradas.forEach(d => {
        const row = tbody.insertRow();
        row.dataset.id = d.id;
        row.dataset.opcao = d.opcao || '';
        row.dataset.valor = d.valor || 0;
        
        const nomeExibicao = d.opcao && d.opcao.trim() !== '' ? d.opcao : `R$ ${formatDecimal(d.valor, 2)}`;

        row.innerHTML = `
             <td>${nomeExibicao}</td>
            <td>R$ ${formatDecimal(d.valor, 2)}</td>
            <td style="text-align: center;">${botoes}</td>`;
    });
}

function renderizarTabelaTecidos(tecidos) { 
    const tbody = elements.tabelaTecidosBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    const tecidosFiltrados = (tecidos || []).filter(t => t.produto !== 'SEM TECIDO' && t.produto !== '-');
    
    if (tecidosFiltrados.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="5">Nenhum tecido encontrado.</td></tr>'; 
        return; 
    }
    const botoes = gerarBotoesAcao();

    tecidosFiltrados.forEach(d => {
        const row = tbody.insertRow();
        row.dataset.id = d.id; 
        row.dataset.produto = d.produto; 
        row.dataset.largura = d.largura || 0; 
        row.dataset.atacado = d.atacado || 0; 
        row.dataset.favorito = d.favorito || false;
        let tagsHtml = '';
        if (d.categorias && Array.isArray(d.categorias)) {
            d.categorias.forEach(cat => {
                tagsHtml += `<span class="badge-categoria badge-${cat}">${cat}</span>`;
            });
        }
        const favoritoClass = d.favorito ? 'favorito' : ''; 
        const favoritoIcon = d.favorito ? '★' : '☆';
        row.innerHTML = `
            <td class="col-favorito-acao"><span class="btn-favorito ${favoritoClass}" title="Favoritar">${favoritoIcon}</span></td>
            <td>${d.produto} ${tagsHtml}</td>
            <td>${formatDecimal(d.largura, 3)}</td>
            <td>R$ ${formatDecimal(d.atacado, 2)}</td>
            <td>${botoes}</td>`;
    });
}

function renderizarTabelaConfeccao(opcoes) {
    const tbody = elements.tabelaConfeccaoBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtradas = (opcoes || []).filter(item => item.opcao !== '-');
    if (filtradas.length === 0) { tbody.innerHTML = '<tr><td colspan="4">Nenhuma opção encontrada.</td></tr>'; return; }

    const botoes = gerarBotoesAcao();

    filtradas.forEach(d => {
        const row = tbody.insertRow();
        row.dataset.id = d.id; 
        row.dataset.opcao = d.opcao; 
        row.dataset.valor = d.valor || 0; 
        row.dataset.favorito = d.favorito || false;
        row.dataset.altura_especial = d.altura_especial; 

        const favoritoClass = d.favorito ? 'favorito' : ''; 
        const favoritoIcon = d.favorito ? '★' : '☆';
        
        let regraTexto = '';
        if (d.altura_especial === true) {
            regraTexto = `<span style="font-size:11px; color:#fff; background:#e06c6e; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">Altura ≥ 3,50m</span>`;
        }

        row.innerHTML = `
            <td class="col-favorito-acao"><span class="btn-favorito ${favoritoClass}" title="Favoritar">${favoritoIcon}</span></td>
            <td>${d.opcao} ${regraTexto}</td>
            <td>R$ ${formatDecimal(d.valor, 2)}</td>
            <td>${botoes}</td>`;
    });
}

function renderizarTabelaTrilho(opcoes) { 
    const tbody = elements.tabelaTrilhoBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtradas = (opcoes || []).filter(item => item.opcao !== '-');
    if (filtradas.length === 0) { tbody.innerHTML = '<tr><td colspan="4">Nenhuma opção encontrada.</td></tr>'; return; }

    const botoes = gerarBotoesAcao();

    filtradas.forEach(d => {
        const row = tbody.insertRow();
        row.dataset.id = d.id; row.dataset.opcao = d.opcao; row.dataset.valor = d.valor || 0; row.dataset.favorito = d.favorito || false;
        const favoritoClass = d.favorito ? 'favorito' : ''; const favoritoIcon = d.favorito ? '★' : '☆';
        row.innerHTML = `<td class="col-favorito-acao"><span class="btn-favorito ${favoritoClass}" title="Favoritar">${favoritoIcon}</span></td><td>${d.opcao}</td><td>R$ ${formatDecimal(d.valor, 2)}</td><td>${botoes}</td>`;
    });
}

function setupCRUD(tabela) {
    const nomeCapitalizado = tabela.charAt(0).toUpperCase() + tabela.slice(1);
    const nomeSingular = nomeCapitalizado.replace(/s$/, '');
    let chaveNome = 'opcao';

    if (tabela === 'tecidos') {
        chaveNome = 'produto';
    } else if (tabela === 'frete' || tabela === 'instalacao') {
        const firstItem = dataArrays[tabela]?.[0];
        if (firstItem && firstItem.hasOwnProperty('opcao')) {
             chaveNome = 'opcao';
        } else {
             chaveNome = 'valor'; 
        }
    }

    const btnAbrirModalAdd = elements[`btnAbrirModalAdd${nomeCapitalizado}`];
    const modalAdd = elements[`modalAdd${nomeCapitalizado}`];
    const formAdd = elements[`formAdd${nomeCapitalizado}`];
    const btnCancelAdd = elements[`btnCancelAdd${nomeCapitalizado}`];

    const modalEdit = elements[`modalEdit${nomeCapitalizado}`];
    const formEdit = elements[`formEdit${nomeCapitalizado}`];
    const btnCancelEdit = elements[`btnCancelEdit${nomeCapitalizado}`];

    const tbody = elements[`tabela${nomeCapitalizado}Body`];

    if (btnAbrirModalAdd) {
        btnAbrirModalAdd.addEventListener('click', () => {
            if (!can('perm_data_add')) {
                showToast("Sem permissão para adicionar.", "error");
                return;
            }

            if(formAdd) {
                formAdd.reset();
                const inputs = formAdd.querySelectorAll('input[name="largura"], input[name="atacado"], input[name="valor"]');
                inputs.forEach(input => input.value = '');
                
                if (tabela === 'confeccao') {
                    const chk = document.getElementById('add-confeccao-altura-especial');
                    if (chk) chk.checked = false;
                }
            }
            openModal(modalAdd);
        });
    }

    if (formAdd) {
        formAdd.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!can('perm_data_add')) {
                showToast("Sem permissão para adicionar.", "error");
                return;
            }
            const dadosFormulario = getFormData(formAdd, tabela);
            const lojaId = await getMyLojaId(); 
            if (!lojaId) return;

            const dadosParaInserir = { ...dadosFormulario, loja_id: lojaId };
            const { error } = await _supabase.from(tabela).insert(dadosParaInserir);

            handleSaveResponse(error, modalAdd, tabela, `✅ ${nomeSingular} adicionado(a)!`);
        });
    }
    if (btnCancelAdd) btnCancelAdd.addEventListener('click', () => closeModal(modalAdd));

    if (formEdit) {
        formEdit.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!can('perm_data_edit')) {
                showToast("Sem permissão para editar.", "error");
                return;
            }
            const dadosFormulario = getFormData(formEdit, tabela);
            const id = formEdit.querySelector(`input[name="id"]`)?.value; 
            if (!id) return;

            const lojaId = await getMyLojaId(); 
            if (!lojaId) return;

            const updateData = {...dadosFormulario};
            delete updateData.id;

            const { error } = await _supabase.from(tabela).update(updateData).match({ id: id, loja_id: lojaId }); 
            handleSaveResponse(error, modalEdit, tabela, `✅ ${nomeSingular} atualizado(a)!`);
        });
    }
    if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => closeModal(modalEdit));

    if (tbody) {
        tbody.addEventListener('click', async (e) => { 
            const target = e.target;
            const row = target.closest('tr');
            if (!row || !row.dataset.id) return;

            const id = row.dataset.id; 
            const nome = row.dataset[chaveNome] || row.dataset.valor || `item ${id}`; 

            if (target.classList.contains('btn-favorito')) { 
                 const lojaId = await getMyLojaId(); 
                 if (!lojaId) return;
                 const starElement = target;
                 const isFavorito = row.dataset.favorito === 'true';
                 const newStatus = !isFavorito;
                 starElement.textContent = newStatus ? '★' : '☆';
                 starElement.classList.toggle('favorito', newStatus);
                 row.dataset.favorito = newStatus;
                 const { error } = await _supabase.from(tabela).update({ favorito: newStatus }).match({ id: id, loja_id: lojaId }); 
                 if (error) { showToast('Erro ao atualizar favorito.', true); } 
                 else { 
                    const itemInData = dataArrays[tabela].find(item => item.id == id);
                    if (itemInData) itemInData.favorito = newStatus;
                    document.dispatchEvent(new CustomEvent(`tabela${nomeCapitalizado}SortRequest`));
                 }
                 return;
            }
            
            if (target.classList.contains('btn-excluir')) {
                if (!can('perm_data_delete')) {
                    showToast("Sem permissão para excluir.", "error");
                    return;
                }
                const lojaId = await getMyLojaId(); 
                if (window.prepararExclusaoGenerica) window.prepararExclusaoGenerica({ id, nome, tabela, loja_id: lojaId, elemento: row });
                return; 
            }

            if (target.classList.contains('btn-editar')) {
                if (!can('perm_data_edit')) { showToast("Sem permissão.", "error"); return; }
                if(formEdit){
                    formEdit.querySelector(`input[name="id"]`).value = id;
                    
                    // Loop padrão para preencher inputs de texto e numero
                    for (const key in row.dataset) {
                       const input = formEdit.querySelector(`[name="${key}"]`);
                       if(input && key !== 'id') {
                            const num = parseFloat(row.dataset[key].replace('R$', '').replace(',', '.')) || 0; 
                            if (num === 0 && (key === 'largura' || key === 'atacado' || key === 'valor')) {
                                input.value = ''; 
                            } else if (key === 'largura') {
                                input.value = formatDecimal(row.dataset[key], 3); 
                            } else if (key === 'atacado' || key === 'valor') {
                                input.value = `R$ ${formatDecimal(row.dataset[key], 2)}`; 
                            } else {
                                input.value = row.dataset[key]; 
                            }
                       }
                    }
                    if (tabela === 'tecidos') {
                        const chkCortina = formEdit.querySelector('#edit-cat-cortina');
                        const chkForro = formEdit.querySelector('#edit-cat-forro');
                        const chkBlackout = formEdit.querySelector('#edit-cat-blackout');
                        if(chkCortina) chkCortina.checked = false;
                        if(chkForro) chkForro.checked = false;
                        if(chkBlackout) chkBlackout.checked = false;
                        const itemOriginal = dataArrays['tecidos'].find(i => i.id == id);
                        
                        if (itemOriginal && itemOriginal.categorias) {
                            if (itemOriginal.categorias.includes('cortina') && chkCortina) chkCortina.checked = true;
                            if (itemOriginal.categorias.includes('forro') && chkForro) chkForro.checked = true;
                            if (itemOriginal.categorias.includes('blackout') && chkBlackout) chkBlackout.checked = true;
                        }
                    }
                    if (tabela === 'confeccao') {
                        const isEspecial = row.dataset.altura_especial === 'true';
                        const chk = document.getElementById('edit-confeccao-altura-especial');
                        if (chk) chk.checked = isEspecial;
                    }
                }
                openModal(modalEdit);
                return; 
            }
        });
    }
}

function getFormData(form, tabela) {
    const formData = new FormData(form);
    const data = {};
    if (tabela === 'tecidos') {
        const categorias = [];
        if (form.querySelector('#add-cat-cortina')?.checked || form.querySelector('#edit-cat-cortina')?.checked) categorias.push('cortina');
        if (form.querySelector('#add-cat-forro')?.checked || form.querySelector('#edit-cat-forro')?.checked) categorias.push('forro');
        if (form.querySelector('#add-cat-blackout')?.checked || form.querySelector('#edit-cat-blackout')?.checked) categorias.push('blackout');
        
        data['categorias'] = categorias; 
    }

    formData.forEach((value, key) => {
        if (key.startsWith('cat_')) return;

        if (key === 'largura' || key === 'atacado' || key === 'valor') {
            const valorLimpo = String(value).replace('R$', '').trim();
            const valorNumerico = valorLimpo.replace(',', '.');
            data[key] = value === '' ? null : (parseFloat(valorNumerico) || 0);
        } else {
            data[key] = value;
        }
    });

    if (tabela === 'confeccao') {
        const chk = form.querySelector('input[name="altura_especial"]');
        if (chk) data['altura_especial'] = chk.checked;
    }
    return data;
}

async function handleSaveResponse(error, modalToClose, tabela, successMessage) {
    if (error) {
        console.error(`Erro ao salvar ${tabela}:`, error);
        let userMessage = `Erro ao salvar ${tabela}.`;
        if (error.message.includes('violates row-level security policy')) {
            userMessage += " Verifique suas permissões ou o status da sua assinatura.";
        } else if (error.message.includes('violates not-null constraint') && error.message.includes('loja_id')) {
            userMessage += " Erro interno: loja não identificada.";
        } else if (error.message.includes('duplicate key value violates unique constraint')) {
            userMessage += " Já existe um item com este nome/opção.";
        } else {
             userMessage += ` Detalhe: ${error.message}`;
        }
        showToast(userMessage, "error");
    } else {
        closeModal(modalToClose);
        showToast(successMessage);
        document.dispatchEvent(new CustomEvent('dadosBaseAlterados'));
    }
}

function setupPesquisa(tabela, chaveNome) {
    const nomeCapitalizado = tabela.charAt(0).toUpperCase() + tabela.slice(1);
    const input = elements[`inputPesquisa${nomeCapitalizado}`];
    const renderFunction = getRenderFunction(tabela);
    
    if (!input || !renderFunction) return;

    input.addEventListener('keyup', () => {
        const termo = input.value.trim().toLowerCase();
        const dadosFiltrados = (dataArrays[tabela] || []).filter(item =>
            item[chaveNome] && String(item[chaveNome]).toLowerCase().includes(termo)
        );
        renderFunction(dadosFiltrados); 
    });
}

function setupAmorim(tabelaBanco, idBtnAdd, idModalAdd, idFormAdd, idModalEdit, idFormEdit, idTbody) {
    const btnAdd = document.getElementById(idBtnAdd);
    const modalAdd = document.getElementById(idModalAdd);
    const formAdd = document.getElementById(idFormAdd);
    const modalEdit = document.getElementById(idModalEdit);
    const formEdit = document.getElementById(idFormEdit);
    const tbody = document.getElementById(idTbody);

    const render = () => {
        if(!tbody) return;
        const dados = dataArrays[tabelaBanco] || [];
        renderizarTabelaAmorimGen(dataArrays[tabelaBanco], idTbody);
    };

    render(); 
    document.addEventListener('dadosBaseAlterados', render);
    document.addEventListener('dadosBaseCarregados', render); 

    if (btnAdd) {
        btnAdd.addEventListener('click', () => { 
            if(formAdd) formAdd.reset(); 
            openModal(modalAdd); 
        });
    }
    
    if (modalAdd) {
        modalAdd.querySelectorAll('.btn-close-modal, .btn-cancelar').forEach(b => 
            b.addEventListener('click', () => closeModal(modalAdd))
        );
    }

    if (formAdd) {
        formAdd.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = formAdd.querySelector('[name=opcao]').value;
            const lojaId = await getMyLojaId();
            
            const { error } = await _supabase.from(tabelaBanco).insert({ loja_id: lojaId, opcao: nome });
            
            if(!error) { 
                closeModal(modalAdd); 
                showToast("Adicionado!"); 
                document.dispatchEvent(new CustomEvent('dadosBaseAlterados')); 
            } else {
                showToast("Erro ao salvar", "error");
            }
        });
    }

    if (modalEdit) {
        modalEdit.querySelectorAll('.btn-close-modal, .btn-cancelar').forEach(b => 
            b.addEventListener('click', () => closeModal(modalEdit))
        );
    }

    if (formEdit) {
        formEdit.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = formEdit.querySelector('[name=id]').value;
            const nome = formEdit.querySelector('[name=opcao]').value;
            const lojaId = await getMyLojaId();
            
            const { error } = await _supabase.from(tabelaBanco).update({ opcao: nome }).match({ id, loja_id: lojaId });
            
            if(!error) { 
                closeModal(modalEdit); 
                showToast("Atualizado!"); 
                document.dispatchEvent(new CustomEvent('dadosBaseAlterados')); 
            } else {
                showToast("Erro ao atualizar", "error");
            }
        });
    }

    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const target = e.target;
            const row = target.closest('tr');
            if(!row) return;
            const id = row.dataset.id;
            const nome = row.dataset.opcao;

            if (target.classList.contains('btn-editar')) {
                if(formEdit) {
                    formEdit.querySelector('[name=id]').value = id;
                    formEdit.querySelector('[name=opcao]').value = nome;
                    openModal(modalEdit);
                }
            }

           if (target.classList.contains('btn-excluir')) {
                const lojaId = await getMyLojaId();
                if (window.prepararExclusaoGenerica) {
                    window.prepararExclusaoGenerica({ 
                        id, 
                        nome, 
                        tabela: tabelaBanco, 
                        loja_id: lojaId, 
                        elemento: row 
                    });
                }
            }
        });
    }
}

export {
    initDataManager,
    renderizarTabelaFrete,
    renderizarTabelaInstalacao,
    renderizarTabelaTecidos,
    renderizarTabelaConfeccao,
    renderizarTabelaTrilho
};