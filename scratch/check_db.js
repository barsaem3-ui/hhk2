import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mntkqjglpzkhokbfpjcl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udGtxamdscHpraG9rYmZwamNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDAwNjMsImV4cCI6MjA5NDE3NjA2M30.CeOFhlNX-Vi44toM5tpxAlxZLaNrkbv-XlXbtwkpJZU';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkColumns() {
    const { data, error } = await supabase.from('comments').select('*').limit(1);
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Available columns in comments table:', Object.keys(data[0] || {}));
    }
}

checkColumns();
