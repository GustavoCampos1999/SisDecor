require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); 
const morgan = require('morgan'); 
const { z } = require('zod');     
const rateLimit = require('express-rate-limit'); 
const { createClient } = require('@supabase/supabase-js');
const { calcularOrcamento } = require('./calculo.js');
const db = require('./database.js'); 
const axios = require('axios'); 

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

const authMiddleware = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return _res.status(401).json({ erro: "Token necessário." });
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

app.get('/health', (_req, res) => res.status(200).send('Online.'));

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

app.post('/register', createAccountLimiter, async (req, res) => {
    const validacao = registerSchema.safeParse(req.body);
    if (!validacao.success) {
        return res.status(400).json({ erro: validacao.error.issues[0].message });
    }

    const { email, password, cnpj, nome_empresa, telefone, nome_usuario } = validacao.data;

    try {
        const { data: existingLoja } = await supabaseService
            .from('lojas')
            .select('id')
            .eq('cnpj', cnpj)
            .maybeSingle();
        
        if (existingLoja) return res.status(409).json({ erro: "Este CNPJ já está cadastrado." });

        const { data: userData, error: userError } = await supabaseService.auth.signUp({
            email, 
            password,
            options: { data: { nome_usuario, telefone } }
        });
        
        if (userError) throw userError;

        const dataExpiracao = new Date();
        dataExpiracao.setDate(dataExpiracao.getDate() + 30);
        const dataISO = dataExpiracao.toISOString();

        const { data: lojaData, error: lojaError } = await supabaseService
            .from('lojas')
            .insert({
                nome: nome_empresa,
                owner_user_id: userData.user.id,
                cnpj: cnpj,
                telefone: telefone, 
                status_assinatura: 'teste',      
                subscription_status: 'trialing', 
                data_fim_teste: dataISO,         
                trial_ends_at: dataISO           
            }).select('id').single();
            
        if (lojaError) throw lojaError;

        await supabaseService.from('perfis').insert({
            user_id: userData.user.id,
            loja_id: lojaData.id,
            role: 'admin',
            nome_usuario
        });

        try {
            const insertData = (arr) => arr.map(opcao => ({ loja_id: lojaData.id, opcao }));
            await Promise.allSettled([
                supabaseService.from('amorim_modelos_cortina').insert(insertData(DEFAULT_CORTINA)),
                supabaseService.from('amorim_modelos_toldo').insert(insertData(DEFAULT_TOLDO)),
                supabaseService.from('amorim_cores_cortina').insert(insertData(DEFAULT_CORES_CORTINA)),
                supabaseService.from('amorim_cores_toldo').insert(insertData(DEFAULT_CORES_TOLDO))
            ]);
        } catch (e) { console.warn("Falha ao inserir dados padrão."); }

        res.status(201).json({ mensagem: "Registro concluído com sucesso!" });

   } catch (error) {
        console.error("Erro no registro:", error.message);
        res.status(500).json({ erro: error.message });
    }
});

app.post('/api/pagamentos/webhook', async (req, res) => {
    const { reference_id, status, items } = req.body;

    try {
        if (status === 'PAID' || status === 'AVAILABLE') {
            const lojaId = reference_id;
            const planoKey = items[0].reference_id;
           const dias = planoKey === 'mensal' ? 30 : (planoKey === 'trimestral' ? 90 : (planoKey === 'semestral' ? 180 : 365));
            
            const { data: perfil } = await supabaseService
                .from('perfis')
                .select('data_expiracao_assinatura')
                .eq('loja_id', lojaId)
                .single();
            
            let dataBase = new Date();
            if (perfil?.data_expiracao_assinatura && new Date(perfil.data_expiracao_assinatura) > new Date()) {
                dataBase = new Date(perfil.data_expiracao_assinatura);
            }
            
            dataBase.setDate(dataBase.getDate() + dias);

            await supabaseService
                .from('perfis')
                .update({ 
                    data_expiracao_assinatura: dataBase.toISOString(),
                    status_assinatura: 'ativo' 
                })
                .eq('loja_id', lojaId);

            console.log(`✅ Webhook: Loja ${lojaId} renovada por ${dias} dias.`);
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Erro no Webhook PagBank:", error);
        res.sendStatus(500);
    }
});

app.use('/api', apiLimiter);
app.use('/api', authMiddleware);

app.get('/api/team', async (req, res, next) => {
    try {
        const { data: { user } } = await supabaseService.auth.getUser(req.authToken);
        const { data: perfil } = await supabaseService.from('perfis').select('loja_id').eq('user_id', user.id).single();
        
        if (!perfil) return res.status(403).json({ erro: "Perfil não encontrado" });

        const { data: equipe } = await supabaseService
            .from('perfis')
            .select('user_id, nome_usuario, role, role_id')
            .eq('loja_id', perfil.loja_id);
        
        res.json(equipe || []);
    } catch (error) {
        next(error);
    }
});

app.post('/api/pagamentos/checkout', async (req, res) => {
    const { plano, loja_id } = req.body;
    const PAGSEGURO_TOKEN = process.env.PAGBANK_TOKEN; 
    const PAGSEGURO_API_URL = 'https://api.pagseguro.com';
    const planoNormalizado = String(plano).trim().toLowerCase();

    const planos = {
        'mensal': { nome: 'Assinatura SisDecor - Mensal', valor: 3990 },
        'trimestral': { nome: 'Assinatura SisDecor - Trimestral', valor: 11970 }, 
        'semestral': { nome: 'Assinatura SisDecor - Semestral', valor: 23890 },
        'anual': { nome: 'Assinatura SisDecor - Anual', valor: 35890 }
    };

    const item = planos[planoNormalizado];

    if (!item) {
        return res.status(400).json({ erro: `Plano inválido: ${plano}` });
    }

    try {
        const payload = {
            reference_id: String(loja_id), 
            customer: {
                name: String(req.body.nome_cliente || "Cliente SisDecor").substring(0, 50),
                email: String(req.body.email_cliente || "cliente@email.com")
            },
            items: [{
                reference_id: String(planoNormalizado),
                name: String(item.nome),
                quantity: 1,
                unit_amount: parseInt(item.valor) 
            }],
            payment_methods: [
                { type: "CREDIT_CARD" },
                { type: "BOLETO" },
                { type: "PIX" }
            ],
            redirect_url: "https://sisdecor.com.br"
        };

        const response = await axios.post(`${PAGSEGURO_API_URL}/checkouts`, payload, {
            headers: {
                'Authorization': `Bearer ${PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const checkoutLink = response.data.links.find(link => link.rel === 'PAY');
        res.json({ url: checkoutLink.href });

   } catch (error) {
        const pagbankError = error.response?.data;
        console.error("ERRO DETALHADO PAGBANK:", JSON.stringify(pagbankError, null, 2) || error.message);
        
        if (pagbankError) {
            return res.status(500).json(pagbankError);
        }

        res.status(500).json({ erro: "Erro na comunicação com a API do PagBank.", detalhe: error.message });
    }
});

app.post('/api/calcular', (req, res, _next) => {
   try {
    const resultados = calcularOrcamento(req.body);
    res.json(resultados);
   } catch (error) {
    _next(error);
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

const globalErrorHandler = (err, _req, res, _next) => {
    console.error("🔴 ERRO CRÍTICO NO SERVIDOR:", err);

    const statusCode = err.statusCode || 500;
    const message = err.message || "Ocorreu um erro interno no servidor.";

    res.status(statusCode).json({
        erro: message,
        detalhe: err.message && !err.message.includes('SQL') ? err.message : null 
    });
};

app.use(globalErrorHandler);

app.listen(PORTA, '0.0.0.0', () => console.log(`Backend blindado rodando na porta ${PORTA}`));