// ─────────────────────────────────────────────────────────────
//  Thought Board — configuration
//  Leave SUPABASE_URL / SUPABASE_ANON_KEY empty to run in
//  "Local mode" (data kept only in this browser, no sharing).
//  Fill them in (see README, step 3) to use the free online DB.
//  The anon/publishable key is safe to publish: row-level
//  security in supabase/schema.sql protects your data.
// ─────────────────────────────────────────────────────────────
var CONFIG = {
  APP_NAME: 'Thought Board',

  SUPABASE_URL: 'https://znykehhdlrtirqhefegv.supabase.co',        // e.g. 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: 'sb_publishable_NOi7IRYCKXaTzXG8snwQew_TOaDhQP0',   // anon / publishable key from Project Settings → API

  CURRENCY: 'INR',         // used for Planned cost
  LOCALE: 'en-IN',         // number & date formatting
  WORD_LIMIT: 250,         // Description / Objective
};
