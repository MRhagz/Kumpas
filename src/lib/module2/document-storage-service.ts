import { supabaseAdmin } from "@/lib/supabase";

const BUCKET = "kumpas-documents";

export class DocumentStorageService {
  async storeRedacted(buffer: Buffer, sessionId: string, docId: string): Promise<string> {
    const storagePath = `${sessionId}/${docId}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });

    if (error) throw new Error(`Failed to store redacted image: ${error.message}`);
    return storagePath;
  }

  async retrieveRedacted(storagePath: string): Promise<Blob> {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(storagePath);

    if (error || !data) throw new Error("Redacted image not found.");
    return data;
  }

  async deleteRedacted(storagePath: string): Promise<void> {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (error) {
      throw new Error(`Failed to delete redacted image: ${error.message}`);
    }
  }
}

export const documentStorageService = new DocumentStorageService();
