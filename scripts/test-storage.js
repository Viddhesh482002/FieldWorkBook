// Quick test script to verify Supabase Storage configuration
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const STORAGE_BUCKET = 'Expense_Attachments';

console.log('🧪 Testing Supabase Storage Configuration...\n');

// Check environment variables
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.error('❌ Missing environment variables!');
    console.log('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE in your .env file');
    process.exit(1);
}

console.log('✅ Environment variables found');
console.log(`   SUPABASE_URL: ${SUPABASE_URL.substring(0, 30)}...`);

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false }
});

// Test bucket access
async function testStorage() {
    try {
        console.log('\n📦 Testing Storage Bucket Access...');
        
        // List buckets to verify access
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();
        
        if (listError) {
            console.error('❌ Error accessing storage:', listError.message);
            console.log('\n💡 Possible issues:');
            console.log('   - Service Role Key is incorrect');
            console.log('   - Supabase project URL is wrong');
            return;
        }
        
        console.log('✅ Storage access successful');
        console.log(`   Found ${buckets.length} bucket(s)`);
        
        // Check if Expense_Attachments bucket exists
        const targetBucket = buckets.find(b => b.name === STORAGE_BUCKET);
        
        if (!targetBucket) {
            console.error(`\n❌ Bucket "${STORAGE_BUCKET}" not found!`);
            console.log('\n💡 Solution:');
            console.log(`   1. Go to Supabase Dashboard → Storage → Buckets`);
            console.log(`   2. Create a new bucket named: ${STORAGE_BUCKET}`);
            console.log(`   3. Set it to Private (recommended) or Public`);
            return;
        }
        
        console.log(`✅ Bucket "${STORAGE_BUCKET}" exists`);
        console.log(`   Public: ${targetBucket.public ? 'Yes' : 'No'}`);
        
        // Test file upload (small test file)
        console.log('\n📤 Testing file upload...');
        const testContent = Buffer.from('Test file for FieldWorkBook');
        const testFileName = `test-${Date.now()}.txt`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(`test/${testFileName}`, testContent, {
                contentType: 'text/plain',
                upsert: false
            });
        
        if (uploadError) {
            console.error('❌ Upload test failed:', uploadError.message);
            console.log('\n💡 Possible issues:');
            console.log('   - Bucket permissions are incorrect');
            console.log('   - Service Role Key doesn\'t have storage access');
            return;
        }
        
        console.log('✅ Upload test successful');
        console.log(`   Test file uploaded: ${uploadData.path}`);
        
        // Clean up test file
        const { error: deleteError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([`test/${testFileName}`]);
        
        if (deleteError) {
            console.warn('⚠️  Could not delete test file (not critical)');
        } else {
            console.log('✅ Test file cleaned up');
        }
        
        console.log('\n🎉 All tests passed! Your Supabase Storage is configured correctly.');
        console.log('\n📝 Next steps:');
        console.log('   1. Start your server: npm start');
        console.log('   2. Try uploading an expense with attachment');
        console.log('   3. Check Supabase Storage dashboard to verify files');
        
    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
    }
}

testStorage();

