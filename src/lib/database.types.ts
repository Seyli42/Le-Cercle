/**
 * Types of the Supabase database, maintained by hand next to supabase/migrations so that
 * CHECK constraints become precise unions (`supabase gen types` would only say `string`).
 * Update this file in the same commit as any migration.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MedicationForm =
  'tablet' | 'capsule' | 'liquid' | 'drops' | 'injection' | 'inhaler' | 'patch' | 'cream' | 'other';
export type DoseStatus = 'pending' | 'taken' | 'snoozed' | 'skipped' | 'missed';
export type ConsentStatus = 'pending' | 'confirmed' | 'revoked';
export type AlertStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'cancelled';

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13';
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          timezone: string;
          missed_dose_delay_minutes: number;
          health_data_consent_at: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          first_name?: string | null;
          timezone?: string;
          missed_dose_delay_minutes?: number;
          health_data_consent_at?: string | null;
        };
        Relationships: [];
      };
      medications: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          form: MedicationForm;
          dose_label: string;
          starts_on: string;
          ends_on: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          client_updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          form?: MedicationForm;
          dose_label: string;
          starts_on?: string;
          ends_on?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
          client_updated_at?: string;
        };
        Update: {
          name?: string;
          form?: MedicationForm;
          dose_label?: string;
          starts_on?: string;
          ends_on?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
          client_updated_at?: string;
        };
        Relationships: [];
      };
      schedules: {
        Row: {
          id: string;
          user_id: string;
          medication_id: string;
          time_of_day: string;
          days_of_week: number[];
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          client_updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          medication_id: string;
          time_of_day: string;
          days_of_week?: number[];
          deleted_at?: string | null;
          client_updated_at?: string;
        };
        Update: {
          time_of_day?: string;
          days_of_week?: number[];
          deleted_at?: string | null;
          client_updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'schedules_medication_fk';
            columns: ['medication_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'medications';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      dose_events: {
        Row: {
          id: string;
          user_id: string;
          medication_id: string;
          schedule_id: string;
          scheduled_at: string;
          status: DoseStatus;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
          client_updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          medication_id: string;
          schedule_id: string;
          scheduled_at: string;
          status?: DoseStatus;
          responded_at?: string | null;
          client_updated_at?: string;
        };
        Update: {
          status?: DoseStatus;
          responded_at?: string | null;
          client_updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dose_events_medication_fk';
            columns: ['medication_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'medications';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'dose_events_schedule_fk';
            columns: ['schedule_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'schedules';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      circle_members: {
        Row: {
          id: string;
          user_id: string;
          first_name: string;
          phone_e164: string;
          consent_status: ConsentStatus;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          /** invite_code is deliberately absent: not readable from the app. */
          invite_sent_at: string | null;
          invites_sent: number;
          confirmed_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          first_name: string;
          phone_e164: string;
        };
        Update: {
          first_name?: string;
          phone_e164?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      alerts_sent: {
        Row: {
          id: string;
          user_id: string;
          dose_event_id: string;
          circle_member_id: string;
          channel: 'sms';
          provider_message_id: string | null;
          status: AlertStatus;
          error_code: string | null;
          attempts: number;
          claimed_at: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      sync_push: {
        Args: { p_medications?: Json; p_schedules?: Json; p_dose_events?: Json };
        Returns: Json;
      };
      sync_pull: {
        Args: { p_cursors?: Json; p_limit?: number };
        Returns: Json;
      };
      sync_heartbeat: {
        Args: { p_timezone: string };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database['public']['Tables'];
export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row'];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert'];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update'];
