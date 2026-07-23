import type { LowCodePageSchema } from '~/types/lowcode';

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
  role: 'student' | 'parent' | 'teacher' | 'consultant' | 'admin';
  city: string | null;
  english_level: string | null;
  learning_goal: string | null;
  source_channel: string | null;
  lead_status:
    | 'new'
    | 'contacted'
    | 'trial_booked'
    | 'trial_done'
    | 'converted'
    | 'lost';
  assigned_consultant_id: string | null;
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

export type LeadEventRow = {
  id: string;
  user_id: string;
  event_type: string;
  event_data: Json;
  created_at: string;
};

export type CourseRow = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_url: string | null;
  level: string | null;
  age_group: 'kids' | 'teen' | 'adult' | null;
  course_type: 'free' | 'paid' | 'trial';
  status: 'draft' | 'published' | 'hidden';
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CourseSectionRow = {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  created_at: string;
};

export type LessonRow = {
  id: string;
  course_id: string;
  section_id: string | null;
  title: string;
  description: string | null;
  video_url: string | null;
  duration_seconds: number;
  lesson_type: 'video' | 'quiz' | 'speaking_task';
  is_free: boolean;
  sort_order: number;
  status: 'draft' | 'published' | 'hidden';
  created_at: string;
  updated_at: string;
};

export type CourseEnrollmentRow = {
  id: string;
  user_id: string;
  course_id: string;
  source: 'free_signup' | 'consultant' | 'trial_package' | 'manual';
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  created_at: string;
  updated_at: string;
};

export type LessonProgressRow = {
  id: string;
  user_id: string;
  lesson_id: string;
  progress_seconds: number;
  progress_percent: number;
  completed_at: string | null;
  last_watched_at: string;
  updated_at: string;
};

export type AiScenarioRow = {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  scene_type: 'daily' | 'travel' | 'business' | 'interview' | 'ielts' | 'kids';
  system_prompt: string;
  opening_message: string | null;
  status: 'draft' | 'published' | 'hidden';
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AiConversationRow = {
  id: string;
  user_id: string;
  scenario_id: string | null;
  title: string | null;
  status: 'active' | 'ended';
  score: number | null;
  feedback: string | null;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
};

export type AiMessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  audio_url: string | null;
  pronunciation_score: number | null;
  grammar_feedback: string | null;
  vocabulary_feedback: string | null;
  created_at: string;
};

export type SpeechAssessmentRow = {
  id: string;
  user_id: string;
  message_id: string | null;
  transcript: string | null;
  fluency_score: number | null;
  pronunciation_score: number | null;
  accuracy_score: number | null;
  feedback: Json;
  created_at: string;
};

export type TeacherRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  intro: string | null;
  avatar_url: string | null;
  specialties: string[];
  levels: string[];
  online_status: 'online' | 'busy' | 'offline';
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

export type ChatSessionRow = {
  id: string;
  student_id: string;
  teacher_id: string | null;
  session_type: 'text' | 'voice' | 'video';
  provider: string | null;
  provider_session_id: string | null;
  status: 'waiting' | 'active' | 'ended' | 'cancelled';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  session_id: string;
  sender_id: string;
  message_type: 'text' | 'image' | 'audio' | 'file' | 'system';
  content: string | null;
  media_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type CampusRow = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

export type TrialClassRow = {
  id: string;
  campus_id: string;
  course_id: string | null;
  teacher_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  status: 'open' | 'full' | 'cancelled' | 'finished';
  created_at: string;
  updated_at: string;
};

export type TrialBookingRow = {
  id: string;
  user_id: string;
  trial_class_id: string | null;
  campus_id: string;
  student_name: string;
  student_age: number | null;
  parent_phone: string;
  learning_goal: string | null;
  status: 'submitted' | 'confirmed' | 'attended' | 'no_show' | 'converted' | 'cancelled';
  consultant_id: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsultantTaskRow = {
  id: string;
  consultant_id: string | null;
  user_id: string;
  booking_id: string | null;
  task_type: 'call' | 'wechat' | 'reminder' | 'follow_up';
  status: 'pending' | 'done' | 'cancelled';
  due_at: string | null;
  completed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversionRecordRow = {
  id: string;
  user_id: string;
  booking_id: string | null;
  consultant_id: string | null;
  product_name: string;
  amount: number;
  status: 'pending' | 'paid' | 'refunded' | 'cancelled';
  converted_at: string | null;
  created_at: string;
  updated_at: string;
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
  status: 'active' | 'inactive';
  sort_order: number;
  schema: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
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
          city?: string | null;
          english_level?: string | null;
          learning_goal?: string | null;
          source_channel?: string | null;
          lead_status?: UserDetailsRow['lead_status'];
          assigned_consultant_id?: string | null;
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
          city?: string | null;
          english_level?: string | null;
          learning_goal?: string | null;
          source_channel?: string | null;
          lead_status?: UserDetailsRow['lead_status'];
          assigned_consultant_id?: string | null;
          updated_at?: string | null;
        };
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: never;
        Update: never;
      };
      lead_events: TableDefinition<LeadEventRow>;
      courses: TableDefinition<CourseRow>;
      course_sections: TableDefinition<CourseSectionRow>;
      lessons: TableDefinition<LessonRow>;
      course_enrollments: TableDefinition<CourseEnrollmentRow>;
      lesson_progress: TableDefinition<LessonProgressRow>;
      ai_scenarios: TableDefinition<AiScenarioRow>;
      ai_conversations: TableDefinition<AiConversationRow>;
      ai_messages: TableDefinition<AiMessageRow>;
      speech_assessments: TableDefinition<SpeechAssessmentRow>;
      teachers: TableDefinition<TeacherRow>;
      chat_sessions: TableDefinition<ChatSessionRow>;
      chat_messages: TableDefinition<ChatMessageRow>;
      campuses: TableDefinition<CampusRow>;
      trial_classes: TableDefinition<TrialClassRow>;
      trial_bookings: TableDefinition<TrialBookingRow>;
      consultant_tasks: TableDefinition<ConsultantTaskRow>;
      conversion_records: TableDefinition<ConversionRecordRow>;
      admin_roles: TableDefinition<AdminRoleRow>;
      admin_permissions: TableDefinition<AdminPermissionRow>;
      admin_role_permissions: TableDefinition<AdminRolePermissionRow>;
      admin_user_roles: TableDefinition<AdminUserRoleRow>;
      admin_routes: TableDefinition<AdminRouteRow>;
      admin_entities: TableDefinition<AdminEntityRow>;
      lowcode_pages: TableDefinition<LowCodePageRow>;
      lowcode_page_versions: TableDefinition<LowCodePageVersionRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
