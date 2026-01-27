import { _supabase } from '../supabaseClient.js';
import { openModal, closeModal } from './ui.js';

export async function checkUserSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    const path = window.location.pathname;
    const isLogin = path.endsWith('login.html') || path.endsWith('Login/');

    if (!session && !isLogin) {
        window.location.href = 'Login/login.html';
        return;
    }
    if (session) {
        try {
            const { data: perfil, error: perfilError } = await _supabase
                .from('perfis')
                .select('nome_usuario, is_super_admin, loja_id') 
                .eq('user_id', session.user.id)
                .order('id', { ascending: false })
                .limit(1) 
                .maybeSingle(); 

            console.log("Perfil vindo do banco:", perfil);

            if (perfilError) throw perfilError;
            if (!perfil) {
                console.warn("Usuário logado sem perfil na tabela.");
                return;
            }

            const userElement = document.getElementById('user-email');
            if (userElement) userElement.textContent = `Olá, ${perfil.nome_usuario || 'Usuário'}`;

            if (!perfil.is_super_admin && perfil.loja_id) {
                const { data: loja, error: lojaError } = await _supabase
                    .from('lojas')
                    .select('id, nome, status_assinatura, data_fim_teste, data_expiracao_assinatura')
                    .eq('id', perfil.loja_id)
                    .single();

                if (!lojaError && loja) {
                    processarStatusAssinatura(loja, isLogin);
                }
            }

        } catch (error) {
            console.warn("Erro ao verificar sessão/assinatura:", error.message);
        }
    }
}

function processarStatusAssinatura(loja, isLoginPage) {
    const agora = new Date();
    let diasRestantes = 0;
    let planoExpirado = false;
    let textoBotao = "Assine";
    let classeBotao = ""; 
    let textoStatus = "";
    
    if (loja.status_assinatura === 'trialing' || loja.status_assinatura === 'teste') {
        const dataFim = new Date(loja.data_fim_teste);
        const diffTime = dataFim - agora;
        diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diasRestantes <= 0) {
            planoExpirado = true;
            textoStatus = "Teste Expirado";
            textoBotao = "Assinar Agora";
            classeBotao = "btn-expirado"; 
        } else {
            textoStatus = `Teste: ${diasRestantes} dias`;
            textoBotao = "Assine Agora";
            classeBotao = "btn-teste"; 
        }
    } 
    else if (loja.status_assinatura === 'active' || loja.status_assinatura === 'ativo') {
        const dataFim = new Date(loja.data_expiracao_assinatura);
        const diffTime = dataFim - agora;
        diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diasRestantes <= 0) {
            planoExpirado = true;
            textoStatus = "Plano Vencido";
            textoBotao = "Renovar";
            classeBotao = "btn-expirado"; 
        } else {
            textoStatus = "Assinatura Ativa";
            textoBotao = "Meu Plano";
            classeBotao = "btn-ativo"; 
        }
    }
    else {
        planoExpirado = true;
        textoStatus = "Sem Acesso";
        textoBotao = "Regularizar";
        classeBotao = "btn-expirado";
    }

    const timerElement = document.getElementById('subscription-timer');
    if (timerElement) {
        timerElement.textContent = textoStatus;
        if (planoExpirado) timerElement.style.color = "#dc3545"; 
        else if (loja.status_assinatura.includes('activ')) timerElement.style.color = "#28a745"; 
        else timerElement.style.color = "#ffc107"; 
    }

    const btnAssinatura = document.getElementById('btn-subscription-status');
    if (btnAssinatura) {
        btnAssinatura.style.display = 'block';
        btnAssinatura.textContent = textoBotao;
        
        btnAssinatura.className = 'btn-assinatura-header ' + classeBotao;
        
        const newBtn = btnAssinatura.cloneNode(true);
        btnAssinatura.parentNode.replaceChild(newBtn, btnAssinatura);
        
        newBtn.addEventListener('click', () => {
            if (textoBotao === "Meu Plano") {
                mostrarDetalhesPlano(loja);
            } else {
                openModal(document.getElementById('modal-pricing'));
            }
        });
    }

    if (planoExpirado && !isLoginPage) {
        openModal(document.getElementById('modal-pricing'));
        const closeBtn = document.querySelector('.btn-close-pricing');
        if (closeBtn) closeBtn.style.display = 'none';
        showToast(`Seu acesso expirou. Renove seu plano.`, "error");
    }
}

function mostrarDetalhesPlano(loja) {
    const modal = document.getElementById('modal-my-plan');
    const container = document.getElementById('my-plan-details');
    
    let dataFim = (loja.status_assinatura === 'teste' || loja.status_assinatura === 'trialing') 
        ? loja.data_fim_teste 
        : loja.data_expiracao_assinatura;
        
    const dataFormatada = dataFim ? new Date(dataFim).toLocaleDateString('pt-BR') : "Indefinido";
    
    container.innerHTML = `
        <h3 style="color: #28a745;">${loja.status_assinatura.toUpperCase()}</h3>
        <p><strong>Loja:</strong> ${loja.nome}</p>
        <p><strong>Vencimento:</strong> ${dataFormatada}</p>
        <div style="margin-top:20px; padding:10px; background:#f9f9f9; border-radius:5px; font-size:12px; color:#555;">
            Precisa alterar forma de pagamento ou cancelar?<br>
            Entre em contato com o suporte.
        </div>
    `;
    openModal(modal);
}

export function setupLogoutButton() {
    const btnLogout = document.getElementById('btn-logout');
    if (!btnLogout) return;

    btnLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        btnLogout.textContent = 'Saindo...';
        await _supabase.auth.signOut();
        localStorage.clear(); 
        window.location.href = './Login/login.html';
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-notification');
    if(toast) {
        toast.textContent = message;
        toast.className = `toast show`;
        toast.style.backgroundColor = type === 'error' ? '#dc3545' : '#28a745';
        setTimeout(() => toast.classList.remove('show'), 4000);
    } else {
        console.log("Toast:", message);
    }
}