import type {
  LowCodePageRelateConfig,
  LowCodePageSchema,
  LowCodePageType
} from '@enlearn/lowcode-framework/types/lowcode';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PostRow = {
  id: number;
  user_id: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string;
};

export type UserDetailsRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  billing_address: Json | null;
  payment_method: Json | null;
  phone: string | null;
  nickname: string | null;
  role: 'user' | 'admin';
  updated_at: string | null;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  status: string | null;
  current_period_end: string;
  price_id: string | null;
  prices?: {
    unit_amount: number | null;
    interval: string | null;
    products?: {
      name: string | null;
    } | null;
  } | null;
};

export type AiConversationRow = {
  id: string;
  account_id: string;
  created_by: string;
  title: string;
  mode: 'ask' | 'create_page' | 'edit_page' | 'generate_button' | 'generate_function';
  page_ref: Json;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
};

export type AiMessageRow = {
  id: string;
  account_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id: string | null;
  metadata: Json;
  created_at: string;
};

export type ChatMessageRow = {
  id: string;
  account_id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system';
  attachment_ids: string[];
  reply_to_id: string | null;
  status: 'sending' | 'sent' | 'failed' | 'edited' | 'deleted';
  metadata: Json;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type AdminRoleRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  is_system: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminPermissionRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  resource_type: 'page' | 'route' | 'entity' | 'api' | 'menu' | 'action';
  resource_key: string | null;
  action_code: string | null;
  route_path: string | null;
  page_code: string | null;
  entity_code: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminRolePermissionRow = {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
};

export type AdminUserRoleRow = {
  id: string;
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  created_at: string;
};

export type AdminUserPermissionRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  nickname: string | null;
  legacy_profile_role: UserDetailsRow['role'] | string | null;
  updated_at: string | null;
  app_role_codes: string[];
  app_role_names: string;
  role_codes: string[];
  role_names: string;
  permission_codes: string[];
  permission_names: string;
  permission_count: number;
  account_ids: string[];
  account_names: string;
  account_roles: string[];
  account_count: number;
  is_primary_account_owner: boolean;
};

export type AdminRouteRow = {
  id: string;
  code: string;
  title: string;
  path: string;
  parent_id: string | null;
  route_type: 'group' | 'page' | 'link';
  icon: string | null;
  page_code: string | null;
  permission_code: string | null;
  visible: boolean;
  keep_alive: boolean;
  layout: 'default' | 'dashboard' | 'blank';
  status: 'active' | 'inactive';
  sort_order: number;
  metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminEntityRow = {
  id: string;
  code: string;
  title: string;
  table_name: string;
  route_path: string;
  page_code: string | null;
  icon: string | null;
  description: string | null;
  primary_key: string;
  query_sql: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  schema: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SystemConfigRow = {
  id: string;
  user_id: string;
  theme_mode: 'light' | 'dark' | 'system';
  primary_color: string;
  theme_config: Json;
  table_config: Json;
  language: string;
  locale_config: Json;
  feature_flags: Json;
  metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BasejumpAccountRole = 'owner' | 'member';

export type BasejumpConfigRow = {
  singleton: boolean;
  enable_team_accounts: boolean;
  enable_personal_account_billing: boolean;
  enable_team_account_billing: boolean;
  billing_provider: string;
};

export type BasejumpAccountRow = {
  id: string;
  primary_owner_user_id: string;
  name: string | null;
  slug: string | null;
  personal_account: boolean;
  private_metadata: Json;
  public_metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type BasejumpAccountUserRow = {
  user_id: string;
  account_id: string;
  account_role: BasejumpAccountRole;
  created_at: string;
};

export type LowCodePageRow = {
  id: string;
  code: string;
  route: string;
  title: string;
  description: string | null;
  layout: 'default' | 'dashboard' | 'blank';
  status: 'draft' | 'published' | 'archived';
  keep_alive: boolean;
  page_type: LowCodePageType;
  edit_page_id: string | null;
  view_name: string | null;
  table_name: string | null;
  relate_config: LowCodePageRelateConfig;
  schema: LowCodePageSchema;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LowCodePageVersionRow = {
  id: string;
  page_id: string;
  version: number;
  schema: LowCodePageSchema;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
};

export type LowCodeFormDefinitionRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  schema: Json;
  enabled: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export interface Database {
  public: {
    Tables: {
      posts: {
        Row: PostRow;
        Insert: {
          id?: never;
          user_id: string;
          title: string;
          content?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          title?: string;
          content?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: UserDetailsRow;
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          billing_address?: Json | null;
          payment_method?: Json | null;
          phone?: string | null;
          nickname?: string | null;
          role?: UserDetailsRow['role'];
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          billing_address?: Json | null;
          payment_method?: Json | null;
          phone?: string | null;
          nickname?: string | null;
          role?: UserDetailsRow['role'];
          updated_at?: string | null;
        };
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: never;
        Update: never;
      };
      ai_conversations: TableDefinition<AiConversationRow>;
      ai_messages: TableDefinition<AiMessageRow>;
      chat_messages: TableDefinition<ChatMessageRow>;
      admin_roles: TableDefinition<AdminRoleRow>;
      admin_permissions: TableDefinition<AdminPermissionRow>;
      admin_role_permissions: TableDefinition<AdminRolePermissionRow>;
      admin_user_roles: TableDefinition<AdminUserRoleRow>;
      admin_routes: TableDefinition<AdminRouteRow>;
      admin_entities: TableDefinition<AdminEntityRow>;
      system_config: TableDefinition<SystemConfigRow>;
      lowcode_pages: TableDefinition<LowCodePageRow>;
      lowcode_page_versions: TableDefinition<LowCodePageVersionRow>;
      lowcode_form_definitions: TableDefinition<LowCodeFormDefinitionRow>;
    };
    Views: Record<string, never>;
    Functions: {
      add_account_member: {
        Args: {
          account_id: string;
          user_id: string;
          account_role?: BasejumpAccountRole;
        };
        Returns: undefined;
      };
      create_account: {
        Args: {
          slug?: string | null;
          name?: string | null;
        };
        Returns: Json;
      };
      current_user_account_role: {
        Args: {
          account_id: string;
        };
        Returns: Json;
      };
      current_user_permission_codes: {
        Args: Record<string, never>;
        Returns: string[];
      };
      get_account: {
        Args: {
          account_id: string;
        };
        Returns: Json;
      };
      get_account_by_slug: {
        Args: {
          slug: string;
        };
        Returns: Json;
      };
      get_account_id: {
        Args: {
          slug: string;
        };
        Returns: string;
      };
      get_account_members: {
        Args: {
          account_id: string;
          results_limit?: number;
          results_offset?: number;
        };
        Returns: Json;
      };
      get_accounts: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_admin_user_permission_rows: {
        Args: Record<string, never>;
        Returns: AdminUserPermissionRow[];
      };
      get_system_config: {
        Args: Record<string, never>;
        Returns: Json;
      };
      has_app_permission: {
        Args: {
          permission_code: string;
        };
        Returns: boolean;
      };
      remove_account_member: {
        Args: {
          account_id: string;
          user_id: string;
        };
        Returns: undefined;
      };
      update_account: {
        Args: {
          account_id: string;
          slug?: string | null;
          name?: string | null;
          public_metadata?: Json | null;
          replace_metadata?: boolean;
        };
        Returns: Json;
      };
      update_account_user_role: {
        Args: {
          account_id: string;
          user_id: string;
          new_account_role: BasejumpAccountRole;
          make_primary_owner?: boolean;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
  };
  basejump: {
    Tables: {
      config: TableDefinition<BasejumpConfigRow>;
      accounts: TableDefinition<BasejumpAccountRow>;
      account_user: TableDefinition<BasejumpAccountUserRow>;
    };
    Views: Record<string, never>;
    Functions: {
      get_config: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_accounts_with_role: {
        Args: {
          passed_in_role?: BasejumpAccountRole | null;
        };
        Returns: string[];
      };
      has_role_on_account: {
        Args: {
          account_id: string;
          account_role?: BasejumpAccountRole | null;
        };
        Returns: boolean;
      };
      is_set: {
        Args: {
          field_name: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      account_role: BasejumpAccountRole;
    };
  };
}
