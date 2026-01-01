# Supabase Storage Setup Guide

This guide will help you configure Supabase Storage for the FieldWorkBook application to store expense attachments.

## ✅ What Has Been Changed

The application has been updated to use **Supabase Storage** instead of local file storage. All new expense attachments will be uploaded to your Supabase Storage bucket named `Expense_Attachments`.

### Changes Made:
1. ✅ File uploads now go to Supabase Storage bucket
2. ✅ File downloads fetch from Supabase Storage
3. ✅ Backward compatibility maintained for old local files
4. ✅ Partner report initial amount calculation fixed

---

## 📋 Prerequisites

1. **Supabase Project**: You already have a Supabase project
2. **Storage Bucket**: The bucket `Expense_Attachments` is already created
3. **Environment Variables**: Ensure your `.env` file has the correct Supabase credentials

---

## 🔧 Step-by-Step Configuration

### Step 1: Verify Environment Variables

Make sure your `.env` file contains:

```env
SUPABASE_URL=https://cautprwyzespowrierqs.supabase.co
SUPABASE_SERVICE_ROLE=your_service_role_key_here
```

**Important**: You need the **Service Role Key** (not the anon key) for server-side operations.

### Step 2: Configure Storage Bucket Permissions

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/cautprwyzespowrierqs/storage/buckets

2. Click on the `Expense_Attachments` bucket

3. **Set Bucket Policies**:

   **Option A: Public Bucket (Easier, but less secure)**
   - Go to "Policies" tab
   - Make sure the bucket is set to "Public"
   - This allows direct access to files (if needed)

   **Option B: Private Bucket (Recommended)**
   - Keep bucket as "Private"
   - The application uses Service Role Key to access files
   - More secure as files are only accessible through the API

4. **Storage Policies** (if using Row Level Security):

   You can create policies to control access, but since we're using Service Role Key on the server, policies are optional.

### Step 3: Test the Configuration

1. **Start your server**:
   ```bash
   npm start
   ```

2. **Test file upload**:
   - Login as a field staff user
   - Add a new expense with an attachment
   - Check the Supabase Storage dashboard to verify the file was uploaded

3. **Test file download**:
   - Click on an attachment in the expenses list
   - Verify the file previews/downloads correctly

---

## 🔍 How It Works

### File Upload Flow:
```
User selects file
    ↓
Frontend sends FormData to /api/expenses
    ↓
Server receives file in memory (multer memoryStorage)
    ↓
Server uploads to Supabase Storage:
    - Bucket: Expense_Attachments
    - Path: userId/expense-timestamp-random.ext
    ↓
File path stored in expenses.attachment_path
    ↓
File is accessible via /api/download/:path
```

### File Download Flow:
```
User clicks attachment
    ↓
Frontend calls /api/download/:path
    ↓
Server verifies user access
    ↓
Server downloads file from Supabase Storage
    ↓
File streamed to user's browser
```

---

## 📁 File Organization

Files are organized in Supabase Storage as:
```
Expense_Attachments/
  ├── user_id_1/
  │   ├── expense-1234567890-123456789.jpg
  │   └── expense-1234567891-987654321.pdf
  ├── user_id_2/
  │   └── expense-1234567892-456789123.png
  └── ...
```

This organization:
- Groups files by user
- Makes it easier to manage and clean up
- Prevents filename conflicts

---

## 🔒 Security Considerations

1. **Service Role Key**: 
   - Keep your `SUPABASE_SERVICE_ROLE` key secret
   - Never expose it in client-side code
   - It has full access to your Supabase project

2. **Access Control**:
   - The application verifies user access before serving files
   - Field staff can only access their team's files
   - Admin/Partner can access all files

3. **File Validation**:
   - Only images (JPG, PNG, GIF) and PDFs are allowed
   - Maximum file size: 5MB
   - File type is validated on upload

---

## 🐛 Troubleshooting

### Issue: "File not found in storage"

**Possible causes:**
1. Bucket name mismatch - verify it's exactly `Expense_Attachments`
2. Service Role Key incorrect - check your `.env` file
3. File path in database doesn't match storage path

**Solution:**
- Check Supabase dashboard to verify bucket exists
- Verify environment variables are loaded correctly
- Check server logs for detailed error messages

### Issue: "Failed to upload attachment"

**Possible causes:**
1. Bucket doesn't exist
2. Insufficient permissions
3. File size exceeds limit

**Solution:**
- Create the bucket in Supabase Storage dashboard
- Check bucket policies/permissions
- Verify file size is under 5MB

### Issue: Old files not working

**Solution:**
- Old files stored locally will still work
- The system automatically detects if a file is local or in Supabase
- New files will always use Supabase Storage

---

## 📊 Migration from Local Storage

If you have existing files in the `uploads/` folder:

1. **Option 1: Keep Both** (Current Implementation)
   - Old files remain in `uploads/` folder
   - System automatically detects and serves from correct location
   - New files go to Supabase Storage

2. **Option 2: Migrate All Files** (Manual)
   - You can write a migration script to upload all existing files to Supabase
   - Update database records with new paths
   - Remove `uploads/` folder after migration

---

## ✅ Verification Checklist

- [ ] Supabase Storage bucket `Expense_Attachments` exists
- [ ] Environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`) are set
- [ ] Server starts without errors
- [ ] Can upload a new expense with attachment
- [ ] Can preview/download attachments
- [ ] Old local files still work (if any exist)

---

## 🎯 Next Steps

1. **Test thoroughly** with different file types (JPG, PNG, PDF)
2. **Monitor storage usage** in Supabase dashboard
3. **Set up storage limits** if needed (Supabase has free tier limits)
4. **Consider cleanup policies** for old files (optional)

---

## 📝 Code Changes Summary

### Server Changes (`server.js`):
- Changed multer to use `memoryStorage()` instead of `diskStorage()`
- Updated `/api/expenses` to upload to Supabase Storage
- Updated `/api/download/:filename` to fetch from Supabase Storage
- Added `/api/preview/:filename` for file previews
- Fixed partner report initial amount calculation

### Frontend Changes (`public/js/app.js`):
- Updated `showFilePreview()` to use API endpoints instead of direct file access
- Changed download links to use `/api/download/` endpoint

---

## 🆘 Support

If you encounter any issues:

1. Check server console logs for error messages
2. Verify Supabase Storage bucket exists and is accessible
3. Test with a simple file upload first
4. Check browser console for frontend errors

---

**Note**: The bucket name is hardcoded as `Expense_Attachments` in the code. If you need to change it, update the `STORAGE_BUCKET` constant in `server.js`.

