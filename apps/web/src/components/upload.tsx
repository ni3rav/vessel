"use client";

import { FileAudio, X } from "lucide-react";
import { ChangeEvent, DragEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function FileUpload04() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, startUploadTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
  const ACCEPTED_AUDIO_TYPES = [
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/flac",
    "audio/x-flac",
  ];
  const ACCEPTED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".webm", ".m4a", ".aac", ".flac"];

  const isSupportedAudioFile = (incomingFile: File) => {
    const fileName = incomingFile.name.toLowerCase();
    const hasSupportedExtension = ACCEPTED_AUDIO_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    return ACCEPTED_AUDIO_TYPES.includes(incomingFile.type) || hasSupportedExtension;
  };

  const handleFile = (incomingFile: File | undefined) => {
    if (!incomingFile) return;

    if (!isSupportedAudioFile(incomingFile)) {
      toast.error("Please upload a valid audio file (MP3, WAV, OGG, WEBM, M4A, AAC, or FLAC).", {
        position: "bottom-right",
        duration: 3000,
      });
      return;
    }

    if (incomingFile.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File is too large. Maximum allowed size is 15MB.", {
        position: "bottom-right",
        duration: 3000,
      });
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = () => {
    if (!file) return;

    startUploadTransition(async () => {
      // TODO: Replace with actual upload action/endpoint call.
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.success(`Uploaded ${file.name}`);
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
                  accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a,.aac,.flac"
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
          <span>Accepted file types: MP3, WAV, OGG, WEBM, M4A, AAC, FLAC.</span>
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
