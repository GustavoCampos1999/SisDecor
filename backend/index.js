require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { calcularOrcamento } = require('./calculo.js');
const db = require('./database.js'); 

const app = express();

const allowedOrigins = [
  'https://gustavocampos1999.github.io', 
  'http://127.0.0.1:5500',
  'http://localhost:5500',
'https://sisdecor.com.br'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Não permitido pela política de CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],    
  allowedHeaders: ['Content-Type', 'Authorization'] 
};

app.use(express.json());
app.use(cors(corsOptions)); 

const PORTA = process.env.PORT || 3000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; 

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error("Erro: Variáveis de ambiente obrigatórias ausentes.");
  process.exit(1);
}

const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

app.get('/health', (req, res) => res.status(200).send('Online.'));

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: "Token necessário." });
  }
  const token = authHeader.split(' ')[1];
  req.supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  req.authToken = token;
  next();
};

app.post('/api/check-email', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: "Email obrigatório" });
    try {
        const result = await db.query("SELECT id FROM auth.users WHERE email = $1", [email]);
        return res.json({ exists: result.rows.length > 0 });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ erro: "Erro interno." });
    }
});

app.post('/register', async (req, res) => {
    const { email, cnpj, nome_empresa, telefone, nome_dono } = req.body;
    if (!email || !nome_empresa) return res.status(400).json({ erro: "Dados incompletos." });
    
    // CNPJ ou CPF opcional (remover pontuações se existir)
    const documento = cnpj ? String(cnpj).replace(/\D/g, '') : null;

    try {
        if (documento) {
            const { data: existingLoja } = await supabaseService.from('lojas').select('id').eq('cnpj', documento).maybeSingle();
            if (existingLoja) return res.status(409).json({ erro: "CNPJ/CPF já cadastrado." });
        }

        // Gera uma senha aleatória segura já que o usuário vai recuperar a senha depois
        const randomPassword = Math.random().toString(36).slice(-10) + "A1@";

        const { data: userData, error: userError } = await supabaseService.auth.admin.createUser({
            email, password: randomPassword, email_confirm: true
        });
        if (userError) throw userError;

        const { data: lojaData, error: lojaError } = await supabaseService
            .from('lojas')
            .insert({
                nome: nome_empresa,
                owner_user_id: userData.user.id,
                cnpj: documento,
                telefone: telefone,
                status_assinatura: 'ativo'
            }).select('id').single();
        if (lojaError) throw lojaError;

        const { error: perfilError } = await supabaseService.from('perfis').insert({
            user_id: userData.user.id,
            loja_id: lojaData.id,
            role: 'admin',
            nome_usuario: nome_dono || 'Dono'
        });
        if (perfilError) throw perfilError;

        res.status(201).json({ mensagem: "Conta criada!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: error.message });
    }
});

// Nova rota para o admin buscar o mapeamento de ID -> E-mail
app.get('/admin/users', async (req, res) => {
    try {
        const { data: { users }, error } = await supabaseService.auth.admin.listUsers();
        if (error) throw error;
        
        const map = {};
        users.forEach(u => map[u.id] = u.email);
        res.json(map);
    } catch(err) {
        res.status(500).json({ erro: err.message });
    }
});

// Nova rota para ações de administrador (contornar RLS)
app.post('/admin/loja/:id/acao', async (req, res) => {
    const { id } = req.params;
    const { acao } = req.body; 

    try {
        if (acao === 'excluir') {
            const { data: loja } = await supabaseService.from('lojas').select('owner_user_id').eq('id', id).single();
            
            // Exclui todas as dependências nas tabelas que o supabase não apaga sozinho (se não houver ON DELETE CASCADE)
            await supabaseService.from('perfis').delete().eq('loja_id', id);
            
            if (loja && loja.owner_user_id) {
                // Remove o usuário da autenticação para que ele não consiga mais logar
                await supabaseService.auth.admin.deleteUser(loja.owner_user_id);
            }
            
            // Por fim deleta a loja
            const { error: errLoja } = await supabaseService.from('lojas').delete().eq('id', id);
            if (errLoja) throw errLoja;

        } else if (acao === 'bloquear') {
            const { error } = await supabaseService.from('lojas').update({ status_assinatura: 'suspenso' }).eq('id', id);
            if (error) throw error;
        } else if (acao === 'desbloquear') {
            const { error } = await supabaseService.from('lojas').update({ status_assinatura: 'ativo' }).eq('id', id);
            if (error) throw error;
        }

        res.json({ sucesso: true });
    } catch(err) {
        console.error("Erro na ação de admin:", err);
        res.status(500).json({ erro: err.message });
    }
});

// Rota para editar informações da loja e do dono
app.put('/admin/loja/:id/editar', async (req, res) => {
    const { id } = req.params;
    const { field, value, userId } = req.body;

    try {
        if (field === 'email' || field.startsWith('email_membro')) {
            if (!userId) throw new Error("userId necessário para atualizar e-mail.");
            const { error } = await supabaseService.auth.admin.updateUserById(userId, { email: value });
            if (error) throw error;
        } else if (field === 'nome_dono' || field.startsWith('nome_membro')) {
            if (!userId) throw new Error("userId necessário.");
            const { error } = await supabaseService.from('perfis').update({ nome_usuario: value }).eq('user_id', userId);
            if (error) throw error;
        } else if (field === 'nome_empresa') {
            const { error } = await supabaseService.from('lojas').update({ nome: value, nome_empresa: value }).eq('id', id);
            if (error) throw error;
        } else if (field === 'cnpj' || field === 'telefone') {
            const { error } = await supabaseService.from('lojas').update({ [field]: value }).eq('id', id);
            if (error) throw error;
        } else {
            throw new Error("Campo inválido para edição.");
        }
        res.json({ sucesso: true });
    } catch(err) {
        console.error("Erro na edição:", err);
        res.status(500).json({ erro: err.message });
    }
});

// Checa se o e-mail existe no sistema antes de disparar o esqueci a senha
app.post('/api/check-email', async (req, res) => {
    const { email } = req.body;
    try {
        const { data: { users }, error } = await supabaseService.auth.admin.listUsers();
        if (error) throw error;
        
        const exists = users.some(u => u.email === email);
        res.json({ exists });
    } catch(err) {
        res.status(500).json({ erro: err.message });
    }
});

// Nova rota para excluir membro da equipe (Admin)
app.delete('/admin/membro/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // Primeiro remove do perfis (isso vai tirar ele do banco relacional)
        await supabaseService.from('perfis').delete().eq('user_id', userId);
        
        // Remove do Auth para não logar mais
        const { error } = await supabaseService.auth.admin.deleteUser(userId);
        if (error) throw error;
        
        res.json({ sucesso: true });
    } catch(err) {
        console.error("Erro ao excluir membro:", err);
        res.status(500).json({ erro: err.message });
    }
});

app.use('/api', authMiddleware);

app.post('/api/calcular', (req, res) => {
   try {
    const resultados = calcularOrcamento(req.body);
    res.json(resultados);
   } catch (error) {
    res.status(500).json({ erro: "Erro no cálculo." });
   }
});

app.get('/api/dados-base', async (req, res) => {
  try {
    const [t, c, tr, f, i] = await Promise.all([
      req.supabase.from('tecidos').select('*').order('produto'),
      req.supabase.from('confeccao').select('*').order('opcao'),
      req.supabase.from('trilho').select('*').order('opcao'),
      req.supabase.from('frete').select('*').order('valor'),
      req.supabase.from('instalacao').select('*').order('valor')
    ]);
    res.json({ tecidos: t.data||[], confeccao: c.data||[], trilho: tr.data||[], frete: f.data||[], instalacao: i.data||[] });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar dados." });
  }
});

app.get('/api/orcamentos/:clientId', async (req, res) => {
    const { clientId } = req.params;
    try {
        const { data } = await req.supabase.from('orcamentos').select('data').eq('client_id', clientId).maybeSingle();
        if (data) res.json(data.data || {});
        else res.status(404).json({ message: 'Não encontrado.' });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.put('/api/orcamentos/:clientId', async (req, res) => {
    const { clientId } = req.params;
    const orcamentoData = req.body;
    
    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });

        const { data: perfilData } = await supabaseService.from('perfis').select('loja_id').eq('user_id', user.id).single();
        if (!perfilData) throw new Error("Loja não identificada para este usuário.");
        
        const { data, error } = await supabaseService
          .from('orcamentos')
          .upsert({ client_id: clientId, loja_id: perfilData.loja_id, data: orcamentoData }, { onConflict: 'client_id, loja_id' })
          .select('data, updated_at').single();
          
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        console.error(`Erro PUT orcamento:`, error);
        res.status(500).json({ erro: error.message });
    }
});

app.get('/api/roles', async (req, res) => {
    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id').eq('user_id', user.id).single();
        if (!perfil) return res.status(403).json({ erro: "Perfil não encontrado" });

        const { data: roles } = await supabaseService.from('loja_roles').select('*').eq('loja_id', perfil.loja_id).order('nome');
        res.json(roles);
    } catch (error) {
        res.status(500).json({ erro: "Erro interno." });
    }
});

app.post('/api/roles', async (req, res) => {
    const { id, nome, permissions } = req.body;
    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();

        if (perfil.role !== 'admin') return res.status(403).json({ erro: "Sem permissão." });

        const dados = { loja_id: perfil.loja_id, nome, permissions };
        const query = id ? supabaseService.from('loja_roles').update(dados).eq('id', id) : supabaseService.from('loja_roles').insert(dados);
        const { data, error } = await query.select().single();
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.delete('/api/roles/:id', async (req, res) => {
    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        if (perfil.role !== 'admin') return res.status(403).json({ erro: "Sem permissão." });

        const { error: delError } = await supabaseService.from('loja_roles').delete().match({ id: req.params.id, loja_id: perfil.loja_id });
        if (delError) throw delError;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.get('/api/team', async (req, res) => {
    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id').eq('user_id', user.id).single();
        
        if (!perfil) return res.status(403).json({ erro: "Perfil não encontrado" });

        const { data: equipe } = await supabaseService
            .from('perfis')
            .select('user_id, nome_usuario, role, role_id')
            .eq('loja_id', perfil.loja_id);
        
        const { data: roles } = await supabaseService.from('loja_roles').select('id, nome').eq('loja_id', perfil.loja_id);
        
        const { data: { users: authUsers } } = await supabaseService.auth.admin.listUsers();

        const equipeFinal = equipe.map(membro => {
            const roleCustom = roles.find(r => r.id === membro.role_id);
            const authUser = authUsers.find(u => u.id === membro.user_id);
            
            return { 
                ...membro, 
                role_custom_name: roleCustom ? roleCustom.nome : null,
                email: authUser ? authUser.email : 'Email não encontrado' 
            };
        });

        res.json(equipeFinal);
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: error.message });
    }
});

app.post('/api/team/add', async (req, res) => {
    const { nome, email, senha, role_id } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Dados incompletos." });

    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        if (perfil.role !== 'admin') return res.status(403).json({ erro: "Apenas admin." });

        const { data: authUser, error: createUserError } = await supabaseService.auth.admin.createUser({ email, password: senha, email_confirm: true });
        if (createUserError) throw createUserError;

        let roleName = 'vendedor';
        if (role_id) {
            const { data: r } = await supabaseService.from('loja_roles').select('nome').eq('id', role_id).single();
            if (r) roleName = r.nome;
        }

        const { error: insertError } = await supabaseService.from('perfis').insert({
            user_id: authUser.user.id, loja_id: perfil.loja_id, nome_usuario: nome, role: roleName, role_id
        });
        if (insertError) {
            await supabaseService.auth.admin.deleteUser(authUser.user.id);
            throw insertError;
        }

        res.status(201).json({ mensagem: "Usuário criado." });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.put('/api/team/:id', async (req, res) => {
    const userIdAlvo = req.params.id;
    const { nome, email, senha, role_id } = req.body; 

    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfilAdmin } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        
        if (perfilAdmin.role !== 'admin') return res.status(403).json({ erro: "Sem permissão." });

        const { data: perfilAlvo } = await supabaseService.from('perfis').select('loja_id').eq('user_id', userIdAlvo).single();
        if (!perfilAlvo || perfilAlvo.loja_id !== perfilAdmin.loja_id) return res.status(403).json({ erro: "Usuário inválido." });

        const authUpdates = {};
        if (senha) {
            if (senha.length >= 6) authUpdates.password = senha;
            else return res.status(400).json({ erro: "A senha deve ter no mínimo 6 caracteres." });
        }
        if (email) authUpdates.email = email; 

        if (Object.keys(authUpdates).length > 0) {
            const { error: authErr } = await supabaseService.auth.admin.updateUserById(userIdAlvo, authUpdates);
            if (authErr) throw authErr;
        }

        let updates = { nome_usuario: nome };
        if (role_id) {
            updates.role_id = role_id;
            const { data: r } = await supabaseService.from('loja_roles').select('nome').eq('id', role_id).single();
            if (r) updates.role = r.nome;
        } else if (role_id === null) { 
             updates.role_id = null;
             updates.role = 'vendedor';
        }

        const { error: updateError } = await supabaseService.from('perfis').update(updates).eq('user_id', userIdAlvo);
        if (updateError) throw updateError;

        res.json({ mensagem: "Usuário atualizado." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: error.message });
    }
});

app.delete('/api/team/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        
        if (perfil.role !== 'admin') return res.status(403).json({ erro: "Sem permissão." });
        if (userId === user.id) return res.status(400).json({ erro: "Não pode se excluir." });

        const { data: alvo } = await supabaseService.from('perfis').select('loja_id').eq('user_id', userId).single();
        if (!alvo || alvo.loja_id !== perfil.loja_id) return res.status(403).json({ erro: "Usuário inválido." });

        const { error: delUserError } = await supabaseService.auth.admin.deleteUser(userId);
        if (delUserError) throw delUserError;
        res.json({ mensagem: "Removido." });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.get('/api/me/permissions', async (req, res) => {
    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({});

        const { data: perfil } = await supabaseService.from('perfis').select('role, role_id').eq('user_id', user.id).single();
        
        if (!perfil) return res.json({});

        if (perfil.role === 'admin') {
            return res.json({ isAdmin: true });
        }

        if (perfil.role_id) {
            const { data: roleData } = await supabaseService.from('loja_roles').select('permissions').eq('id', perfil.role_id).single();
            return res.json(roleData ? roleData.permissions : {});
        }

        res.json({}); 
    } catch (error) {
        res.status(500).json({});
    }
});

app.get('/api/config/taxas', async (req, res) => {
    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id').eq('user_id', user.id).single();
        
        if (!perfil) return res.status(403).json({ erro: "Perfil não encontrado" });

        const { data } = await supabaseService
            .from('loja_taxas')
            .select('taxas')
            .eq('loja_id', perfil.loja_id)
            .single();

        res.json(data ? data.taxas : null);
    } catch (error) {
        console.error("Erro GET taxas:", error);
        res.status(500).json({ erro: "Erro ao buscar taxas." });
    }
});

app.post('/api/config/taxas', async (req, res) => {
    const { taxas } = req.body;
    try {
        const { data: { user }, error: authError } = await supabaseService.auth.getUser(req.authToken);
        if (authError || !user) return res.status(401).json({ erro: "Token inválido." });
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();

        if (!perfil) return res.status(403).json({ erro: "Sem permissão." });

        const { error } = await supabaseService
            .from('loja_taxas')
            .upsert({ 
                loja_id: perfil.loja_id, 
                taxas: taxas,
                updated_at: new Date()
            }, { onConflict: 'loja_id' });

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error("Erro POST taxas:", error);
        res.status(500).json({ erro: error.message });
    }
});

app.listen(PORTA, '0.0.0.0', () => console.log(`Backend on ${PORTA}`));