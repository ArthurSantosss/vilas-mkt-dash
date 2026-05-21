-- ── Migração: Adicionar Logo do Cliente ──
-- Adiciona a coluna logo_url na tabela clients para salvar o link da imagem da logo de cada cliente.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url TEXT;
