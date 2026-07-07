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
  'http://localhost:5500'
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
    const { email, password, cnpj, nome_empresa, telefone, nome_usuario } = req.body;
    if (!email || !password || !cnpj) return res.status(400).json({ erro: "Dados incompletos." });
    
    const cnpjLimpo = String(cnpj).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: "CNPJ inválido." });

    try {
        const { data: existingLoja } = await supabaseService.from('lojas').select('id').eq('cnpj', cnpjLimpo).maybeSingle();
        if (existingLoja) return res.status(409).json({ erro: "CNPJ já cadastrado." });

        const { data: userData, error: userError } = await supabaseService.auth.admin.createUser({
            email, password, email_confirm: true
        });
        if (userError) throw userError;

        const { data: lojaData, error: lojaError } = await supabaseService
            .from('lojas')
            .insert({
                nome: nome_empresa,
                owner_user_id: userData.user.id,
                cnpj: cnpjLimpo,
                telefone: telefone,
                subscription_status: 'trialing',
                trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }).select('id').single();
        if (lojaError) throw lojaError;

        await supabaseService.from('perfis').insert({
            user_id: userData.user.id,
            loja_id: lojaData.id,
            role: 'admin',
            nome_usuario
        });

        res.status(201).json({ mensagem: "Conta criada!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: error.message });
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
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
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
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
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
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        if (perfil.role !== 'admin') return res.status(403).json({ erro: "Sem permissão." });

        await supabaseService.from('loja_roles').delete().match({ id: req.params.id, loja_id: perfil.loja_id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.get('/api/team', async (req, res) => {
    try {
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
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
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        if (perfil.role !== 'admin') return res.status(403).json({ erro: "Apenas admin." });

        const { data: authUser, error: authError } = await supabaseService.auth.admin.createUser({ email, password: senha, email_confirm: true });
        if (authError) throw authError;

        let roleName = 'vendedor';
        if (role_id) {
            const { data: r } = await supabaseService.from('loja_roles').select('nome').eq('id', role_id).single();
            if (r) roleName = r.nome;
        }

        await supabaseService.from('perfis').insert({
            user_id: authUser.user.id, loja_id: perfil.loja_id, nome_usuario: nome, role: roleName, role_id
        });

        res.status(201).json({ mensagem: "Usuário criado." });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.put('/api/team/:id', async (req, res) => {
    const userIdAlvo = req.params.id;
    const { nome, email, senha, role_id } = req.body; 

    try {
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
        const { data: perfilAdmin } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        
        if (perfilAdmin.role !== 'admin') return res.status(403).json({ erro: "Sem permissão." });

        const { data: perfilAlvo } = await supabaseService.from('perfis').select('loja_id').eq('user_id', userIdAlvo).single();
        if (!perfilAlvo || perfilAlvo.loja_id !== perfilAdmin.loja_id) return res.status(403).json({ erro: "Usuário inválido." });

        const authUpdates = {};
        if (senha && senha.length >= 6) authUpdates.password = senha;
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

        await supabaseService.from('perfis').update(updates).eq('user_id', userIdAlvo);

        res.json({ mensagem: "Usuário atualizado." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: error.message });
    }
});

app.delete('/api/team/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        
        if (perfil.role !== 'admin') return res.status(403).json({ erro: "Sem permissão." });
        if (userId === user.id) return res.status(400).json({ erro: "Não pode se excluir." });

        const { data: alvo } = await supabaseService.from('perfis').select('loja_id').eq('user_id', userId).single();
        if (!alvo || alvo.loja_id !== perfil.loja_id) return res.status(403).json({ erro: "Usuário inválido." });

        await supabaseService.auth.admin.deleteUser(userId);
        res.json({ mensagem: "Removido." });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.get('/api/me/permissions', async (req, res) => {
    try {
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
        if (!user) return res.status(401).json({});

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
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
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
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
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