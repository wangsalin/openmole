CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "knowledge_chunks"
  ADD COLUMN IF NOT EXISTS "embedding_vector" vector(384);

CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_vector_idx"
  ON "knowledge_chunks"
  USING ivfflat ("embedding_vector" vector_cosine_ops)
  WITH (lists = 100);
