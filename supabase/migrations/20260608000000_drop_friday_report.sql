-- ============================================================
-- Limpeza: remove os objetos do antigo "Relatório de Sexta"
-- (config de receita, notas do gestor e links públicos), que não
-- são mais usados — a aba Relatório Semanal usa somente texto.
--
-- ESCOPO RESTRITO aos objetos friday_*. NÃO afeta shared_reports
-- nem a função get_shared_report (usados pelo Relatório Visual).
-- DROP TABLE remove índices e policies dessas tabelas em conjunto.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_friday_share(TEXT);

DROP TABLE IF EXISTS public.friday_shared_reports;
DROP TABLE IF EXISTS public.friday_report_notes;
DROP TABLE IF EXISTS public.friday_report_config;
