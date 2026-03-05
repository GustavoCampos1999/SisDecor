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
        const { data: lojas, error: errLojas } = await _supabase.from('lojas').select('*').order('created_at', {ascending: false});
        const { data: perfis, error: errPerfis } = await _supabase.from('perfis').select('*');

        if(errLojas || errPerfis) throw new Error("Erro ao carregar dados do banco.");

        perfisCache = perfis; 
        renderizarTabela(lojas, perfis);
    } catch (error) {
        console.error(error);
        alert("Erro técnico: " + error.message);
    }
}

function renderizarTabela(lojas, perfis) {
    const tbody = document.getElementById('tbody-lojas');
    tbody.innerHTML = '';
    const agora = new Date();

    lojas.forEach(loja => {
        const dono = perfis.find(p => p.loja_id == loja.id && (p.role === 'admin' || !p.role)) || {};
        const nomeLoja = loja.nome || loja.nome_empresa || dono.nome_usuario || 'Loja sem nome';
        const emailDono = dono.email || dono.email_usuario || 'Email não encontrado'; 

        let dataFim;
        if (loja.status_assinatura === 'teste') dataFim = new Date(loja.data_fim_teste);
        else if (loja.status_assinatura === 'ativo') dataFim = new Date(loja.data_expiracao_assinatura);
        
        const diasRestantes = dataFim ? Math.ceil((dataFim - agora) / (1000 * 60 * 60 * 24)) : 0;
        const estaVencido = dataFim && diasRestantes < 0;

        let statusBadge = '';
        if (loja.status_assinatura === 'suspenso') statusBadge = '<span class="badge badge-suspenso">Bloqueado</span>';
        else if (estaVencido) statusBadge = '<span class="badge badge-suspenso">Vencido</span>';
        else if (loja.status_assinatura === 'teste') statusBadge = '<span class="badge badge-teste">Período Teste</span>';
        else statusBadge = '<span class="badge badge-ativo">Assinatura Ativa</span>';

        let botaoPrincipalHtml = '';
        if (loja.status_assinatura === 'suspenso') {
            botaoPrincipalHtml = `<button class="action-btn btn-desbloquear" data-id="${loja.id}" data-action="desbloquear">🔓 Desbloquear</button>`;
        } else {
            const label = estaVencido ? "Ativar Plano" : "Renovar +30d";
            botaoPrincipalHtml = `<button class="action-btn btn-ativar" data-id="${loja.id}" data-action="ativar">⚡ ${label}</button>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${nomeLoja}</strong><br><span class="info-text">ID: ${loja.id}</span></td>
            <td>${emailDono}</td>
            <td><code style="color:#aaa">${loja.cnpj || '---'}</code></td>
            <td>${statusBadge}</td>
            <td>
                <span style="font-weight:500">${dataFim ? dataFim.toLocaleDateString() : '-'}</span><br>
                <small style="color:${estaVencido ? '#e06c6e' : '#28a745'}">${dataFim ? diasRestantes + ' dias' : 'Sem validade'}</small>
            </td>
            <td>
                <div class="actions-group">
                    ${botaoPrincipalHtml}
                    <div class="dropdown">
                        <button class="btn-more">⋮</button>
                        <div class="dropdown-content">
                            <a href="#" class="action-btn-link" data-id="${loja.id}" data-action="editar-dias">📅 Ajustar Validade</a>
                            ${loja.status_assinatura !== 'suspenso' ? 
                                `<a href="#" class="action-btn-link danger" data-id="${loja.id}" data-action="bloquear">🚫 Bloquear Loja</a>` : ''}
                        </div>
                    </div>
                </div>
            </td>
        `;
        
        tr.querySelectorAll('[data-action]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); 
                prepararAcao(el.dataset.id, el.dataset.action);
            });
        });

        tr.addEventListener('click', () => abrirModalFuncionarios(loja.id, nomeLoja));
        tbody.appendChild(tr);
    });

    document.getElementById('loading').style.display = 'none';
    document.getElementById('tabela-lojas').style.display = 'table';
}

window.abrirModalFuncionarios = (lojaId, nomeLoja) => {
    document.getElementById('modal-funcionarios').style.display = 'flex';
    const listaDiv = document.getElementById('lista-funcionarios');
    listaDiv.innerHTML = '';

    const funcionarios = perfisCache.filter(p => p.loja_id == lojaId);
    const dono = funcionarios.find(p => p.role === 'admin' || !p.role) || {};
    const tel = dono.telefone || dono.whatsapp || 'Não informado';

    document.querySelector('.modal-title').innerHTML = `
        ${nomeLoja}<br>
        <span style="font-size:13px; color:#888; font-weight:normal">📞 Contato: ${tel}</span>
    `;

    if (funcionarios.length === 0) {
        listaDiv.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">Nenhum usuário vinculado.</p>';
        return;
    }

    funcionarios.forEach(f => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <div>
                <strong>${f.nome_usuario || 'Usuário'}</strong><br>
                <small style="color:#777">${f.email || f.email_usuario || 'E-mail privado'}</small>
            </div>
            <span class="user-role">${f.role || 'Vendedor'}</span>
        `;
        listaDiv.appendChild(div);
    });
};

function prepararAcao(id, tipo) {
    acaoPendente = { id, tipo };
    const modalConfirm = document.getElementById('modal-confirmacao');
    const titulo = document.getElementById('modal-confirm-titulo');
    const texto = document.getElementById('modal-confirm-texto');
    const btn = document.getElementById('btn-confirm-acao');

    if (tipo === 'editar-dias') {
        document.getElementById('input-dias').value = "";
        document.getElementById('modal-editar-dias').style.display = 'flex';
        return;
    }

    if (tipo === 'ativar') {
        titulo.textContent = "Renovar Assinatura";
        titulo.style.color = "#28a745";
        texto.innerHTML = "Deseja adicionar <strong>30 dias</strong> de acesso para esta loja?";
        btn.textContent = "Confirmar Renovação";
        btn.className = "action-btn btn-ativar";
    } else if (tipo === 'bloquear') {
        titulo.textContent = "Bloquear Loja";
        titulo.style.color = "#e06c6e";
        texto.innerHTML = "O acesso será interrompido imediatamente. Continuar?";
        btn.textContent = "Bloquear Agora";
        btn.className = "action-btn btn-bloquear";
        btn.style.background = "#dc3545";
    } else if (tipo === 'desbloquear') {
        titulo.textContent = "Restaurar Acesso";
        titulo.style.color = "#ffc107";
        texto.innerHTML = "A loja voltará a ter acesso ao sistema.";
        btn.textContent = "Desbloquear";
        btn.className = "action-btn btn-desbloquear";
    }

    modalConfirm.style.display = 'flex';
}

async function executarAcaoReal(dados) {
    const { id, tipo, valor } = dados;
    let updateData = {};

    try {
        if (tipo === 'ativar') {
            const { data: loja } = await _supabase.from('lojas').select('*').eq('id', id).single();
            let base = new Date();
            if (loja.data_expiracao_assinatura && new Date(loja.data_expiracao_assinatura) > base) {
                base = new Date(loja.data_expiracao_assinatura);
            }
            base.setDate(base.getDate() + 30);
            updateData = { status_assinatura: 'ativo', data_expiracao_assinatura: base.toISOString() };
        }
        else if (tipo === 'bloquear') {
            updateData = { status_assinatura: 'suspenso' };
        }
        else if (tipo === 'desbloquear') {
            updateData = { status_assinatura: 'ativo' };
        }
        else if (tipo === 'editar-dias') {
            const diasStr = valor.trim();
            const { data: loja } = await _supabase.from('lojas').select('*').eq('id', id).single();
            let dataAlvo = new Date(loja.data_expiracao_assinatura || new Date());
            
            if (diasStr.startsWith('+') || diasStr.startsWith('-')) {
                dataAlvo.setDate(dataAlvo.getDate() + parseInt(diasStr));
            } else {
                dataAlvo = new Date();
                dataAlvo.setDate(dataAlvo.getDate() + parseInt(diasStr));
            }
            updateData = { data_expiracao_assinatura: dataAlvo.toISOString(), status_assinatura: 'ativo' };
        }

        const { error } = await _supabase.from('lojas').update(updateData).eq('id', id);
        if (error) throw error;
        
        carregarDados(); 
    } catch (err) {
        alert("Erro na operação: " + err.message);
    }
}