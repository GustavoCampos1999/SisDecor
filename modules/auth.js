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
                            const modalBloqueado = document.getElementById('modal-bloqueado');
                            const btnSairBloqueado = document.getElementById('btn-sair-bloqueado');
                            if (modalBloqueado) {
                                modalBloqueado.style.display = 'flex';
                                if (btnSairBloqueado) {
                                    btnSairBloqueado.onclick = async () => {
                                        await _supabase.auth.signOut();
                                        window.location.href = 'Login/login.html';
                                    };
                                }
                            } else {
                                // Fallback
                                alert(`ACESSO BLOQUEADO\n\nAcesso suspenso pelo administrador.\n\nEntre em contato para regularizar.`);
                                await _supabase.auth.signOut();
                                window.location.href = 'Login/login.html';
                            }
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
        
        const modalHtml = `
            <div id="modal-logout-confirm" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 10000; font-family: sans-serif;">
                <div style="background: #1e1e1e; padding: 25px; border-radius: 8px; width: 350px; max-width: 90%; text-align: center; color: white; border: 1px solid #444; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                    <h3 style="margin-top: 0; color: #e06c6e; font-size: 18px;">Sair do Sistema</h3>
                    <p style="color: #ccc; font-size: 14px; margin-bottom: 25px;">Deseja manter sua conta salva para entrar rapidamente na próxima vez?</p>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button id="btn-logout-manter" class="btn-modal-primary">Sim, manter salva</button>
                        <button id="btn-logout-remover" class="btn-modal-danger">Não, remover e sair</button>
                        <button id="btn-logout-cancelar" class="btn-modal-secondary">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('modal-logout-confirm');
        
        const performLogout = async (keepSaved) => {
            modal.querySelector('div > div').innerHTML = '<p style="color: #fff; font-weight: bold;">Saindo...</p>';
            
            try {
                await _supabase.auth.signOut();
            } catch(e) {
                console.warn(e);
            }
            
            const theme = localStorage.getItem('theme');
            
            if (keepSaved) {
                const saved = localStorage.getItem('sisdecor_saved_accounts');
                localStorage.clear();
                if (saved) localStorage.setItem('sisdecor_saved_accounts', saved);
            } else {
                localStorage.clear();
            }
            
            if (theme) localStorage.setItem('theme', theme);
            
            window.location.href = './Login/login.html';
        };

        document.getElementById('btn-logout-manter').onclick = () => performLogout(true);
        document.getElementById('btn-logout-remover').onclick = () => performLogout(false);
        document.getElementById('btn-logout-cancelar').onclick = () => modal.remove();
    });
}