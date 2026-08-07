export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          created_at: string
          full_name: string
          id: string
          license_category: string
          license_number: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          license_category?: string
          license_number: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          license_category?: string
          license_number?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          enabled: boolean
          from_email: string
          from_name: string
          id: boolean
          provider: string
          reply_to: string | null
          smtp_encryption: string
          smtp_host: string | null
          smtp_port: number | null
          smtp_user: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          from_email?: string
          from_name?: string
          id?: boolean
          provider?: string
          reply_to?: string | null
          smtp_encryption?: string
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          from_email?: string
          from_name?: string
          id?: boolean
          provider?: string
          reply_to?: string | null
          smtp_encryption?: string
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          audience: string
          created_at: string
          event_type: string
          id: string
          protocol: string
          provider: string
          reason: string | null
          recipient: string
          requester_email: string | null
          status: string
          subject: string
        }
        Insert: {
          audience: string
          created_at?: string
          event_type: string
          id?: string
          protocol: string
          provider: string
          reason?: string | null
          recipient: string
          requester_email?: string | null
          status: string
          subject: string
        }
        Update: {
          audience?: string
          created_at?: string
          event_type?: string
          id?: string
          protocol?: string
          provider?: string
          reason?: string | null
          recipient?: string
          requester_email?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      trip_logs: {
        Row: {
          created_at: string
          created_by: string
          departure_at: string | null
          departure_km: number | null
          fuel_liters: number | null
          id: string
          incidents: string | null
          request_id: string
          return_at: string | null
          return_km: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          departure_at?: string | null
          departure_km?: number | null
          fuel_liters?: number | null
          id?: string
          incidents?: string | null
          request_id: string
          return_at?: string | null
          return_km?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          departure_at?: string | null
          departure_km?: number | null
          fuel_liters?: number | null
          id?: string
          incidents?: string | null
          request_id?: string
          return_at?: string | null
          return_km?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "vehicle_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          audience: string
          body: string
          created_at: string
          event_type: string
          id: string
          protocol: string | null
          read_at: string | null
          recipient_email: string
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          event_type: string
          id?: string
          protocol?: string | null
          read_at?: string | null
          recipient_email: string
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          event_type?: string
          id?: string
          protocol?: string | null
          read_at?: string | null
          recipient_email?: string
          title?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_requests: {
        Row: {
          agenda: string
          assigned_driver_id: string | null
          assigned_vehicle_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          destination: string
          id: string
          needs_driver: boolean
          notes: string | null
          passengers_count: number
          pickup_at: string
          protocol: string
          requester_email: string
          requester_id: string
          return_at: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          agenda: string
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          destination: string
          id?: string
          needs_driver?: boolean
          notes?: string | null
          passengers_count?: number
          pickup_at: string
          protocol?: string
          requester_email: string
          requester_id: string
          return_at: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          agenda?: string
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          destination?: string
          id?: string
          needs_driver?: boolean
          notes?: string | null
          passengers_count?: number
          pickup_at?: string
          protocol?: string
          requester_email?: string
          requester_id?: string
          return_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_requests_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_requests_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brand: string
          capacity: number
          created_at: string
          id: string
          model: string
          plate: string
          status: Database["public"]["Enums"]["vehicle_status"]
          vehicle_type: string
        }
        Insert: {
          brand: string
          capacity?: number
          created_at?: string
          id?: string
          model: string
          plate: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          vehicle_type?: string
        }
        Update: {
          brand?: string
          capacity?: number
          created_at?: string
          id?: string
          model?: string
          plate?: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          vehicle_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_first_manager: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_institutional_email: { Args: { _email: string }; Returns: boolean }
      manager_exists: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "manager" | "requester"
      request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "completed"
      vehicle_status: "available" | "in_use" | "maintenance" | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["manager", "requester"],
      request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "completed",
      ],
      vehicle_status: ["available", "in_use", "maintenance", "inactive"],
    },
  },
} as const
