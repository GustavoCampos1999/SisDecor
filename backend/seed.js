const db = require('./database.js');

async function criarTabelas() {
  const client = await db.pool.connect();
  console.log('Iniciando script de criação de tabelas...');

  try {
    await client.query('BEGIN'); 

    console.log('Criando tabelas REAIS (vazias) para os dados das lojas...');

    await client.query(`CREATE TABLE IF NOT EXISTS lojas (
        id BIGSERIAL PRIMARY KEY,
        owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
        nome TEXT,
        cnpj TEXT UNIQUE,
        telefone TEXT,
        subscription_status TEXT,
        trial_ends_at TIMESTAMPTZ, -- <-- CORRIGIDO AQUI
        created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS perfis (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        loja_id BIGINT REFERENCES lojas(id) ON DELETE CASCADE,
        nome_usuario TEXT,
        role TEXT,
        UNIQUE(user_id, loja_id)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS clientes (
        id BIGSERIAL PRIMARY KEY,
        loja_id BIGINT REFERENCES lojas(id) ON DELETE CASCADE,
        nome TEXT,
        telefone TEXT,
        email TEXT,
        endereco TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by_name TEXT,
        venda_realizada BOOLEAN DEFAULT false
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS tecidos (
        id BIGSERIAL PRIMARY KEY,
        loja_id BIGINT REFERENCES lojas(id) ON DELETE CASCADE,
        produto TEXT NOT NULL,
        largura REAL,
        atacado REAL,
        favorito BOOLEAN DEFAULT false,
        UNIQUE(loja_id, produto)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS confeccao (
    id BIGSERIAL PRIMARY KEY,
    loja_id BIGINT REFERENCES lojas(id) ON DELETE CASCADE,
    opcao TEXT NOT NULL,
    valor REAL,
    limite_largura NUMERIC DEFAULT NULL,
    favorito BOOLEAN DEFAULT false,
    UNIQUE(loja_id, opcao)
)`);

    await client.query(`CREATE TABLE IF NOT EXISTS trilho (
        id BIGSERIAL PRIMARY KEY,
        loja_id BIGINT REFERENCES lojas(id) ON DELETE CASCADE,
        opcao TEXT NOT NULL,
        valor REAL,
        favorito BOOLEAN DEFAULT false,
        UNIQUE(loja_id, opcao)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS frete (
        id BIGSERIAL PRIMARY KEY,
        loja_id BIGINT REFERENCES lojas(id) ON DELETE CASCADE,
        opcao TEXT,
        valor REAL,
        UNIQUE(loja_id, valor)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS instalacao (
        id BIGSERIAL PRIMARY KEY,
        loja_id BIGINT REFERENCES lojas(id) ON DELETE CASCADE,
        opcao TEXT,
        valor REAL,
        UNIQUE(loja_id, valor)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS orcamentos (
        loja_id BIGINT REFERENCES lojas(id) ON DELETE CASCADE,
        client_id BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
        data JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY(loja_id, client_id)
    )`);

    console.log('Tabelas REAIS criadas (ou já existiam).');
    
    await client.query('COMMIT'); 
    console.log('\n--- SCRIPT FINALIZADO COM SUCESSO ---');
    console.log('Base de dados pronta para o registo de novos utilizadores.');

  } catch (e) {
    await client.query('ROLLBACK'); 
    console.error('Erro ao criar as tabelas. Nenhuma alteração foi feita.', e);
  } finally {
    client.release();
  }
}

criarTabelas();