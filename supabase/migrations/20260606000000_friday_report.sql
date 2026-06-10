-- ============================================================
-- Relatório de Sexta — config de receita, análise do gestor e
-- links públicos compartilháveis.
--
-- Segue o mesmo padrão de shared_reports: o app usa auth custom
-- (env-based), então as tabelas ficam abertas para a anon key
-- gerenciar via dashboard, e a leitura pública anônima é funilada
-- por um RPC SECURITY DEFINER para evitar enumeração.
-- ============================================================

-- ── Config de receita por conta Meta ──────────────────────────
-- ticket_medio em reais; taxa_fechamento em PERCENTUAL (ex: 30 = 30%).
CREATE TABLE IF NOT EXISTS friday_report_config (
  account_id      TEXT PRIMARY KEY,
  ticket_medio    NUMERIC(12,2),
  taxa_fechamento NUMERIC(5,2),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Análise do gestor por conta + semana ──────────────────────
-- week_start é a segunda-feira (início ISO) da semana do relatório.
CREATE TABLE IF NOT EXISTS friday_report_notes (
  account_id       TEXT NOT NULL,
  week_start       DATE NOT NULL,
  escalei_matei    TEXT,
  plano_proxima    TEXT,
  vitoria_atencao  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, week_start)
);

-- ── Links públicos do Relatório de Sexta ──────────────────────
CREATE TABLE IF NOT EXISTS friday_shared_reports (
  id           TEXT PRIMARY KEY,
  owner_email  TEXT,
  account_id   TEXT NOT NULL,
  agency       TEXT,
  client_label TEXT,
  public_slug  TEXT,
  week_start   DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_friday_shared_account_id ON friday_shared_reports(account_id);
CREATE INDEX IF NOT EXISTS idx_friday_shared_owner_email ON friday_shared_reports(owner_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friday_shared_public_slug ON friday_shared_reports(public_slug);

ALTER TABLE friday_report_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE friday_report_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE friday_shared_reports  ENABLE ROW LEVEL SECURITY;

-- Dashboard (anon key) gerencia tudo; a leitura pública é via RPC abaixo.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Dashboard manages friday_report_config' AND tablename = 'friday_report_config') THEN
    CREATE POLICY "Dashboard manages friday_report_config" ON friday_report_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Dashboard manages friday_report_notes' AND tablename = 'friday_report_notes') THEN
    CREATE POLICY "Dashboard manages friday_report_notes" ON friday_report_notes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Dashboard manages friday_shared_reports' AND tablename = 'friday_shared_reports') THEN
    CREATE POLICY "Dashboard manages friday_shared_reports" ON friday_shared_reports FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Lookup público: share + config de receita + textos da semana ──
-- Busca por id OU public_slug, e já junta ticket/taxa e as notas
-- da semana referente, num único retorno (evita expor as tabelas).
CREATE OR REPLACE FUNCTION public.get_friday_share(p_id TEXT)
RETURNS TABLE (
  id              TEXT,
  account_id      TEXT,
  agency          TEXT,
  client_label    TEXT,
  public_slug     TEXT,
  week_start      DATE,
  ticket_medio    NUMERIC,
  taxa_fechamento NUMERIC,
  escalei_matei   TEXT,
  plano_proxima   TEXT,
  vitoria_atencao TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.account_id, s.agency, s.client_label, s.public_slug, s.week_start,
    c.ticket_medio, c.taxa_fechamento,
    n.escalei_matei, n.plano_proxima, n.vitoria_atencao
  FROM public.friday_shared_reports s
  LEFT JOIN public.friday_report_config c ON c.account_id = s.account_id
  LEFT JOIN public.friday_report_notes  n ON n.account_id = s.account_id AND n.week_start = s.week_start
  WHERE s.id = p_id OR s.public_slug = p_id
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_friday_share(TEXT) TO anon, authenticated;
