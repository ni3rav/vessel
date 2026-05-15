"use client";

import { FileAudio, Music2, X } from "lucide-react";
import Link from "next/link";
import type { ChangeEvent, DragEvent } from "react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { tryCatch } from "@/lib/try-catch";
import { cn } from "@/lib/utils";

function uploadFileToR2(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed with status ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav"];
const ALLOWED_EXTENSIONS = [".mp3", ".wav"];

export default function UploadFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, startUploadTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSupportedFile = (incomingFile: File) => {
    const ext = `.${incomingFile.name.split(".").pop()?.toLowerCase() ?? ""}`;
    return ALLOWED_MIME_TYPES.includes(incomingFile.type) || ALLOWED_EXTENSIONS.includes(ext);
  };

  const handleFile = (incomingFile: File | undefined) => {
    if (!incomingFile) return;

    if (!isSupportedFile(incomingFile)) {
      toast.error("Only MP3 and WAV files are allowed.", { position: "bottom-right", duration: 3000 });
      return;
    }

    if (incomingFile.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File exceeds the 15MB limit.", { position: "bottom-right", duration: 3000 });
      return;
    }

    setFile(incomingFile);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files?.[0]);
  };

  const resetFile = () => {
    if (isUploading) return;
    setFile(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = () => {
    if (!file) return;

    startUploadTransition(async () => {
      setProgress(0);

      const { data: presignRes, error: presignNetworkError } = await tryCatch(
        fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
        }),
      );
      if (presignNetworkError) {
        toast.error("Network error — could not reach server.", { position: "bottom-right" });
        return;
      }
      if (!presignRes.ok) {
        const msg = presignRes.status === 401 ? "Not authenticated." : await presignRes.text();
        toast.error(msg, { position: "bottom-right" });
        return;
      }

      const { uploadUrl, key } = (await presignRes.json()) as {
        uploadUrl: string;
        key: string;
        publicUrl: string;
      };

      const { error: r2Error } = await tryCatch(
        uploadFileToR2(uploadUrl, file, file.type, setProgress),
      );
      if (r2Error) {
        toast.error(r2Error instanceof Error ? r2Error.message : "Upload to storage failed.", {
          position: "bottom-right",
        });
        setProgress(0);
        return;
      }

      const { data: completeRes, error: completeNetworkError } = await tryCatch(
        fetch("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, filename: file.name, contentType: file.type, size: file.size }),
        }),
      );
      if (completeNetworkError || !completeRes.ok) {
        toast.error("Upload succeeded but failed to save record. Contact support.", {
          position: "bottom-right",
        });
        return;
      }

      toast.success(`${file.name} uploaded successfully.`, { position: "bottom-right" });
      resetFile();
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <section className="mx-auto w-full max-w-xl pb-8">
      <p className="mb-6 font-heading text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
        Upload
      </p>

      <div className="space-y-3">
        <h1 className="font-heading text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Add music
        </h1>
        <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Drop an MP3 or WAV file. After processing, it appears in{" "}
          <Link
            href="/library"
            className="font-medium text-foreground underline-offset-4 transition-colors hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Library
          </Link>
          .
        </p>
      </div>

      <div
        className={cn(
          "relative mt-10 flex cursor-default justify-center rounded-[2rem] bg-linear-to-b from-muted/70 via-muted/45 to-muted/25 px-6 py-14 shadow-inner transition-colors duration-300 sm:py-16",
          "outline-none focus-within:ring-2 focus-within:ring-ring/40",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center text-center">
          <div
            aria-hidden
            className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary/18 to-muted/70 shadow-md shadow-foreground/8 sm:size-17"
          >
            <Music2 className="size-8 text-muted-foreground opacity-90 sm:size-9" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-sm leading-relaxed text-muted-foreground">
            <span>Drag and drop or</span>
            <label
              htmlFor="file-upload-drop"
              className="cursor-pointer rounded-full px-1 font-medium text-primary transition-colors hover:text-primary/90 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/50"
            >
              <span className="underline-offset-4 hover:underline">choose file</span>
              <input
                id="file-upload-drop"
                name="file-upload-drop"
                type="file"
                className="sr-only"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={handleFileChange}
                ref={fileInputRef}
                disabled={isUploading}
              />
            </label>
          </div>
          <p className="mt-3 max-w-xs text-pretty text-xs text-muted-foreground/90">
            MP3 · WAV · max 15MB
          </p>
        </div>
      </div>

      {file ? (
        <div className="relative mt-8 rounded-2xl bg-muted/65 px-4 py-4 sm:px-5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remove file"
            onClick={resetFile}
            disabled={isUploading}
          >
            <X className="size-5 shrink-0" aria-hidden />
          </Button>

          <div className="flex items-center gap-3 pr-10">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-muted/90 to-muted/50 shadow-sm">
              <FileAudio className="size-5 text-foreground/90" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
          </div>
        </div>
      ) : null}

      {isUploading ? (
        <div className="mt-8 space-y-2">
          <Progress value={progress} className="h-1.5 bg-muted/80" />
          <p className="text-right text-xs tabular-nums text-muted-foreground">{progress}%</p>
        </div>
      ) : null}

      <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-start sm:gap-4">
        <Button
          type="button"
          variant="ghost"
          className="w-full rounded-full touch-manipulation sm:w-auto sm:min-w-36"
          onClick={resetFile}
          disabled={!file || isUploading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="w-full rounded-full px-8 shadow-md shadow-foreground/10 touch-manipulation sm:w-auto sm:min-w-36"
          disabled={!file || isUploading}
          onClick={handleUpload}
        >
          {isUploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </section>
  );
}
