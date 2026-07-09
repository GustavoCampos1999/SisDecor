import { _supabase } from '../supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const loadingMessage = document.getElementById('loading-message');
    const formFinalizar = document.getElementById('form-finalizar');
    const msgErro = document.getElementById('mensagem-erro');
    
    // Inputs
    const inpNomeEmpresa = document.getElementById('inp-nome-empresa');
    const inpNomeDono = document.getElementById('inp-nome-dono');
    const inpCnpj = document.getElementById('inp-cnpj');
    const inpEmail = document.getElementById('inp-email');
    const inpEndereco = document.getElementById('inp-endereco');
    const telefonesContainer = document.getElementById('telefones-container');
    const inpSenha = document.getElementById('inp-senha');
    const inpSenhaConfirm = document.getElementById('inp-senha-confirm');

    let lojaId = null;
    let userId = null;

    try {
        // O Supabase JS automaticamente pega o token da URL se for um link de convite/recuperação
        // e inicia a sessão. Só precisamos pegar a sessão.
        const { data: { session }, error: sessionError } = await _supabase.auth.getSession();
        
        if (sessionError || !session) {
            loadingMessage.innerHTML = '<span style="color:red">Link inválido ou expirado. Por favor, solicite um novo acesso.</span>';
            return;
        }

        userId = session.user.id;
        inpEmail.value = session.user.email;

        // Buscar Perfil
        const { data: perfil, error: perfilError } = await _supabase
            .from('perfis')
            .select('nome_usuario, loja_id')
            .eq('user_id', userId)
            .single();

        if (perfilError) throw perfilError;
        if (perfil.nome_usuario) inpNomeDono.value = perfil.nome_usuario;
        lojaId = perfil.loja_id;

        // Buscar Loja
        if (lojaId) {
            const { data: loja, error: lojaError } = await _supabase
                .from('lojas')
                .select('*')
                .eq('id', lojaId)
                .single();

            if (lojaError) throw lojaError;

            inpNomeEmpresa.value = loja.nome_empresa || loja.nome || '';
            inpCnpj.value = loja.cnpj || 'Não informado';
            inpEndereco.value = loja.endereco || '';

            // Telefones (pode ter vindo como string separada por vírgula)
            if (loja.telefone) {
                const telefones = loja.telefone.split(',').map(t => t.trim()).filter(t => t);
                if (telefones.length > 0) {
                    telefonesContainer.innerHTML = ''; // limpa o template padrão
                    telefones.forEach((tel, index) => {
                        addPhoneRow(tel, index === 0);
                    });
                }
            }
        }

        // Tudo carregado
        loadingMessage.style.display = 'none';
        formFinalizar.style.display = 'block';

    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        loadingMessage.innerHTML = '<span style="color:red">Erro ao carregar seus dados.</span>';
    }

    // Lógica para adicionar campos de telefone
    telefonesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-add-phone')) {
            addPhoneRow();
        } else if (e.target.classList.contains('btn-remove-phone')) {
            e.target.closest('.phone-row').remove();
        }
    });

    function addPhoneRow(value = '', isFirst = false) {
        const row = document.createElement('div');
        row.className = 'phone-row';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inp-telefone';
        input.value = value;
        input.required = isFirst; // Apenas o primeiro é obrigatório
        
        const btn = document.createElement('button');
        btn.type = 'button';
        if (isFirst) {
            btn.className = 'btn-add-phone';
            btn.textContent = '+';
            btn.title = 'Adicionar mais um número';
        } else {
            btn.className = 'btn-remove-phone';
            btn.textContent = '×';
            btn.title = 'Remover este número';
        }

        row.appendChild(input);
        row.appendChild(btn);
        telefonesContainer.appendChild(row);
    }

    // Submissão
    formFinalizar.addEventListener('submit', async (e) => {
        e.preventDefault();
        msgErro.style.display = 'none';

        if (inpSenha.value.length < 6) {
            msgErro.textContent = 'A senha deve ter no mínimo 6 caracteres.';
            msgErro.style.display = 'block';
            return;
        }

        if (inpSenha.value !== inpSenhaConfirm.value) {
            msgErro.textContent = 'As senhas não coincidem.';
            msgErro.style.display = 'block';
            return;
        }

        const btnSubmit = document.getElementById('btn-submit');
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Salvando...';

        try {
            // 1. Atualizar Senha no Auth
            const { error: authError } = await _supabase.auth.updateUser({
                password: inpSenha.value
            });
            if (authError) throw authError;

            // 2. Atualizar Perfil
            const { error: perfilUpdateErr } = await _supabase
                .from('perfis')
                .update({ nome_usuario: inpNomeDono.value })
                .eq('user_id', userId);
            if (perfilUpdateErr) throw perfilUpdateErr;

            // 3. Atualizar Loja
            if (lojaId) {
                // Junta todos os telefones
                const telefonesInputs = document.querySelectorAll('.inp-telefone');
                const telefonesValues = Array.from(telefonesInputs).map(inp => inp.value.trim()).filter(v => v);
                const telefoneFinal = telefonesValues.join(', ');

                const { error: lojaUpdateErr } = await _supabase
                    .from('lojas')
                    .update({
                        nome_empresa: inpNomeEmpresa.value,
                        nome: inpNomeEmpresa.value,
                        endereco: inpEndereco.value,
                        telefone: telefoneFinal
                    })
                    .eq('id', lojaId);
                if (lojaUpdateErr) throw lojaUpdateErr;
            }

            // Sucesso!
            window.location.href = '../index.html';

        } catch (err) {
            console.error(err);
            msgErro.textContent = 'Erro ao salvar: ' + err.message;
            msgErro.style.display = 'block';
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Finalizar e Entrar';
        }
    });

});
