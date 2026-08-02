export type ChatConversationType = 'direct' | 'group' | 'system';
export type ChatMemberRole = 'owner' | 'admin' | 'member';
export type ChatMemberStatus = 'active' | 'removed' | 'left';
export type ChatMessageType = 'text' | 'image' | 'file' | 'system';
export type ChatMessageStatus = 'sending' | 'sent' | 'failed' | 'edited' | 'deleted';

export type ChatConversationRow = {
  id: string;
  tenant_id: string;
  type: ChatConversationType;
  title: string | null;
  created_by: string | null;
  last_message_id: string | null;
  last_message_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ChatConversationMemberRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  user_id: string;
  role: ChatMemberRole;
  status: ChatMemberStatus;
  muted_at: string | null;
  pinned_at: string | null;
  last_read_message_id: string | null;
  last_read_at: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string;
  message_type: ChatMessageType;
  attachment_ids: string[];
  reply_to_id: string | null;
  status: ChatMessageStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type ChatSocketUser = {
  id: string;
  email?: string;
};

