export interface JobPayload {
  id: string;
  key: string;
  filename: string;
  userid: string;
}

export interface BitrateVariant {
  bitrate: string;
  bitrateKbps: number;
  outputDir: string; // R2 prefix for this variant
  playlist: string; // R2 key
  segments: string[]; // R2 keys
}

export interface ValidationResult {
  valid: boolean;
  durationSeconds: number;
  codec?: string;
  error?: string;
}

export interface TranscodeResult {
  id: string;
  key: string;
  filename: string;
  userid: string;
  success: boolean;
  outputDir: string; // Root R2 prefix for generated HLS outputs
  variants: BitrateVariant[];
  masterPlaylist: string; // R2 key
  durationSeconds: number;
  error?: string;
}

export interface FfprobeOutput {
  streams: Array<{
    codec_type: string;
    codec_name: string;
    duration?: string;
  }>;
  format: {
    duration?: string;
    size?: string;
  };
}
