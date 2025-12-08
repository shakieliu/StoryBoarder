import { createClient } from '@supabase/supabase-js';

// ✅ 上线修正版：从 Vercel 环境变量读取
// 只要你在 Vercel 后台填了 VITE_SUPABASE_URL 和 VITE_SUPABASE_KEY，这里就会自动生效
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // 如果本地开发报错，请检查你本地根目录有没有 .env 文件
  throw new Error('Missing Supabase Environment Variables'); 
}

export const supabase = createClient(supabaseUrl, supabaseKey);