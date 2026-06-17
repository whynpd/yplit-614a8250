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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
          is_admin: boolean
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
          is_admin?: boolean
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      bill_guesses: {
        Row: {
          created_at: string
          expense_id: string
          guess: number
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          guess: number
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          guess?: number
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_guesses_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          amount: number
          expense_id: string
          id: string
          share: number
          user_id: string
        }
        Insert: {
          amount: number
          expense_id: string
          id?: string
          share?: number
          user_id: string
        }
        Update: {
          amount?: number
          expense_id?: string
          id?: string
          share?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          currency: string
          description: string
          id: string
          location: string | null
          occurred_at: string
          payer_id: string
          receipt_url: string | null
          split_method: Database["public"]["Enums"]["split_method"]
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          currency?: string
          description: string
          id?: string
          location?: string | null
          occurred_at?: string
          payer_id: string
          receipt_url?: string | null
          split_method?: Database["public"]["Enums"]["split_method"]
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          currency?: string
          description?: string
          id?: string
          location?: string | null
          occurred_at?: string
          payer_id?: string
          receipt_url?: string | null
          split_method?: Database["public"]["Enums"]["split_method"]
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      market_bets: {
        Row: {
          created_at: string
          id: string
          prediction: string
          resolved: boolean
          stake: number
          trip_id: string
          user_id: string
          won: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          prediction: string
          resolved?: boolean
          stake?: number
          trip_id: string
          user_id: string
          won?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          prediction?: string
          resolved?: boolean
          stake?: number
          trip_id?: string
          user_id?: string
          won?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "market_bets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          caption: string | null
          created_at: string
          expense_id: string | null
          id: string
          location: string | null
          photo_url: string
          taken_at: string
          trip_id: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expense_id?: string | null
          id?: string
          location?: string | null
          photo_url: string
          taken_at?: string
          trip_id: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          expense_id?: string | null
          id?: string
          location?: string | null
          photo_url?: string
          taken_at?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_completions: {
        Row: {
          completed_at: string
          id: string
          mission_id: string
          proof_url: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          mission_id: string
          proof_url?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          mission_id?: string
          proof_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_completions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          points: number
          title: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          points?: number
          title: string
          trip_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          points?: number
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
          upi_handle: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          updated_at?: string
          upi_handle?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
          upi_handle?: string | null
        }
        Relationships: []
      }
      settlements: {
        Row: {
          amount: number
          created_at: string
          currency: string
          from_user: string
          id: string
          note: string | null
          settled_at: string
          to_user: string
          trip_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          from_user: string
          id?: string
          note?: string | null
          settled_at?: string
          to_user: string
          trip_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          from_user?: string
          id?: string
          note?: string | null
          settled_at?: string
          to_user?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      step_entries: {
        Row: {
          created_at: string
          day: string
          id: string
          steps: number
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          steps: number
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          steps?: number
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          id: string
          joined_at: string
          role: string
          trip_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string
          trip_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          base_currency: string
          cover_url: string | null
          created_at: string
          created_by: string
          destination: string | null
          end_date: string | null
          id: string
          invite_code: string
          name: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          base_currency?: string
          cover_url?: string | null
          created_at?: string
          created_by: string
          destination?: string | null
          end_date?: string | null
          id?: string
          invite_code: string
          name: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string
          destination?: string | null
          end_date?: string | null
          id?: string
          invite_code?: string
          name?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_trip_by_code: {
        Args: { _code: string }
        Returns: {
          cover_url: string
          destination: string
          end_date: string
          id: string
          member_count: number
          name: string
          start_date: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_trip_member: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member"
      expense_category:
        | "food"
        | "transport"
        | "stay"
        | "activity"
        | "shopping"
        | "misc"
      split_method: "equal" | "unequal" | "shares" | "percent"
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
      app_role: ["admin", "member"],
      expense_category: [
        "food",
        "transport",
        "stay",
        "activity",
        "shopping",
        "misc",
      ],
      split_method: ["equal", "unequal", "shares", "percent"],
    },
  },
} as const
