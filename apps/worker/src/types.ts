export interface JobPayload {
  id: string;
  key: string;
  filename: string;
  userid: string;
}

export interface BitrateVariant {
  bitrate: string;
  bitrateKbps: number;
  outputDir: string;
  playlist: string;
  segments: string[];
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
  outputDir: string;
  variants: BitrateVariant[];
  masterPlaylist: string;
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
