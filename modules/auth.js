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
                    if (loja.status_assinatura === 'suspenso') {
                        if (!isLogin) {
                            alert(`ACESSO BLOQUEADO\n\nAcesso suspenso pelo administrador.\n\nEntre em contato para regularizar.`);
                            await _supabase.auth.signOut();
                            window.location.href = 'Login/login.html';
                            return;
                        }
                    }
                    
                    // Remove o timer se ele ainda existir no HTML
                    const timerElement = document.getElementById('subscription-timer');
                    if (timerElement) {
                        timerElement.style.display = 'none';
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

            // Exibir botão de Acesso Admin de forma segura (só existe se for super admin)
            const adminContainer = document.getElementById('admin-link-container');
            if (adminContainer && perfil.is_super_admin) {
                adminContainer.innerHTML = `<a href="admin/index.html" style="background-color: #931011; color: white; padding: 5px 12px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 0.9em; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">Painel Super Admin</a>`;
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