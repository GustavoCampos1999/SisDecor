import { _supabase } from '../supabaseClient.js';

let perfisCache = []; 
let acaoPendente = null;

initAdmin();

async function initAdmin() {
    const { data: { session } } = await _supabase.auth.getSession();
    if(!session) { window.location.href = '../Login/login.html'; return; }

    const { data: perfil, error } = await _supabase.from('perfis').select('is_super_admin').eq('user_id', session.user.id).single();
    
    if (error || !perfil || !perfil.is_super_admin) {
        document.body.innerHTML = "<h1 style='color:red;text-align:center;margin-top:50px;'>ACESSO NEGADO</h1>";
        return;
    }

    document.querySelectorAll('.btn-fechar-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            acaoPendente = null;
        });
    });

    document.getElementById('btn-confirm-acao').addEventListener('click', async () => {
        if (acaoPendente) await executarAcaoReal(acaoPendente);
        document.getElementById('modal-confirmacao').style.display = 'none';
    });

    // Nova Lógica de Criação de Loja
    document.getElementById('btn-nova-loja').addEventListener('click', () => {
        document.getElementById('novo-nome').value = '';
        document.getElementById('novo-cnpj').value = '';
        document.getElementById('novo-email').value = '';
        document.getElementById('modal-nova-loja').style.display = 'flex';
    });

    document.getElementById('btn-salvar-nova-loja').addEventListener('click', async () => {
        const nome = document.getElementById('novo-nome').value;
        const nomeDono = document.getElementById('novo-dono').value;
        const cnpj = document.getElementById('novo-cnpj').value;
        const telefone = document.getElementById('novo-telefone').value;
        const email = document.getElementById('novo-email').value;

        if (!nome || !email || !nomeDono) {
            alert('Nome da Empresa, Nome do Proprietário e E-mail são obrigatórios!');
            return;
        }

        const btn = document.getElementById('btn-salvar-nova-loja');
        btn.disabled = true;
        btn.textContent = 'Criando...';

        try {
            let baseUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
                ? 'http://localhost:3000' 
                : 'https://painel-de-controle-gcv.onrender.com';

            const response = await fetch(`${baseUrl}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome_empresa: nome, nome_dono: nomeDono, cnpj: cnpj, telefone: telefone, email: email })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.erro || 'Erro ao criar loja');

            alert('Loja criada com sucesso! O cliente já pode logar colocando o e-mail (a senha ficará vazia para ele definir).');
            document.getElementById('modal-nova-loja').style.display = 'none';
            carregarDados(); 

        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Criar Loja';
        }
    });

    carregarDados();
}

async function carregarDados() {
    try {
        const { data: lojas, error: errLojas } = await _supabase
            .from('lojas')
            .select('*')
            .order('created_at', {ascending: false});

        const { data: perfis, error: errPerfis } = await _supabase
            .from('perfis')
            .select('*');

        if(errLojas || errPerfis) throw new Error("Erro ao buscar dados.");
        
        // Buscar e-mails do backend
        let baseUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : 'https://painel-de-controle-gcv.onrender.com';
        
        try {
            const resp = await fetch(`${baseUrl}/admin/users`);
            if (resp.ok) {
                window.emailsMap = await resp.json();
            }
        } catch(e) {
            console.warn("Nao foi possivel buscar emails", e);
        }

        perfisCache = perfis; 
        renderizarTabela(lojas, perfis);

    } catch (error) {
        alert(error.message);
    }
}

function renderizarTabela(lojas, perfis) {
    const tbody = document.getElementById('tbody-lojas');
    tbody.innerHTML = '';

    lojas.forEach(loja => {
        const dono = perfis.find(p => p.loja_id === loja.id && (p.role === 'admin' || !p.role)) || {};
        const nomeLoja = loja.nome || loja.nome_empresa || dono.nome_usuario || 'Loja sem nome';
        // O email agora vem do mapa de e-mails buscado do backend
        const emailDono = window.emailsMap && window.emailsMap[loja.owner_user_id] ? window.emailsMap[loja.owner_user_id] : 'Email não encontrado';

        const tr = document.createElement('tr');
        
        let statusBadge = loja.status_assinatura === 'suspenso' 
            ? '<span class="badge badge-suspenso">BLOQUEADO</span>' 
            : '<span class="badge badge-ativo">ATIVO</span>';

        let btnStatusHtml = loja.status_assinatura === 'suspenso'
            ? `<button class="action-btn btn-desbloquear" data-id="${loja.id}" data-action="desbloquear">Desbloquear</button>`
            : `<button class="action-btn btn-bloquear" data-id="${loja.id}" data-action="bloquear">Bloquear</button>`;

        tr.innerHTML = `
            <td>${nomeLoja}</td>
            <td>${emailDono}</td>
            <td>${loja.cnpj || '-'}</td>
            <td>${statusBadge}</td>
            <td style="text-align: right; display: flex; gap: 5px; justify-content: flex-end;">
                ${btnStatusHtml}
                <button class="action-btn btn-funcionarios" data-id="${loja.id}">Ver Equipe</button>
                <button class="action-btn btn-excluir" data-id="${loja.id}" data-action="excluir">Apagar</button>
            </td>
        `;
        
        tr.addEventListener('click', () => {
            abrirModalEditarLoja(loja, dono, emailDono);
        });

        tr.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.classList.contains('btn-funcionarios')) {
                    abrirModalFuncionarios(btn.dataset.id, nomeLoja);
                } else {
                    prepararAcao(btn.dataset.id, btn.dataset.action);
                }
            });
        });

        tbody.appendChild(tr);
    });

    document.getElementById('loading').style.display = 'none';
    document.getElementById('tabela-lojas').style.display = 'table';
}

function prepararAcao(id, tipo) {
    acaoPendente = { id, tipo };
    
    const modalConfirm = document.getElementById('modal-confirmacao');
    const titulo = document.getElementById('modal-confirm-titulo');
    const texto = document.getElementById('modal-confirm-texto');
    const btn = document.getElementById('btn-confirm-acao');

    if (tipo === 'bloquear') {
        titulo.textContent = "Bloquear Acesso";
        titulo.style.color = "#dc3545";
        texto.innerHTML = "O usuário não conseguirá mais fazer login.<br>Deseja continuar?";
        btn.textContent = "Bloquear";
        btn.className = "action-btn btn-bloquear";
        modalConfirm.style.display = 'flex';
    }
    else if (tipo === 'desbloquear') {
        titulo.textContent = "Desbloquear";
        titulo.style.color = "#ffc107";
        texto.innerHTML = "O acesso será restaurado.";
        btn.textContent = "Desbloquear";
        btn.className = "action-btn btn-desbloquear";
        modalConfirm.style.display = 'flex';
    }
    else if (tipo === 'excluir') {
        titulo.textContent = "Excluir Loja";
        titulo.style.color = "#dc3545";
        texto.innerHTML = "Esta ação é irreversível e removerá todos os dados da loja.";
        btn.textContent = "Excluir";
        btn.className = "action-btn btn-excluir";
        modalConfirm.style.display = 'flex';
    }
}

async function executarAcaoReal(acao) {
    let baseUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://painel-de-controle-gcv.onrender.com';

    try {
        const response = await fetch(`${baseUrl}/admin/loja/${acao.id}/acao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: acao.tipo })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro || 'Erro ao executar ação');
        
        if (acao.tipo === 'excluir') alert('Loja excluída!');
        carregarDados();
    } catch (e) {
        alert("Erro: " + e.message);
    }
}

window.abrirModalFuncionarios = (lojaId, nomeLoja) => {
    document.getElementById('modal-funcionarios').style.display = 'flex';
    document.querySelector('#modal-funcionarios .modal-title').textContent = `Equipe: ${nomeLoja}`;
    const listaDiv = document.getElementById('lista-funcionarios');
    listaDiv.innerHTML = '';

    const funcionarios = perfisCache.filter(p => p.loja_id == lojaId);
    if (funcionarios.length === 0) {
        listaDiv.innerHTML = '<p style="color:#888; text-align:center;">Nenhum funcionário encontrado.</p>';
        return;
    }

    funcionarios.forEach(f => {
        const div = document.createElement('div');
        div.className = 'user-item';
        
        const emailMembro = window.emailsMap && window.emailsMap[f.user_id] ? window.emailsMap[f.user_id] : 'Email oculto';
        
        div.innerHTML = `
            <div>
                <strong>${f.nome_usuario || 'Usuário Sem Nome'}</strong><br>
                <span class="info-text">${emailMembro}</span>
            </div>
            <span class="user-role">${f.role || 'Vendedor'}</span>
        `;
        listaDiv.appendChild(div);
    });
};

window.abrirModalEditarLoja = (loja, dono, emailDono) => {
    document.getElementById('modal-editar-loja').style.display = 'flex';
    const container = document.getElementById('dados-loja-container');
    
    const ownerName = dono.nome_usuario || 'Dono';
    const lojaName = loja.nome || loja.nome_empresa || ownerName;
    const cpfCnpj = loja.cnpj || 'Não informado';
    const telefone = loja.telefone || 'Não informado';
    
    container.innerHTML = `
        <div class="edit-row">
            <div>
                <span class="edit-label">Nome da Empresa/Loja</span>
                <span class="edit-value" id="val-nome_empresa">${lojaName}</span>
                <input type="text" id="inp-nome_empresa" class="edit-input" value="${lojaName}">
            </div>
            <button class="btn-edit-field" onclick="toggleEdit('nome_empresa', '${loja.id}', '${loja.owner_user_id}')">✏️</button>
        </div>
        <div class="edit-row">
            <div>
                <span class="edit-label">Nome do Proprietário</span>
                <span class="edit-value" id="val-nome_dono">${ownerName}</span>
                <input type="text" id="inp-nome_dono" class="edit-input" value="${ownerName}">
            </div>
            <button class="btn-edit-field" onclick="toggleEdit('nome_dono', '${loja.id}', '${loja.owner_user_id}')">✏️</button>
        </div>
        <div class="edit-row">
            <div>
                <span class="edit-label">E-mail de Login</span>
                <span class="edit-value" id="val-email">${emailDono}</span>
                <input type="email" id="inp-email" class="edit-input" value="${emailDono}">
            </div>
            <button class="btn-edit-field" onclick="toggleEdit('email', '${loja.id}', '${loja.owner_user_id}')">✏️</button>
        </div>
        <div class="edit-row">
            <div>
                <span class="edit-label">CPF / CNPJ</span>
                <span class="edit-value" id="val-cnpj">${cpfCnpj}</span>
                <input type="text" id="inp-cnpj" class="edit-input" value="${cpfCnpj}">
            </div>
            <button class="btn-edit-field" onclick="toggleEdit('cnpj', '${loja.id}', '${loja.owner_user_id}')">✏️</button>
        </div>
        <div class="edit-row" style="border-bottom:none;">
            <div>
                <span class="edit-label">Telefone / WhatsApp</span>
                <span class="edit-value" id="val-telefone">${telefone}</span>
                <input type="text" id="inp-telefone" class="edit-input" value="${telefone}">
            </div>
            <button class="btn-edit-field" onclick="toggleEdit('telefone', '${loja.id}', '${loja.owner_user_id}')">✏️</button>
        </div>
    `;
};

window.toggleEdit = async (field, lojaId, ownerUserId) => {
    const valSpan = document.getElementById(`val-${field}`);
    const inputField = document.getElementById(`inp-${field}`);
    const isEditing = inputField.style.display === 'inline-block';
    
    if (!isEditing) {
        valSpan.style.display = 'none';
        inputField.style.display = 'inline-block';
        inputField.focus();
    } else {
        const newValue = inputField.value;
        if (!newValue) {
            alert('O campo não pode ficar vazio!');
            return;
        }

        const baseUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : 'https://painel-de-controle-gcv.onrender.com';

        try {
            const resp = await fetch(`${baseUrl}/admin/loja/${lojaId}/editar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, value: newValue, userId: ownerUserId })
            });

            if (!resp.ok) {
                const data = await resp.json();
                throw new Error(data.erro || 'Erro ao editar.');
            }

            valSpan.textContent = newValue;
            valSpan.style.display = 'inline-block';
            inputField.style.display = 'none';
            carregarDados(); // Atualiza a tabela por trás

        } catch(e) {
            alert(e.message);
        }
    }
};