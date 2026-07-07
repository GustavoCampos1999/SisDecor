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

    document.getElementById('btn-salvar-dias').addEventListener('click', async () => {
        const dias = document.getElementById('input-dias').value;
        if(acaoPendente && dias) {
            acaoPendente.valor = dias;
            await executarAcaoReal(acaoPendente);
        }
        document.getElementById('modal-editar-dias').style.display = 'none';
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

        perfisCache = perfis; 
        renderizarTabela(lojas, perfis);

    } catch (error) {
        alert(error.message);
    }
}

function renderizarTabela(lojas, perfis) {
    const tbody = document.getElementById('tbody-lojas');
    tbody.innerHTML = '';
    const agora = new Date();

    lojas.forEach(loja => {
        const dono = perfis.find(p => p.loja_id === loja.id && (p.role === 'admin' || !p.role)) || {};
        const nomeLoja = loja.nome || loja.nome_empresa || dono.nome_usuario || 'Loja sem nome';
        const emailDono = dono.email || 'Email não encontrado';

        const tr = document.createElement('tr');
        
        let dataFim;
        if (loja.status_assinatura === 'teste') dataFim = new Date(loja.data_fim_teste);
        else if (loja.status_assinatura === 'ativo') dataFim = new Date(loja.data_expiracao_assinatura);
        
        let diasRestantes = 0;
        if (dataFim) diasRestantes = Math.ceil((dataFim - agora) / (1000 * 60 * 60 * 24));

        let statusBadge = '';
        
        if (loja.status_assinatura === 'suspenso') statusBadge = '<span class="badge badge-suspenso">BLOQUEADO</span>';
        else if (dataFim && diasRestantes < 0) statusBadge = '<span class="badge badge-suspenso">VENCEU</span>';
        else if (loja.status_assinatura === 'teste') statusBadge = '<span class="badge badge-teste">TESTE</span>';
        else statusBadge = '<span class="badge badge-ativo">ATIVO</span>';

        const dataFormatada = dataFim ? dataFim.toLocaleDateString() : '-';
        const corDias = diasRestantes < 0 ? '#dc3545' : '#28a745';

        let btnStatusHtml = '';
        if (loja.status_assinatura === 'suspenso') {
            btnStatusHtml = `<button class="action-btn btn-desbloquear" data-id="${loja.id}" data-action="desbloquear">Desbloquear</button>`;
        } else {
            btnStatusHtml = `<button class="action-btn btn-bloquear" data-id="${loja.id}" data-action="bloquear">Bloq</button>`;
        }

        tr.innerHTML = `
            <td><strong>${nomeLoja}</strong><br><span class="info-text">ID: ${loja.id}</span></td>
            <td>${emailDono}</td>
            <td>${loja.cnpj || '---'}</td>
            <td>${statusBadge}</td>
            <td>
                ${dataFormatada} 
                <button class="action-btn btn-edit-dias" data-id="${loja.id}" data-action="editar-dias" title="Editar validade">✎</button>
                <br>
                <small style="color:${corDias}">${dataFim ? diasRestantes + ' dias' : ''}</small>
            </td>
            <td>
                <div class="actions-group">
                    <button class="action-btn btn-ativar" data-id="${loja.id}" data-action="ativar">Ativar</button>
                    ${btnStatusHtml}
                </div>
            </td>
        `;
        
        tr.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                prepararAcao(e.target.dataset.id, e.target.dataset.action);
            });
        });

        tr.addEventListener('click', () => abrirModalFuncionarios(loja.id, nomeLoja));
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

    if (tipo === 'ativar') {
        titulo.textContent = "Ativar Loja";
        titulo.style.color = "#28a745";
        texto.innerHTML = "Isso liberará o acesso por <strong>30 dias</strong> a partir de hoje.<br>Confirmar pagamento?";
        btn.textContent = "Ativar";
        btn.className = "action-btn btn-ativar";
        modalConfirm.style.display = 'flex';
    } 
    else if (tipo === 'bloquear') {
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
    else if (tipo === 'editar-dias') {
        document.getElementById('input-dias').value = "";
        document.getElementById('modal-editar-dias').style.display = 'flex';
    }
}

async function executarAcaoReal(dados) {
    const { id, tipo, valor } = dados;
    let updateData = {};

    if (tipo === 'ativar') {
        let hoje = new Date();
        hoje.setDate(hoje.getDate() + 30);
        updateData = { status_assinatura: 'ativo', data_expiracao_assinatura: hoje.toISOString() };
    }
    else if (tipo === 'bloquear') {
        updateData = { status_assinatura: 'suspenso' };
    }
    else if (tipo === 'desbloquear') {
        const { data: loja } = await _supabase.from('lojas').select('*').eq('id', id).single();
        let novoStatus = 'ativo';
        if (!loja.data_expiracao_assinatura && loja.data_fim_teste) novoStatus = 'teste';
        updateData = { status_assinatura: novoStatus };
    }
    else if (tipo === 'editar-dias') {
        const diasStr = valor.trim();
        if(!diasStr) return;

        const { data: loja } = await _supabase.from('lojas').select('*').eq('id', id).single();
        
        let campoData = loja.status_assinatura === 'teste' ? 'data_fim_teste' : 'data_expiracao_assinatura';
        if (!loja[campoData]) campoData = 'data_expiracao_assinatura'; 

        let baseData = new Date(loja[campoData] || new Date());
        
        if (diasStr.startsWith('+') || diasStr.startsWith('-')) {
            baseData.setDate(baseData.getDate() + parseInt(diasStr));
        } else {
            baseData = new Date(); 
            baseData.setDate(baseData.getDate() + parseInt(diasStr));
        }

        updateData = { [campoData]: baseData.toISOString() };
        if (loja.status_assinatura !== 'suspenso') {
        }
    }

    const { error } = await _supabase.from('lojas').update(updateData).eq('id', id);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        carregarDados(); 
    }
}

window.abrirModalFuncionarios = (lojaId, nomeLoja) => {
    document.getElementById('modal-funcionarios').style.display = 'flex';
    document.querySelector('.modal-title').textContent = `Equipe: ${nomeLoja}`;
    const listaDiv = document.getElementById('lista-funcionarios');
    listaDiv.innerHTML = '';

    const funcionarios = perfisCache.filter(p => p.loja_id == lojaId);

    if (funcionarios.length === 0) {
        listaDiv.innerHTML = '<p style="text-align:center;color:#666">Nenhum funcionário encontrado.</p>';
        return;
    }

    funcionarios.forEach(f => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <div>
                <strong style="color:#fff">${f.nome_usuario || 'Sem nome'}</strong><br>
                <small style="color:#888">${f.email || 'Email oculto'}</small>
            </div>
            <span class="user-role">${f.role || 'Vendedor'}</span>
        `;
        listaDiv.appendChild(div);
    });
};