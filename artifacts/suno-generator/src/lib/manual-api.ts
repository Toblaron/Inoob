/**
 * Manual API client for new endpoints not yet in the generated OpenAPI client.
 * All functions return typed responses or throw on HTTP error.
 */

import type { SunoTemplate } from "@workspace/api-client-react";

// ─── Shared fetch wrapper ──────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const json = await res.json() as T | { error: string };
  if (!res.ok) throw new Error((json as { error: string }).error ?? `API error ${res.status}`);
  return json as T;
}

// ─── Batch processing ──────────────────────────────────────────────────────────

export interface BatchResult {
  url: string;
  template: SunoTemplate | null;
  error?: string;
}

export interface BatchOptions {
  vocalGender?: string;
  energyLevel?: string;
  era?: string;
  genreNudge?: string;
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  mode?: "cover" | "inspired";
  tempo?: string;
  excludeTags?: string[];
  isInstrumental?: boolean;
}

export async function batchGenerateTemplates(urls: string[], options: BatchOptions = {}): Promise<BatchResult[]> {
  return apiFetch<BatchResult[]>("/batch", {
    method: "POST",
    body: JSON.stringify({ urls, options }),
  });
}

// ─── Multi-track arrangement ───────────────────────────────────────────────────

export interface TrackResult {
  trackId: "lead" | "harmony" | "instrumental" | "rhythm";
  label: string;
  template: SunoTemplate;
}

export interface MultiTrackResponse {
  songTitle: string;
  artist: string;
  tracks: TrackResult[];
  arrangementNote: string;
}

export async function generateMultiTrack(
  youtubeUrl: string,
  options: BatchOptions = {}
): Promise<MultiTrackResponse> {
  return apiFetch<MultiTrackResponse>("/multi-track", {
    method: "POST",
    body: JSON.stringify({ youtubeUrl, ...options }),
  });
}

// ─── Transition template ───────────────────────────────────────────────────────

export type TransitionStyle = "smooth" | "key-change" | "genre-blend" | "breakdown";

export interface TransitionResponse {
  template: SunoTemplate;
  fromSong: { title: string; artist: string; bpm?: number; key?: string };
  toSong: { title: string; artist: string; bpm?: number; key?: string };
  transitionStyle: TransitionStyle;
}

export async function generateTransition(
  fromUrl: string,
  toUrl: string,
  transitionStyle: TransitionStyle = "smooth"
): Promise<TransitionResponse> {
  return apiFetch<TransitionResponse>("/transition", {
    method: "POST",
    body: JSON.stringify({ fromUrl, toUrl, transitionStyle }),
  });
}

// ─── Prompt optimizer ─────────────────────────────────────────────────────────

export interface OptimizeBreakdown {
  styleLength: number;
  lyricsLength: number;
  negativeLength: number;
  hasBPM: boolean;
  hasKey: boolean;
  hasChordProgression: boolean;
  hasHookIdentity: boolean;
  hasDynamics: boolean;
  hasArticulation: boolean;
  hasProductionHeader: boolean;
  hasAdLibs: boolean;
  sectionCount: number;
  clicheCount: number;
}

export interface OptimizeResponse {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: OptimizeBreakdown;
  suggestions: string[];
  maxScore: number;
}

export async function optimizeTemplate(template: Partial<SunoTemplate>): Promise<OptimizeResponse> {
  return apiFetch<OptimizeResponse>("/optimize", {
    method: "POST",
    body: JSON.stringify({ template }),
  });
}

// ─── Reverse Suno ─────────────────────────────────────────────────────────────

export interface ReverseResponse {
  inferredSong: { title: string; artist: string; confidence: "high" | "medium" | "low" };
  suggestedSettings: {
    genres: string[];
    era: string | null;
    energy: string | null;
    tempo: string | null;
    vocalGender: string | null;
    moods: string[];
    instruments: string[];
  };
  audioFeatures: { bpm: number | null; key: string | null };
  analysisNotes: string;
}

export async function reverseTemplate(templateText: string): Promise<ReverseResponse> {
  return apiFetch<ReverseResponse>("/reverse", {
    method: "POST",
    body: JSON.stringify({ templateText }),
  });
}

// ─── Mood to settings ─────────────────────────────────────────────────────────

export interface MoodSettingsResponse {
  genres: string[];
  moods: string[];
  energy: string;
  tempo: string;
  era: string | null;
  instruments: string[];
  genreNudge: string;
  reasoning: string;
}

export async function moodToSettings(moodDescription: string): Promise<MoodSettingsResponse> {
  return apiFetch<MoodSettingsResponse>("/mood-to-settings", {
    method: "POST",
    body: JSON.stringify({ moodDescription }),
  });
}

// ─── Cache stats (dev/admin) ───────────────────────────────────────────────────

export interface CacheStats {
  metadata: number;
  preview: number;
  suggest: number;
  template: number;
}

export async function getCacheStats(): Promise<CacheStats> {
  return apiFetch<CacheStats>("/cache-stats");
}
