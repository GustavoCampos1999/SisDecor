import { _supabase } from '../supabaseClient.js';

const BACKEND_API_URL = 'https://painel-de-controle-gcv.onrender.com';
let currentPermissions = {};
let isAdmin = false;

export async function loadPermissions() {
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`${BACKEND_API_URL}/api/me/permissions`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.isAdmin) {
                isAdmin = true;
                currentPermissions = {}; 
            } else {
                isAdmin = false;
                currentPermissions = data;
            }
            applyPermissionsUI(); 
        }
    } catch (e) {
        console.error("Erro loading permissions:", e);
    }
}

export function can(permissionKey) {
    if (isAdmin) return true;
    return currentPermissions[permissionKey] === true;
}

export function applyPermissionsUI() {
    const map = {
        'perm_clientes_add': '#btn-abrir-modal-add',
        'perm_clientes_delete': '.btn-excluir-cliente, #btn-confirmar-excluir-cliente, #lista-clientes .btn-excluir', 
        'perm_clientes_edit': '.btn-editar-cliente, #lista-clientes .btn-editar',
        'perm_calc_save': '#btn-manual-save, #btn-salvar-e-sair, #save-status-wrapper button.btn-manual-save', 
        'perm_calc_config': '#btn-abrir-config-calculadora, .btn-abrir-config-calculadora',
        'perm_calc_taxas': '#btn-config-taxas',
        'perm_data_view': '.tab-button[data-tab="tab-gerenciar-dados"]', 
        'perm_data_add': '#btn-abrir-modal-add-tecido, #btn-abrir-modal-add-confeccao, #btn-abrir-modal-add-trilho, #btn-abrir-modal-add-frete, #btn-abrir-modal-add-instalacao, .gerenciar-dados-secao .btn-adicionar', 
        'perm_team_manage': '#btn-tab-equipe'
    };

    for (const [perm, selector] of Object.entries(map)) {
        const elements = document.querySelectorAll(selector);
        if (!can(perm)) {
            elements.forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });
        } else {
            elements.forEach(el => {
                el.style.display = ''; 
            });
        }
    }

    if (!can('perm_data_view')) {
        const abaDados = document.querySelector('.tab-button[data-tab="tab-gerenciar-dados"]');
        if(abaDados) {
            abaDados.style.display = 'none';
            if (abaDados.classList.contains('active')) {
                document.querySelector('.tab-button[data-tab="tab-clientes"]').click();
            }
        }
    }
    
    let styleId = 'dynamic-permissions-style';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
    }

    let cssRules = '';
    if (!can('perm_data_edit')) {
        cssRules += `#tab-gerenciar-dados .btn-editar { display: none !important; } \n`;
    }
    if (!can('perm_data_delete')) {
        cssRules += `#tab-gerenciar-dados .btn-excluir { display: none !important; } \n`;
    }

    styleTag.textContent = cssRules;
}