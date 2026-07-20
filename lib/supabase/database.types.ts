import type { StageHistoryEntry } from "@/lib/types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      team_members: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          auth_user_id: string | null;
          role: string;
          color: string;
          avatar_initials: string;
          title: string;
          monthly_revenue_target: number;
          monthly_deals_target: number;
        };
        Insert: {
          id: string;
          name: string;
          email?: string | null;
          auth_user_id?: string | null;
          role: string;
          color: string;
          avatar_initials: string;
          title: string;
          monthly_revenue_target?: number;
          monthly_deals_target?: number;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          auth_user_id?: string | null;
          role?: string;
          color?: string;
          avatar_initials?: string;
          title?: string;
          monthly_revenue_target?: number;
          monthly_deals_target?: number;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          client_name: string;
          company: string | null;
          phone: string;
          email: string;
          service_type: string;
          package_tier: string;
          assigned_to_id: string | null;
          stage: string;
          current_activity: string;
          priority: string;
          created_at: string;
          stage_entered_at: string;
          closed_at: string | null;
          deal_value: number | null;
          discount: number | null;
          lead_source: string;
          address: string | null;
          notes: string | null;
          deleted: boolean;
          next_follow_up_at: string | null;
          next_action: string | null;
          coverage_status: string;
          service_zone: string;
          site_survey_date: string | null;
          site_survey_notes: string | null;
          lost_reason: string | null;
          installation_status: string | null;
          installation_date: string | null;
          temperature: string;
          stage_history: StageHistoryEntry[];
        };
        Insert: {
          id: string;
          client_name: string;
          company?: string | null;
          phone?: string;
          email?: string;
          service_type?: string;
          package_tier?: string;
          assigned_to_id?: string | null;
          stage?: string;
          current_activity?: string;
          priority?: string;
          created_at?: string;
          stage_entered_at?: string;
          closed_at?: string | null;
          deal_value?: number | null;
          discount?: number | null;
          lead_source?: string;
          address?: string | null;
          notes?: string | null;
          deleted?: boolean;
          next_follow_up_at?: string | null;
          next_action?: string | null;
          coverage_status?: string;
          service_zone?: string;
          site_survey_date?: string | null;
          site_survey_notes?: string | null;
          lost_reason?: string | null;
          installation_status?: string | null;
          installation_date?: string | null;
          temperature?: string;
          stage_history?: StageHistoryEntry[];
        };
        Update: {
          id?: string;
          client_name?: string;
          company?: string | null;
          phone?: string;
          email?: string;
          service_type?: string;
          package_tier?: string;
          assigned_to_id?: string | null;
          stage?: string;
          current_activity?: string;
          priority?: string;
          created_at?: string;
          stage_entered_at?: string;
          closed_at?: string | null;
          deal_value?: number | null;
          discount?: number | null;
          lead_source?: string;
          address?: string | null;
          notes?: string | null;
          deleted?: boolean;
          next_follow_up_at?: string | null;
          next_action?: string | null;
          coverage_status?: string;
          service_zone?: string;
          site_survey_date?: string | null;
          site_survey_notes?: string | null;
          lost_reason?: string | null;
          installation_status?: string | null;
          installation_date?: string | null;
          temperature?: string;
          stage_history?: StageHistoryEntry[];
        };
        Relationships: [];
      };
      activities: {
        Row: {
          id: string;
          lead_id: string;
          type: string;
          title: string;
          created_at: string;
        };
        Insert: {
          id: string;
          lead_id: string;
          type: string;
          title: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          type?: string;
          title?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];
export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
