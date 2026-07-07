import { _supabase } from '../supabaseClient.js';
import { showToast, openModal, closeModal } from './ui.js';

const BACKEND_API_URL = 'https://painel-de-controle-gcv.onrender.com'; 

let elements = {};
let membroParaExcluir = null;
let membroEmEdicao = null; 

export function initTeamManager(domElements) {
    elements = domElements;
    elements.btnSubtabMembros = document.getElementById('btn-subtab-membros');
    elements.btnSubtabCargos = document.getElementById('btn-subtab-cargos');
    elements.viewMembros = document.getElementById('view-equipe-membros');
    elements.viewCargos = document.getElementById('view-equipe-cargos');
    
    elements.modalRoleEditor = document.getElementById('modal-role-editor');
    elements.formRoleEditor = document.getElementById('form-role-editor');
    elements.btnAbrirModalAddCargo = document.getElementById('btn-abrir-modal-add-cargo');
    elements.btnCancelarRole = document.getElementById('btn-cancelar-role');
    if(elements.btnSubtabMembros) elements.btnSubtabMembros.addEventListener('click', () => switchSubTab('membros'));
    if(elements.btnSubtabCargos) elements.btnSubtabCargos.addEventListener('click', () => switchSubTab('cargos'));
    if (elements.btnAbrirModalAddMembro) {
        elements.btnAbrirModalAddMembro.addEventListener('click', async () => {
            membroEmEdicao = null; 
            elements.formAddMembro.reset();
            document.querySelector('#modal-add-membro h2').textContent = "Novo Usuário";
            const btnSubmit = elements.formAddMembro.querySelector('button[type="submit"]');
            if(btnSubmit) btnSubmit.textContent = "Criar Usuário";
            elements.formAddMembro.querySelector('input[name="email"]').disabled = false;
            elements.formAddMembro.querySelector('input[name="senha"]').required = true;
            elements.formAddMembro.querySelector('input[name="senha"]').placeholder = "Mínimo 6 caracteres";
        
            const selectRole = elements.formAddMembro.querySelector('select[name="role"]');
            if(selectRole) selectRole.disabled = false;

            await preencherSelectCargos();
            openModal(elements.modalAddMembro);
        });
    }
    if (elements.btnCancelarAddMembro) elements.btnCancelarAddMembro.addEventListener('click', () => closeModal(elements.modalAddMembro));
    if (elements.formAddMembro) elements.formAddMembro.addEventListener('submit', handleSaveMembro);
    if (elements.btnConfirmarExcluirMembro) elements.btnConfirmarExcluirMembro.addEventListener('click', handleExcluirMembro);
    if (elements.btnCancelarExcluirMembro) elements.btnCancelarExcluirMembro.addEventListener('click', () => closeModal(elements.modalExcluirMembro));
    if (elements.btnAbrirModalAddCargo) {
        elements.btnAbrirModalAddCargo.addEventListener('click', () => {
            elements.formRoleEditor.reset();
            document.getElementById('role-id').value = '';
            document.getElementById('modal-role-title').textContent = 'Criar Novo Cargo';
            elements.formRoleEditor.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false);
            openModal(elements.modalRoleEditor);
        });
    }
    if (elements.btnCancelarRole) elements.btnCancelarRole.addEventListener('click', () => closeModal(elements.modalRoleEditor));
    if (elements.formRoleEditor) elements.formRoleEditor.addEventListener('submit', handleSaveRole);
    checkAdminRole();
}

function switchSubTab(tab) {
    if (tab === 'membros') {
        elements.btnSubtabMembros.classList.add('active');
        elements.btnSubtabCargos.classList.remove('active');
        elements.viewMembros.style.display = 'block';
        elements.viewCargos.style.display = 'none';
        carregarEquipe();
    } else {
        elements.btnSubtabMembros.classList.remove('active');
        elements.btnSubtabCargos.classList.add('active');
        elements.viewMembros.style.display = 'none';
        elements.viewCargos.style.display = 'block';
        carregarCargos();
    }
}

async function checkAdminRole() {
    const btnTab = document.getElementById('btn-tab-equipe');
    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) return;
        const { data: perfil } = await _supabase.from('perfis').select('role').eq('user_id', user.id).single();
        if (perfil && perfil.role === 'admin') {
            if (btnTab) {
                btnTab.style.display = 'block';
                btnTab.addEventListener('click', () => switchSubTab('membros'));
            }
        }
    } catch (e) {}
}

async function carregarEquipe() {
    const tbody = document.getElementById('lista-equipe-body');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>';
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        const response = await fetch(`${BACKEND_API_URL}/api/team`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const equipe = await response.json();
        renderizarTabelaEquipe(equipe);
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro ao carregar.</td></tr>';
    }
}

function renderizarTabelaEquipe(lista) {
    const tbody = document.getElementById('lista-equipe-body');
    tbody.innerHTML = '';
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum membro.</td></tr>';
        return;
    }

    lista.forEach(membro => {
        const tr = document.createElement('tr');
        const roleDisplay = membro.role_custom_name || membro.role || 'Vendedor';
        
        let botoes = '';
        if (membro.role !== 'admin') {
            botoes += `<button class="btn-editar btn-edit-membro" style="margin-right:5px;">Editar</button>`;
            botoes += `<button class="btn-excluir btn-remove-membro">Remover</button>`;
        } else {
            botoes += `<button class="btn-editar btn-edit-membro" style="margin-right:5px;">Editar</button>`;
        }

        tr.innerHTML = `
            <td style="padding: 10px;">${membro.nome_usuario || 'Sem nome'}</td>
            <td style="padding: 10px;">${roleDisplay}</td>
            <td style="padding: 10px; text-align: center;">${botoes}</td>
        `;
        tbody.appendChild(tr);

        const btnEdit = tr.querySelector('.btn-edit-membro');
        if(btnEdit) btnEdit.addEventListener('click', () => abrirModalEditarMembro(membro));

        const btnDel = tr.querySelector('.btn-remove-membro');
        if(btnDel) btnDel.addEventListener('click', () => {
            membroParaExcluir = { id: membro.user_id, nome: membro.nome_usuario };
            document.getElementById('nome-membro-excluir').textContent = membroParaExcluir.nome;
            openModal(elements.modalExcluirMembro);
        });
    });
}

async function preencherSelectCargos() {
    const select = elements.formAddMembro.querySelector('select[name="role"]');
    select.innerHTML = '<option>Carregando...</option>';
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        const response = await fetch(`${BACKEND_API_URL}/api/roles`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const roles = await response.json();
        
        select.innerHTML = '';
        
        if (roles.length === 0) {
             select.innerHTML = '<option value="">Nenhum cargo criado</option>';
        }

        roles.forEach(role => {
            select.appendChild(new Option(role.nome, role.id));
        });
    } catch (e) {
        select.innerHTML = '<option value="">Erro ao carregar cargos</option>';
    }
}

async function abrirModalEditarMembro(membro) {
    membroEmEdicao = membro.user_id;
    document.querySelector('#modal-add-membro h2').textContent = "Editar Usuário";
    
    const btnSubmit = elements.formAddMembro.querySelector('button[type="submit"]');
    if(btnSubmit) btnSubmit.textContent = "Salvar Alterações";
    
    const form = elements.formAddMembro;
    form.reset();
    
    form.querySelector('input[name="nome"]').value = membro.nome_usuario;
    
    const inputEmail = form.querySelector('input[name="email"]');
    inputEmail.value = membro.email || ''; 
    inputEmail.disabled = false; 

    const inputSenha = form.querySelector('input[name="senha"]');
    inputSenha.required = false;
    inputSenha.placeholder = "Deixe em branco para manter a atual";

    await preencherSelectCargos();
    
    const selectRole = form.querySelector('select[name="role"]');
    
    if (membro.role === 'admin') {
        if (!selectRole.querySelector('option[value="admin"]')) {
            const optionAdmin = document.createElement('option');
            optionAdmin.value = 'admin';
            optionAdmin.textContent = 'Administrador (Dono)';
            selectRole.appendChild(optionAdmin);
        }
        selectRole.value = 'admin';
        selectRole.disabled = true; 
    } else {
        selectRole.disabled = false;
        const optAdmin = selectRole.querySelector('option[value="admin"]');
        if(optAdmin) optAdmin.remove();

        if (membro.role_id) {
            selectRole.value = membro.role_id;
        } else {
            selectRole.value = ''; 
        }
    }
    openModal(elements.modalAddMembro);
}

async function handleSaveMembro(e) {
    e.preventDefault();
    const btn = elements.formAddMembro.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Salvando...";
    
    const formData = new FormData(elements.formAddMembro);
    const dados = {
        nome: formData.get('nome'),
        email: formData.get('email'), 
        senha: formData.get('senha'),
        role_id: formData.get('role')
    };
    
    const selectRole = elements.formAddMembro.querySelector('select[name="role"]');
    if (selectRole.disabled && selectRole.value === 'admin') {
         dados.role_id = null; 
         delete dados.role_id;
    }

    try {
        const { data: { session } } = await _supabase.auth.getSession();
        let url = `${BACKEND_API_URL}/api/team/add`;
        let method = 'POST';

        if (membroEmEdicao) {
            url = `${BACKEND_API_URL}/api/team/${membroEmEdicao}`;
            method = 'PUT';
        }

        const response = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(dados)
        });

        if (!response.ok) throw new Error("Erro na operação");
        showToast(membroEmEdicao ? "Atualizado!" : "Criado!");
        closeModal(elements.modalAddMembro);
        carregarEquipe();
    } catch (error) {
        showToast("Erro ao salvar.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Salvar";
    }
}

async function handleExcluirMembro() {
    if (!membroParaExcluir) return;
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        await fetch(`${BACKEND_API_URL}/api/team/${membroParaExcluir.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        showToast("Removido.");
        closeModal(elements.modalExcluirMembro);
        carregarEquipe();
    } catch (error) { showToast("Erro ao remover.", "error"); }
}

async function carregarCargos() {
    const tbody = document.getElementById('lista-cargos-body');
    tbody.innerHTML = '<tr><td>Carregando...</td></tr>';
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        const response = await fetch(`${BACKEND_API_URL}/api/roles`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const roles = await response.json();
        renderizarTabelaCargos(roles);
    } catch (e) { console.error(e); }
}

function renderizarTabelaCargos(roles) {
    const tbody = document.getElementById('lista-cargos-body');
    tbody.innerHTML = '';
    if(roles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">Sem cargos.</td></tr>';
        return;
    }
    roles.forEach(role => {
        const permsCount = Object.values(role.permissions || {}).filter(v => v === true).length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 10px;"><strong>${role.nome}</strong></td>
            <td style="padding: 10px;">${permsCount} permissões</td>
            <td style="padding: 10px; text-align: center;">
                <button class="btn-editar btn-edit-role">Editar</button>
                <button class="btn-excluir btn-delete-role" data-id="${role.id}">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
        tr.querySelector('.btn-edit-role').addEventListener('click', () => abrirModalEdicaoRole(role));
    });
    document.querySelectorAll('.btn-delete-role').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(confirm("Excluir cargo?")) await deleteRole(e.target.dataset.id);
        });
    });
}

function abrirModalEdicaoRole(role) {
    const form = elements.formRoleEditor;
    form.reset();
    document.getElementById('role-id').value = role.id;
    document.getElementById('role-nome').value = role.nome;
    document.getElementById('modal-role-title').textContent = `Editar: ${role.nome}`;
    const perms = role.permissions || {};
    for (const [key, value] of Object.entries(perms)) {
        const chk = document.getElementById(key);
        if(chk) chk.checked = value;
    }
    openModal(elements.modalRoleEditor);
}

async function handleSaveRole(e) {
    e.preventDefault();
    const formData = new FormData(elements.formRoleEditor);
    const permissions = {};
    elements.formRoleEditor.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        permissions[chk.id] = chk.checked;
    });
    const dados = { id: formData.get('id') || null, nome: formData.get('nome'), permissions };
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        await fetch(`${BACKEND_API_URL}/api/roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify(dados)
        });
        showToast("Salvo!");
        closeModal(elements.modalRoleEditor);
        carregarCargos();
    } catch (error) { showToast("Erro.", "error"); }
}

async function deleteRole(id) {
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        await fetch(`${BACKEND_API_URL}/api/roles/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        carregarCargos();
    } catch (e) { showToast("Erro.", "error"); }
}
