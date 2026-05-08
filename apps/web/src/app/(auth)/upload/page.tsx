import Upload from "@/components/upload";
import { requireSession } from "@/lib/auth-guard";

export default async function UploadPage() {
  await requireSession();
  return <Upload />;
}
