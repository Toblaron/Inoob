import OpenAI from "openai";
import { Buffer } from "node:buffer";
export declare const openai: OpenAI;
export type AudioFormat = "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown";
/**
 * Detect audio format from buffer magic bytes.
 * Supports: WAV, MP3, WebM (Chrome/Firefox), MP4/M4A/MOV (Safari/iOS), OGG
 */
export declare function detectAudioFormat(buffer: Buffer): AudioFormat;
/**
 * Convert any audio/video format to WAV using ffmpeg.
 */
export declare function convertToWav(audioBuffer: Buffer): Promise<Buffer>;
/**
 * Auto-detect and convert audio to OpenAI-compatible format.
 */
export declare function ensureCompatibleFormat(audioBuffer: Buffer): Promise<{
    buffer: Buffer;
    format: "wav" | "mp3";
}>;
/** Voice Chat: audio-in, audio-out using gpt-audio. */
export declare function voiceChat(audioBuffer: Buffer, voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer", inputFormat?: "wav" | "mp3", outputFormat?: "wav" | "mp3"): Promise<{
    transcript: string;
    audioResponse: Buffer;
}>;
/** Streaming Voice Chat for real-time audio responses. */
export declare function voiceChatStream(audioBuffer: Buffer, voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer", inputFormat?: "wav" | "mp3"): Promise<AsyncIterable<{
    type: "transcript" | "audio";
    data: string;
}>>;
/** Text-to-Speech using gpt-audio. */
export declare function textToSpeech(text: string, voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer", format?: "wav" | "mp3" | "flac" | "opus" | "pcm16"): Promise<Buffer>;
/** Streaming Text-to-Speech. */
export declare function textToSpeechStream(text: string, voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"): Promise<AsyncIterable<string>>;
/** Speech-to-Text using gpt-4o-mini-transcribe. */
export declare function speechToText(audioBuffer: Buffer, format?: "wav" | "mp3" | "webm"): Promise<string>;
/** Streaming Speech-to-Text. */
export declare function speechToTextStream(audioBuffer: Buffer, format?: "wav" | "mp3" | "webm"): Promise<AsyncIterable<string>>;
//# sourceMappingURL=client.d.ts.map