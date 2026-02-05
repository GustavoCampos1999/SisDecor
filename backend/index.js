require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet'); 
const morgan = require('morgan'); 
const { z } = require('zod');     
const rateLimit = require('express-rate-limit'); 
const { createClient } = require('@supabase/supabase-js');
const { calcularOrcamento } = require('./calculo.js');
const db = require('./database.js'); 
const app = express();
app.set('trust proxy', 1);
const allowedOrigins = [
  'https://gustavocampos1999.github.io', 
  'http://127.0.0.1:5500',
  'https://sisdecor.com.br',
  'http://localhost:5500'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log("Bloqueado pelo CORS:", origin); 
      callback(new Error('Não permitido pela política de CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], 
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true 
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); 

app.use(helmet());
app.use(morgan('combined')); 
app.use(express.json()); 

const createAccountLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: 100,
	message: { erro: "Muitas tentativas seguidas. Aguarde 15 minutos." },
	standardHeaders: true, 
	legacyHeaders: false,
});

const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: 100, 
    message: { erro: "Muitos pedidos. Tente mais tarde." }
});
app.use('/api', apiLimiter);

const PORTA = process.env.PORT || 3000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; 

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error("Erro: Variáveis de ambiente obrigatórias ausentes.");
  process.exit(1);
}

const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

const DEFAULT_CORTINA = ["CELULAR", "ATENA", "ATENA PAINEL", "CORTINA TETO", "ILLUMINE", "LAMOUR", "LUMIERE", "MELIADE", "ROLO STILLO", "PAINEL", "PERSIANA VERTICAL", "PH 25", "PH 50", "PH 75", "PLISSADA", "ROLO", "ROMANA", "TRILHO MOTORIZADO", "VERTIGLISS"];
const DEFAULT_TOLDO = ["PERGOLA", "BALI", "BERGAMO", "BERLIM", "CAPRI", "MILAO", "MILAO COMPACT", "MILAO MATIK", "MILAO PLUS", "MILAO SEMI BOX", "MONACO", "ZURIQUE", "ZIP SYSTEM"];
const DEFAULT_CORES_CORTINA = ["PADRAO", "BRANCO", "BRONZE", "CINZA", "MARFIM", "MARROM", "PRETO"];
const DEFAULT_CORES_TOLDO = ["PADRAO", "BRANCO", "BRONZE", "CINZA", "MARFIM", "MARROM", "PRETO"];

const registerSchema = z.object({
    email: z.string().email({ message: "E-mail inválido" }),
    password: z.string().min(6, { message: "A senha deve ter no mínimo 6 caracteres" }),
    nome_usuario: z.string().min(2, { message: "Nome de usuário muito curto" }),
    nome_empresa: z.string().min(2, { message: "Nome da empresa obrigatório" }),
    cnpj: z.string()
        .transform((val) => String(val).replace(/\D/g, ''))
        .refine((val) => val.length === 14 || val === '03051999', { message: "CNPJ inválido" }),
    telefone: z.string().optional()
});

const teamAddSchema = z.object({
    nome: z.string().min(2, { message: "Nome obrigatório" }),
    email: z.string().email({ message: "E-mail inválido" }),
    senha: z.string().min(6, { message: "Senha deve ter 6 caracteres" }),
    role_id: z.number().nullable().optional()
});

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

const requireAdmin = async (req, res, next) => {
    try {
        const { data: { user }, error: userError } = await req.supabase.auth.getUser();
        if (userError || !user) return res.status(401).json({ erro: "Token inválido." });

        const { data: perfil } = await supabaseService
            .from('perfis')
            .select('loja_id, role')
            .eq('user_id', user.id)
            .single();
        
        if (!perfil || perfil.role !== 'admin') {
            return res.status(403).json({ erro: "Apenas administradores podem realizar esta ação." });
        }

        req.adminPerfil = perfil; 
        next();
    } catch (error) {
        next(error); 
    }
};

app.get('/health', (req, res) => res.status(200).send('Online.'));

app.post('/api/check-email', async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ erro: "Email obrigatório" });
        const result = await db.query("SELECT id FROM auth.users WHERE email = $1", [email]);
        return res.json({ exists: result.rows.length > 0 });
    } catch (error) {
        next(error);
    }
});

app.post('/register', createAccountLimiter, async (req, res, next) => {
    const validacao = registerSchema.safeParse(req.body);
    if (!validacao.success) {
        return res.status(400).json({ erro: validacao.error.issues[0].message });
    }

    const { email, password, cnpj, nome_empresa, telefone, nome_usuario } = validacao.data;

    try {
        const { data: existingLoja } = await supabaseService.from('lojas').select('id').eq('cnpj', cnpj).maybeSingle();
        if (existingLoja) return res.status(409).json({ erro: "CNPJ já cadastrado." });

        const { data: userData, error: userError } = await supabaseService.auth.signUp({
            email, 
            password,
            options: { data: { nome_usuario } }
        });
        
        if (userError) throw userError;
        if (!userData.user) throw new Error("Erro ao criar usuário.");

        const { data: lojaData, error: lojaError } = await supabaseService
            .from('lojas')
            .insert({
                nome: nome_empresa,
                owner_user_id: userData.user.id,
                cnpj: cnpj,
                telefone: telefone,
                status_assinatura: 'teste', 
                data_fim_teste: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
            }).select('id').single();
            
        if (lojaError) throw lojaError;

        await supabaseService.from('perfis').insert({
            user_id: userData.user.id,
            loja_id: lojaData.id,
            role: 'admin',
            nome_usuario
        });

        const insertCortinas = DEFAULT_CORTINA.map(opcao => ({ loja_id: lojaData.id, opcao }));
        const insertToldos = DEFAULT_TOLDO.map(opcao => ({ loja_id: lojaData.id, opcao }));
        const insertCoresCortina = DEFAULT_CORES_CORTINA.map(opcao => ({ loja_id: lojaData.id, opcao }));
        const insertCoresToldo = DEFAULT_CORES_TOLDO.map(opcao => ({ loja_id: lojaData.id, opcao }));

        await Promise.all([
            supabaseService.from('amorim_modelos_cortina').insert(insertCortinas),
            supabaseService.from('amorim_modelos_toldo').insert(insertToldos),
            supabaseService.from('amorim_cores_cortina').insert(insertCoresCortina),
            supabaseService.from('amorim_cores_toldo').insert(insertCoresToldo)
        ]);
        res.status(201).json({ mensagem: "Conta criada!" });
    } catch (error) {
        next(error);
    }
});

app.post('/correction-email', async (req, res, next) => {
    const { oldEmail, newEmail } = req.body;
    try {
        const { data: { users }, error: findError } = await supabaseService.auth.admin.listUsers();
        if (findError) throw findError;

        const user = users.find(u => u.email === oldEmail);
        if (!user) return res.status(404).json({ erro: "Usuário não encontrado." });
        if (user.email_confirmed_at) return res.status(400).json({ erro: "Este usuário já está verificado." });
        
        const { error: updateError } = await supabaseService.auth.admin.updateUserById(
            user.id, { email: newEmail } 
        );
        if (updateError) throw updateError;
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});
app.use('/api', authMiddleware);

app.post('/api/calcular', (req, res, next) => {
   try {
    const resultados = calcularOrcamento(req.body);
    res.json(resultados);
   } catch (error) {
    next(error);
   }
});

app.get('/api/dados-base', async (req, res, next) => {
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
    next(error);
  }
});

app.get('/api/orcamentos/:clientId', async (req, res, next) => {
    const { clientId } = req.params;
    try {
        const { data } = await req.supabase.from('orcamentos').select('data').eq('client_id', clientId).maybeSingle();
        if (data) res.json(data.data || {});
        else res.status(404).json({ message: 'Não encontrado.' });
    } catch (error) {
        next(error);
    }
});

app.put('/api/orcamentos/:clientId', async (req, res, next) => {
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
        next(error);
    }
});

app.get('/api/roles', async (req, res, next) => {
    try {
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id').eq('user_id', user.id).single();
        if (!perfil) return res.status(403).json({ erro: "Perfil não encontrado" });

        const { data: roles } = await supabaseService.from('loja_roles').select('*').eq('loja_id', perfil.loja_id).order('nome');
        res.json(roles);
    } catch (error) {
        next(error);
    }
});

app.post('/api/roles', async (req, res, next) => {
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
        next(error);
    }
});

app.delete('/api/roles/:id', async (req, res, next) => {
    try {
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id, role').eq('user_id', user.id).single();
        if (perfil.role !== 'admin') return res.status(403).json({ erro: "Sem permissão." });

        await supabaseService.from('loja_roles').delete().match({ id: req.params.id, loja_id: perfil.loja_id });
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

app.get('/api/team', async (req, res, next) => {
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
        next(error);
    }
});

app.post('/api/team/add', createAccountLimiter, requireAdmin, async (req, res, next) => {
    const validacao = teamAddSchema.safeParse(req.body);
    if (!validacao.success) {
        return res.status(400).json({ erro: validacao.error.issues[0].message });
    }

    const { nome, email, senha, role_id } = validacao.data;
    const perfil = req.adminPerfil; 

    try {
        const { data: authUser, error: authError } = await supabaseService.auth.admin.createUser({ 
            email, 
            password: senha, 
            email_confirm: true 
        });

        if (authError) throw authError;

        let roleName = 'vendedor';
        if (role_id) {
            const { data: r } = await supabaseService.from('loja_roles').select('nome').eq('id', role_id).single();
            if (r) roleName = r.nome;
        }

        await supabaseService.from('perfis').insert({
            user_id: authUser.user.id, 
            loja_id: perfil.loja_id, 
            nome_usuario: nome, 
            role: roleName, 
            role_id
        });

        res.status(201).json({ mensagem: "Usuário criado com sucesso." });
    } catch (error) {
        next(error);
    }
});

app.put('/api/team/:id', requireAdmin, async (req, res, next) => {
    const userIdAlvo = req.params.id;
    const { nome, email, senha, role_id } = req.body; 
    const perfilAdmin = req.adminPerfil; 

    try {
        const { data: perfilAlvo } = await supabaseService
            .from('perfis')
            .select('loja_id')
            .eq('user_id', userIdAlvo)
            .single();

        if (!perfilAlvo || perfilAlvo.loja_id !== perfilAdmin.loja_id) {
            return res.status(403).json({ erro: "Usuário inválido ou de outra loja." });
        }

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
        next(error);
    }
});

app.delete('/api/team/:id', requireAdmin, async (req, res, next) => {
    try {
        const userId = req.params.id;
        const perfilAdmin = req.adminPerfil; 
        
        const { data: { user } } = await req.supabase.auth.getUser(); 
        if (userId === user.id) return res.status(400).json({ erro: "Não pode excluir a si mesmo." });
        
        const { data: alvo } = await supabaseService
            .from('perfis')
            .select('loja_id')
            .eq('user_id', userId)
            .single();

        if (!alvo || alvo.loja_id !== perfilAdmin.loja_id) {
            return res.status(403).json({ erro: "Usuário inválido." });
        }

        await supabaseService.auth.admin.deleteUser(userId);
        res.json({ mensagem: "Removido." });
    } catch (error) {
        next(error);
    }
});

app.get('/api/me/permissions', async (req, res, next) => {
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
        next(error);
    }
});

app.get('/api/config/taxas', async (req, res, next) => {
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
        next(error);
    }
});

app.post('/api/config/taxas', async (req, res, next) => {
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
        next(error);
    }
});

const globalErrorHandler = (err, req, res, next) => {
    console.error("🔴 ERRO CRÍTICO NO SERVIDOR:", err);

    const statusCode = err.statusCode || 500;
    const message = "Ocorreu um erro interno no servidor. Tente novamente mais tarde.";

    res.status(statusCode).json({
        erro: message,
        detalhe: err.message && !err.message.includes('SQL') ? err.message : null 
    });
};

app.use(globalErrorHandler);

app.listen(PORTA, '0.0.0.0', () => console.log(`Backend blindado rodando na porta ${PORTA}`));