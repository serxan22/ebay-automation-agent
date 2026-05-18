import { createSupabaseServiceClient } from "@/lib/supabase/server";

export interface StoreImageInput {
  userId: string;
  supplierProductId: string;
  filename: string;
  bytes: Buffer;
  contentType: string;
  bucket?: string;
}

export async function storeOptimizedImage({
  userId,
  supplierProductId,
  filename,
  bytes,
  contentType,
  bucket = "product-images"
}: StoreImageInput) {
  const supabase = createSupabaseServiceClient();
  const path = `${userId}/${supplierProductId}/${filename}`;
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true
  });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
