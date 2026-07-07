import { _supabase } from '../supabaseClient.js';

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
            const { data: perfil, error } = await _supabase
                .from('perfis')
                .select('nome_usuario, is_super_admin, loja_id, lojas ( status_assinatura, data_fim_teste, data_expiracao_assinatura )') 
                .eq('user_id', session.user.id) 
                .single();

            if (error) throw error;
            
            if (!perfil.is_super_admin) {
                const loja = perfil.lojas;
                
                if (loja) {
                    const agora = new Date();
                    let bloqueado = false;
                    let motivo = "";
                    let dataAlvo = null;
                    let textoStatus = "";

                    if (loja.status_assinatura === 'suspenso') {
                        bloqueado = true;
                        motivo = "Acesso suspenso pelo administrador.";
                        textoStatus = "Suspenso";
                    }
                    else if (loja.status_assinatura === 'teste') {
                        const fimTeste = new Date(loja.data_fim_teste);
                        dataAlvo = fimTeste;
                        
                        if (agora > fimTeste) {
                            bloqueado = true;
                            motivo = "Seu período de teste de 7 dias acabou.";
                        } else {
                            textoStatus = "Teste Grátis";
                        }
                    }
                    else if (loja.status_assinatura === 'ativo') {
                        const fimAssinatura = new Date(loja.data_expiracao_assinatura);
                        dataAlvo = fimAssinatura;

                        if (agora > fimAssinatura) {
                            bloqueado = true;
                            motivo = "Sua assinatura expirou. Renove para continuar.";
                        } else {
                            textoStatus = "Assinatura Ativa";
                        }
                    }

                    if (bloqueado && !isLogin) {
                        alert(`ACESSO BLOQUEADO\n\n${motivo}\n\nEntre em contato para regularizar.`);
                        await _supabase.auth.signOut();
                        window.location.href = 'Login/login.html';
                        return;
                    }

                    const timerElement = document.getElementById('subscription-timer');
                    if (timerElement && dataAlvo && !bloqueado) {
                        const diffTime = Math.abs(dataAlvo - agora);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                        
                        if (diffDays <= 3) {
                            timerElement.style.color = "#dc3545"; 
                        }

                        if(loja.status_assinatura === 'teste') {
                             timerElement.textContent = `Teste: Restam ${diffDays} dias`;
                        } else {
                             timerElement.textContent = `Assinatura: Restam ${diffDays} dias`;
                        }
                    } else if (timerElement && textoStatus) {
                        timerElement.textContent = textoStatus;
                    }
                }
            }

            const userElement = document.getElementById('user-email');
            if (userElement) {
                if (perfil && perfil.nome_usuario) {
                    userElement.textContent = `Logado como: ${perfil.nome_usuario}`;
                } else {
                    userElement.textContent = `Logado como: ${session.user.email}`;
                }
            }

        } catch (error) {
            console.warn("Erro ao verificar sessão:", error.message);
        }
    }
}

export function setupLogoutButton() {
    const btnLogout = document.getElementById('btn-logout');
    if (!btnLogout) return;

    btnLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        btnLogout.disabled = true;
        btnLogout.textContent = 'Saindo...';

        await _supabase.auth.signOut();
        localStorage.clear(); 
        window.location.href = './Login/login.html';
    });
}