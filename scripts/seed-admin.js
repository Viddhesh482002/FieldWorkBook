const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !key) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in .env');
      process.exit(1);
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const username = 'admin';
    const plain = 'admin123';
    const hash = bcrypt.hashSync(plain, 10);

    const { data: existing, error: findErr } = await supabase
      .from('users')
      .select('id, username')
      .eq('username', username)
      .limit(1);
    if (findErr) throw findErr;

    if (existing && existing.length) {
      const { error: updErr } = await supabase
        .from('users')
        .update({ password: hash, role: 'admin', full_name: 'System Administrator', email: 'admin@fieldworkbook.com' })
        .eq('id', existing[0].id);
      if (updErr) throw updErr;
      console.log('Updated existing admin user. Username: admin, Password: admin123');
    } else {
      const { error: insErr } = await supabase
        .from('users')
        .insert([{ username, password: hash, role: 'admin', full_name: 'System Administrator', email: 'admin@fieldworkbook.com', team_id: null }]);
      if (insErr) throw insErr;
      console.log('Inserted admin user. Username: admin, Password: admin123');
    }
    process.exit(0);
  } catch (e) {
    console.error('Seed error:', e);
    process.exit(2);
  }
})();
