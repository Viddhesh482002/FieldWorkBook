const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in .env');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  console.log('Testing Supabase connection...');
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    console.error('Supabase error:', error);
    process.exit(2);
  }
  console.log('Success. Sample row:', data);
  process.exit(0);
})();
