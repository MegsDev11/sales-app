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
          department: string | null;
          color: string;
          avatar_initials: string;
          title: string;
          monthly_revenue_target: number;
          monthly_deals_target: number;
          active: boolean;
        };
        Insert: {
          id: string;
          name: string;
          email?: string | null;
          auth_user_id?: string | null;
          role: string;
          department: string | null;
          color: string;
          avatar_initials: string;
          title: string;
          monthly_revenue_target?: number;
          monthly_deals_target?: number;
          active?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          auth_user_id?: string | null;
          role?: string;
          department?: string | null;
          color?: string;
          avatar_initials?: string;
          title?: string;
          monthly_revenue_target?: number;
          monthly_deals_target?: number;
          active?: boolean;
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
          inbox_dismissed_at: string | null;
          tower_id: string | null;
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
          inbox_dismissed_at?: string | null;
          tower_id?: string | null;
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
          inbox_dismissed_at?: string | null;
          tower_id?: string | null;
        };
        Relationships: [];
      };
      towers: {
        Row: {
          id: string;
          name: string;
          service_areas: string[];
          status: string;
          updated_at: string;
          updated_by_id: string | null;
        };
        Insert: {
          id: string;
          name: string;
          service_areas?: string[];
          status?: string;
          updated_at?: string;
          updated_by_id?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          service_areas?: string[];
          status?: string;
          updated_at?: string;
          updated_by_id?: string | null;
        };
        Relationships: [];
      };
      tower_outages: {
        Row: {
          id: string;
          tower_id: string;
          title: string;
          message: string;
          affected_areas: string[];
          started_at: string;
          resolved_at: string | null;
          created_by_id: string | null;
          is_public: boolean;
        };
        Insert: {
          id: string;
          tower_id: string;
          title: string;
          message?: string;
          affected_areas?: string[];
          started_at?: string;
          resolved_at?: string | null;
          created_by_id?: string | null;
          is_public?: boolean;
        };
        Update: {
          id?: string;
          tower_id?: string;
          title?: string;
          message?: string;
          affected_areas?: string[];
          started_at?: string;
          resolved_at?: string | null;
          created_by_id?: string | null;
          is_public?: boolean;
        };
        Relationships: [];
      };
      stock_products: {
        Row: {
          id: string;
          name: string;
          sku: string;
          brand_default: string;
          notes: string;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          sku?: string;
          brand_default?: string;
          notes?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sku?: string;
          brand_default?: string;
          notes?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      stock_items: {
        Row: {
          id: string;
          product_id: string;
          qr_token: string;
          brand: string;
          device_name: string;
          serial_number: string;
          client_name: string;
          client_pppoe: string;
          wifi_name: string;
          wifi_password: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          product_id: string;
          qr_token: string;
          brand?: string;
          device_name?: string;
          serial_number?: string;
          client_name?: string;
          client_pppoe?: string;
          wifi_name?: string;
          wifi_password?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          qr_token?: string;
          brand?: string;
          device_name?: string;
          serial_number?: string;
          client_name?: string;
          client_pppoe?: string;
          wifi_name?: string;
          wifi_password?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_bookings: {
        Row: {
          id: string;
          item_id: string;
          technician_id: string;
          lead_id: string | null;
          request_id: string | null;
          booked_out_at: string;
          booked_out_by: string | null;
          returned_at: string | null;
          notes: string;
        };
        Insert: {
          id: string;
          item_id: string;
          technician_id: string;
          lead_id?: string | null;
          request_id?: string | null;
          booked_out_at?: string;
          booked_out_by?: string | null;
          returned_at?: string | null;
          notes?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          technician_id?: string;
          lead_id?: string | null;
          request_id?: string | null;
          booked_out_at?: string;
          booked_out_by?: string | null;
          returned_at?: string | null;
          notes?: string;
        };
        Relationships: [];
      };
      stock_requests: {
        Row: {
          id: string;
          title: string;
          technician_id: string;
          lead_id: string | null;
          status: string;
          created_by: string | null;
          created_at: string;
          notes: string;
        };
        Insert: {
          id: string;
          title: string;
          technician_id: string;
          lead_id?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          notes?: string;
        };
        Update: {
          id?: string;
          title?: string;
          technician_id?: string;
          lead_id?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          notes?: string;
        };
        Relationships: [];
      };
      stock_request_lines: {
        Row: {
          id: string;
          request_id: string;
          product_id: string;
          qty_needed: number;
          qty_fulfilled: number;
        };
        Insert: {
          id: string;
          request_id: string;
          product_id: string;
          qty_needed?: number;
          qty_fulfilled?: number;
        };
        Update: {
          id?: string;
          request_id?: string;
          product_id?: string;
          qty_needed?: number;
          qty_fulfilled?: number;
        };
        Relationships: [];
      };
      stock_qr_labels: {
        Row: {
          id: string;
          batch_id: string;
          product_id: string;
          qr_token: string;
          brand: string;
          device_name: string;
          created_at: string;
          claimed_at: string | null;
          claimed_item_id: string | null;
        };
        Insert: {
          id: string;
          batch_id: string;
          product_id: string;
          qr_token: string;
          brand?: string;
          device_name?: string;
          created_at?: string;
          claimed_at?: string | null;
          claimed_item_id?: string | null;
        };
        Update: {
          id?: string;
          batch_id?: string;
          product_id?: string;
          qr_token?: string;
          brand?: string;
          device_name?: string;
          created_at?: string;
          claimed_at?: string | null;
          claimed_item_id?: string | null;
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
      app_notifications: {
        Row: {
          id: string;
          user_id: string | null;
          department: string | null;
          type: string;
          title: string;
          body: string;
          link: string;
          request_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id?: string | null;
          department?: string | null;
          type: string;
          title: string;
          body?: string;
          link?: string;
          request_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          department?: string | null;
          type?: string;
          title?: string;
          body?: string;
          link?: string;
          request_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_stock_qr_label: {
        Args: {
          p_qr_token: string;
          p_serial_number?: string;
          p_item_id?: string;
        };
        Returns: Json;
      };
      return_stock_item_by_qr: {
        Args: {
          p_qr_token: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];
export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
export type TowerRow = Database["public"]["Tables"]["towers"]["Row"];
export type TowerOutageRow = Database["public"]["Tables"]["tower_outages"]["Row"];
export type StockProductRow = Database["public"]["Tables"]["stock_products"]["Row"];
export type StockItemRow = Database["public"]["Tables"]["stock_items"]["Row"];
export type StockBookingRow = Database["public"]["Tables"]["stock_bookings"]["Row"];
export type StockRequestRow = Database["public"]["Tables"]["stock_requests"]["Row"];
export type StockRequestLineRow = Database["public"]["Tables"]["stock_request_lines"]["Row"];
export type StockQrLabelRow = Database["public"]["Tables"]["stock_qr_labels"]["Row"];
export type AppNotificationRow = Database["public"]["Tables"]["app_notifications"]["Row"];
