import { _supabase } from '../supabaseClient.js';

const formLogin = document.getElementById('form-login');
const inputEmail = document.getElementById('email');
const inputSenha = document.getElementById('senha');
const msgErro = document.getElementById('mensagem-erro');

const savedAccountsContainer = document.getElementById('saved-accounts-container');
const savedAccountsList = document.getElementById('saved-accounts-list');
const btnOutraConta = document.getElementById('btn-outra-conta');
const chkSalvarConta = document.getElementById('chk-salvar-conta');

const btnVoltarSalvasContainer = document.getElementById('voltar-contas-salvas-container');
const btnVoltarSalvas = document.getElementById('btn-voltar-salvas');

function loadSavedAccounts() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    const saved = JSON.parse(localStorage.getItem('sisdecor_saved_accounts') || '[]');
    if (saved.length > 0 && savedAccountsContainer) {
        savedAccountsContainer.style.display = 'block';
        formLogin.style.display = 'none';
        if(btnVoltarSalvasContainer) btnVoltarSalvasContainer.style.display = 'none';
        
        savedAccountsList.innerHTML = '';
        saved.forEach(acc => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '8px';
            row.style.alignItems = 'center';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-saved-account';
            btn.textContent = acc.email;
            btn.onclick = () => {
                inputEmail.value = acc.email;
                inputSenha.value = atob(acc.hash);
                formLogin.dispatchEvent(new Event('submit'));
            };

            const btnRemove = document.createElement('button');
            btnRemove.type = 'button';
            btnRemove.className = 'btn-remove-account';
            btnRemove.textContent = '✖';
            btnRemove.title = 'Remover conta salva';
            btnRemove.onclick = () => {
                const modalHtml = `
                    <div id="modal-remove-account" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;">
                        <div style="background: #1e1e1e; padding: 25px; border-radius: 8px; width: 350px; max-width: 90%; text-align: center; color: white; border: 1px solid #444; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                            <h3 style="margin-top: 0; color: #e06c6e; font-size: 18px;">Remover Conta</h3>
                            <p style="color: #ccc; font-size: 14px; margin-bottom: 25px;">Deseja remover a conta de <strong>${acc.email}</strong> dos acessos salvos neste dispositivo?</p>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <button id="btn-modal-remover" class="btn-modal-danger">Sim, remover conta</button>
                                <button id="btn-modal-cancelar" class="btn-modal-secondary">Cancelar</button>
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                const modal = document.getElementById('modal-remove-account');

                document.getElementById('btn-modal-remover').onclick = () => {
                    const newSaved = saved.filter(s => s.email !== acc.email);
                    localStorage.setItem('sisdecor_saved_accounts', JSON.stringify(newSaved));
                    modal.remove();
                    loadSavedAccounts();
                };

                document.getElementById('btn-modal-cancelar').onclick = () => {
                    modal.remove();
                };
            };

            row.appendChild(btn);
            row.appendChild(btnRemove);
            savedAccountsList.appendChild(row);
        });
    } else if (savedAccountsContainer) {
        savedAccountsContainer.style.display = 'none';
        formLogin.style.display = 'block';
        if(btnVoltarSalvasContainer) btnVoltarSalvasContainer.style.display = 'none';
    }
}

if (btnOutraConta) {
    btnOutraConta.onclick = () => {
        savedAccountsContainer.style.display = 'none';
        formLogin.style.display = 'block';
        inputEmail.value = '';
        inputSenha.value = '';
        if(btnVoltarSalvasContainer) btnVoltarSalvasContainer.style.display = 'block';
    };
}

if (btnVoltarSalvas) {
    btnVoltarSalvas.onclick = () => {
        loadSavedAccounts();
    };
}

document.addEventListener('DOMContentLoaded', loadSavedAccounts);

formLogin.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const email = inputEmail.value.trim(); 
    const senha = inputSenha.value.trim();
    
    msgErro.textContent = ''; 
    msgErro.style.display = 'none'; 

    if (!email) {
        msgErro.textContent = 'Por favor, digite seu e-mail.';
        msgErro.style.display = 'block';
        return;
    }

    if (!senha) {
        // Primeiro acesso (senha vazia)
        try {
            // Verifica se o e-mail existe no backend
            let baseUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
                ? 'http://localhost:3000' 
                : 'https://painel-de-controle-gcv.onrender.com';
            
            const checkResp = await fetch(`${baseUrl}/api/check-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });

            if (checkResp.ok) {
                const { exists } = await checkResp.json();
                if (!exists) {
                    msgErro.textContent = 'Email ou senha incorretos.'; // Simula o erro padrão para não detalhar que foi só o e-mail
                    msgErro.style.display = 'block';
                    return;
                }
            }

            const { error } = await _supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/Login/update-password.html',
            });
            if (error) throw error;
            msgErro.style.color = '#28a745';
            msgErro.textContent = 'Um link foi enviado para seu e-mail! Verifique sua caixa de entrada.';
            msgErro.style.display = 'block';
        } catch(err) {
            msgErro.textContent = 'Erro ao enviar link de recuperação: ' + err.message;
            msgErro.style.display = 'block';
        }
        return;
    }

    try {
        const { data, error } = await _supabase.auth.signInWithPassword({
            email: email, 
            password: senha,
        });

        if (error) {
            console.error('Erro no login:', error.message);
        
            if (error.message.includes('Invalid login credentials')) {
                // Checa no backend se o email pelo menos existe e está confirmado
                try {
                    let baseUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
                        ? 'http://localhost:3000' 
                        : 'https://painel-de-controle-gcv.onrender.com';
                    const checkResp = await fetch(`${baseUrl}/api/check-email`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: email })
                    });
                    if (checkResp.ok) {
                        const { exists, confirmed } = await checkResp.json();
                        if (exists && !confirmed) {
                            msgErro.textContent = 'Conta não ativada, verifique o e-mail nesses casos';
                            msgErro.style.display = 'block';
                            return;
                        }
                    }
                } catch(e) { console.warn(e); }
                msgErro.textContent = 'Email ou senha incorretos.';
            } else if (error.message.includes('Email not confirmed')) {
                msgErro.textContent = 'Conta não ativada, verifique o e-mail nesses casos';
            } else {
                msgErro.textContent = 'Erro ao entrar: ' + error.message;
            }
            
            msgErro.style.display = 'block'; 
            return;
        }

        console.log('Login bem-sucedido!', data);

        if (chkSalvarConta && chkSalvarConta.checked) {
            const saved = JSON.parse(localStorage.getItem('sisdecor_saved_accounts') || '[]');
            const filtered = saved.filter(acc => acc.email !== email);
            filtered.push({ email: email, hash: btoa(senha) });
            localStorage.setItem('sisdecor_saved_accounts', JSON.stringify(filtered));
        }

        window.location.href = '../index.html'; 

    } catch (err) {
        console.error('Erro inesperado:', err);
        msgErro.textContent = 'Ocorreu um erro de conexão. Tente novamente.';
        msgErro.style.display = 'block';
    }
});

// Modal WhatsApp
const btnContato = document.getElementById('btn-contato');
const modalWhatsapp = document.getElementById('modal-whatsapp');
const btnFecharWhatsapp = document.getElementById('btn-fechar-whatsapp');

if (btnContato) btnContato.addEventListener('click', () => modalWhatsapp.style.display = 'flex');
if (btnFecharWhatsapp) btnFecharWhatsapp.addEventListener('click', () => modalWhatsapp.style.display = 'none');
if (modalWhatsapp) modalWhatsapp.addEventListener('click', (e) => { if(e.target === modalWhatsapp) modalWhatsapp.style.display = 'none'; });