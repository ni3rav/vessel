"use client";

import { FileAudio, X } from "lucide-react";
import { ChangeEvent, DragEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { tryCatch } from "@/lib/try-catch";

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

export default function FileUpload04() {
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
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="flex items-center justify-center p-10 w-full max-w-lg">
      <div className="w-full">
        <h3 className="text-balance text-lg font-semibold text-foreground">Audio Upload</h3>

        <div
          className="flex justify-center rounded-md border mt-2 border-dashed border-input px-6 py-12"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div>
            <FileAudio className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden={true} />
            <div className="flex text-sm leading-6 text-muted-foreground">
              <p>Drag and drop or</p>
              <label
                htmlFor="file-upload-03"
                className="relative cursor-pointer rounded-sm pl-1 font-medium text-primary hover:underline hover:underline-offset-4"
              >
                <span>choose file</span>
                <input
                  id="file-upload-03"
                  name="file-upload-03"
                  type="file"
                  className="sr-only"
                  accept=".mp3,.wav,audio/mpeg,audio/wav"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  disabled={isUploading}
                />
              </label>
              <p className="text-pretty pl-1">to upload</p>
            </div>
          </div>
        </div>

        <p className="text-pretty mt-2 text-xs leading-5 text-muted-foreground sm:flex sm:items-center sm:justify-between">
          <span>Accepted file types: MP3, WAV.</span>
          <span className="pl-1 sm:pl-0">Max. size: 15MB</span>
        </p>

        {file && (
          <Card className="relative mt-8 bg-muted p-4 gap-4 shadow-none">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-1 top-1 text-muted-foreground hover:text-foreground"
              aria-label="Remove"
              onClick={resetFile}
              disabled={isUploading}
            >
              <X className="h-5 w-5 shrink-0" aria-hidden={true} />
            </Button>

            <div className="flex items-center space-x-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-background shadow-sm ring-1 ring-inset ring-border">
                <FileAudio className="h-5 w-5 text-foreground" />
              </span>
              <div>
                <p className="text-pretty text-xs font-medium text-foreground">{file?.name}</p>
                <p className="text-pretty mt-0.5 text-xs text-muted-foreground">
                  {file && formatFileSize(file.size)}
                </p>
              </div>
            </div>
          </Card>
        )}

        {isUploading && (
          <div className="mt-6 space-y-1.5">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-right">{progress}%</p>
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse items-stretch gap-3 border-t pt-6 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="outline"
            className="w-full whitespace-nowrap sm:w-36"
            onClick={resetFile}
            disabled={!file || isUploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full whitespace-nowrap sm:w-36"
            disabled={!file || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>
    </div>
  );
}
