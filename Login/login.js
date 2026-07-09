import { _supabase } from '../supabaseClient.js';

const formLogin = document.getElementById('form-login');
const inputEmail = document.getElementById('email');
const inputSenha = document.getElementById('senha');
const msgErro = document.getElementById('mensagem-erro');

const savedAccountsContainer = document.getElementById('saved-accounts-container');
const savedAccountsList = document.getElementById('saved-accounts-list');
const btnOutraConta = document.getElementById('btn-outra-conta');
const chkSalvarConta = document.getElementById('chk-salvar-conta');

function loadSavedAccounts() {
    const saved = JSON.parse(localStorage.getItem('sisdecor_saved_accounts') || '[]');
    if (saved.length > 0 && savedAccountsContainer) {
        savedAccountsContainer.style.display = 'block';
        formLogin.style.display = 'none';
        
        savedAccountsList.innerHTML = '';
        saved.forEach(acc => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.padding = '15px';
            btn.style.border = '1px solid #ddd';
            btn.style.borderRadius = '8px';
            btn.style.background = '#fff';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
            btn.style.color = '#333';
            btn.style.textAlign = 'center';
            btn.style.fontSize = '14px';
            btn.textContent = acc.email;
            btn.onclick = () => {
                inputEmail.value = acc.email;
                inputSenha.value = atob(acc.hash);
                formLogin.dispatchEvent(new Event('submit'));
            };
            savedAccountsList.appendChild(btn);
        });
    }
}

if (btnOutraConta) {
    btnOutraConta.onclick = () => {
        savedAccountsContainer.style.display = 'none';
        formLogin.style.display = 'block';
        inputEmail.value = '';
        inputSenha.value = '';
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
                msgErro.textContent = 'Email ou senha incorretos.';
            } else if (error.message.includes('Email not confirmed')) {
                msgErro.textContent = 'Seu email ainda não foi confirmado.';
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