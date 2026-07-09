const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres.tyixoquzxuclxvbokhif:jgcv123456A%25@aws-1-us-east-2.pooler.supabase.com:5432/postgres' });
pool.query("NOTIFY pgrst, 'reload schema'")
  .then(() => console.log('Schema Reloaded'))
  .catch(console.error)
  .finally(() => pool.end());
