// Types for the Supabase database, in the format `supabase gen types typescript` produces.
// Regenerate after changing migrations: `npm run db:types` (needs the Supabase CLI and `supabase link`).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      staff: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      settings: {
        Row: { id: number; gym_name: string; grading: Json; qr_link: string; updated_at: string };
        Insert: { id?: number; gym_name?: string; grading: Json; qr_link?: string; updated_at?: string };
        Update: { id?: number; gym_name?: string; grading?: Json; qr_link?: string; updated_at?: string };
        Relationships: [];
      };
      walls: {
        Row: {
          id: string;
          name: string;
          scan_path: string | null;
          ghost_path: string | null;
          upright: boolean;
          spin: number;
          tris: number | null;
          created_at: string;
          retired_at: string | null;
          replaced_by: string | null;
        };
        Insert: {
          id: string;
          name: string;
          scan_path?: string | null;
          ghost_path?: string | null;
          upright?: boolean;
          spin?: number;
          tris?: number | null;
          created_at?: string;
          retired_at?: string | null;
          replaced_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          scan_path?: string | null;
          ghost_path?: string | null;
          upright?: boolean;
          spin?: number;
          tris?: number | null;
          created_at?: string;
          retired_at?: string | null;
          replaced_by?: string | null;
        };
        Relationships: [];
      };
      holds: {
        Row: {
          id: string;
          wall_id: string;
          kind: string;
          c: Json;
          r: number;
          n: Json;
          on_id: string | null;
          piece_path: string;
          created_at: string;
        };
        Insert: {
          id: string;
          wall_id: string;
          kind: string;
          c: Json;
          r: number;
          n: Json;
          on_id?: string | null;
          piece_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          wall_id?: string;
          kind?: string;
          c?: Json;
          r?: number;
          n?: Json;
          on_id?: string | null;
          piece_path?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'holds_wall_id_fkey'; columns: ['wall_id']; isOneToOne: false; referencedRelation: 'walls'; referencedColumns: ['id'] },
          { foreignKeyName: 'holds_on_id_fkey'; columns: ['on_id']; isOneToOne: false; referencedRelation: 'holds'; referencedColumns: ['id'] },
        ];
      };
      routes: {
        Row: {
          id: string;
          wall_id: string;
          type: string;
          base_id: string | null;
          name: string;
          grade: string | null;
          color: string | null;
          section: string | null;
          description: string | null;
          rules: Json;
          holds: Json;
          setter: string | null;
          archived: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          wall_id: string;
          type: string;
          base_id?: string | null;
          name: string;
          grade?: string | null;
          color?: string | null;
          section?: string | null;
          description?: string | null;
          rules?: Json;
          holds?: Json;
          setter?: string | null;
          archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          wall_id?: string;
          type?: string;
          base_id?: string | null;
          name?: string;
          grade?: string | null;
          color?: string | null;
          section?: string | null;
          description?: string | null;
          rules?: Json;
          holds?: Json;
          setter?: string | null;
          archived?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'routes_base_id_fkey'; columns: ['base_id']; isOneToOne: false; referencedRelation: 'routes'; referencedColumns: ['id'] },
        ];
      };
      comments: {
        Row: {
          id: string;
          route_id: string;
          nick: string;
          body: string;
          beta: boolean;
          photo_path: string | null;
          hidden: boolean;
          reported: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          route_id: string;
          nick: string;
          body?: string;
          beta?: boolean;
          photo_path?: string | null;
          hidden?: boolean;
          reported?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          route_id?: string;
          nick?: string;
          body?: string;
          beta?: boolean;
          photo_path?: string | null;
          hidden?: boolean;
          reported?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'comments_route_id_fkey'; columns: ['route_id']; isOneToOne: false; referencedRelation: 'routes'; referencedColumns: ['id'] },
        ];
      };
      sends: {
        Row: { route_id: string; device_id: string; created_at: string };
        Insert: { route_id: string; device_id: string; created_at?: string };
        Update: { route_id?: string; device_id?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: 'sends_route_id_fkey'; columns: ['route_id']; isOneToOne: false; referencedRelation: 'routes'; referencedColumns: ['id'] },
        ];
      };
    };
    Views: {
      send_counts: {
        Row: { route_id: string | null; n: number | null };
        Relationships: [];
      };
    };
    Functions: {
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      report_comment: { Args: { cid: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
