import { _supabase } from '../supabaseClient.js';

const form = document.getElementById('form-update-password');
const inputPass = document.getElementById('new-password');
const inputConfirm = document.getElementById('confirm-password');
const msgSucesso = document.getElementById('mensagem-sucesso');
const msgErro = document.getElementById('mensagem-erro');
const btnUpdate = document.getElementById('btn-update');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgErro.textContent = '';
    msgSucesso.style.display = 'none';

    if (inputPass.value.length < 6) {
        msgErro.textContent = 'A senha deve ter no mínimo 6 caracteres.';
        msgErro.style.display = 'block';
        return;
    }

    if (inputPass.value !== inputConfirm.value) {
        msgErro.textContent = 'As senhas não coincidem.';
        msgErro.style.display = 'block';
        return;
    }

    btnUpdate.disabled = true;
    btnUpdate.textContent = 'Salvando...';

    try {
        const { error } = await _supabase.auth.updateUser({
            password: inputPass.value
        });

        if (error) throw error;

        msgSucesso.textContent = 'Senha atualizada com sucesso! Redirecionando...';
        msgSucesso.style.display = 'block';
        form.reset();

        setTimeout(() => {
            window.location.href = '../index.html'; 
        }, 2000);

    } catch (err) {
        console.error('Erro ao atualizar senha:', err);
        msgErro.textContent = 'Erro ao salvar nova senha. O link pode ter expirado. Tente solicitar novamente.';
        btnUpdate.disabled = false;
        btnUpdate.textContent = 'Salvar Nova Senha';
    }
});