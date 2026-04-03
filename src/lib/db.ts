import { supabaseAdmin } from "../config/supabase";

const getAdminClient = () => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for database operations");
  }

  return supabaseAdmin;
};

export { getAdminClient };
