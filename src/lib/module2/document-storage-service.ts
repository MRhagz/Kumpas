import { supabaseAdmin } from "@/lib/supabase";

const BUCKET = "kumpas-documents";
const SIGNED_URL_TTL = 30 * 60; // 30 minutes

export class DocumentStorageService {
  async storeRedacted(buffer: Buffer, sessionId: string, docId: string): Promise<string> {
    const storagePath = `${sessionId}/${docId}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });

    if (error) throw new Error(`Failed to store redacted image: ${error.message}`);
    return storagePath;
  }

  async retrieveRedacted(storagePath: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);

    if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
    return data.signedUrl;
  }

  async deleteRedacted(storagePath: string): Promise<void> {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
  }
}

export const documentStorageService = new DocumentStorageService();
