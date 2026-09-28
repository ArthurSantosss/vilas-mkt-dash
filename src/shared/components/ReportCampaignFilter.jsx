import { formatCurrency } from '../utils/format';

export default function ReportCampaignFilter({ accountCampaigns, selectedCampaignIds, setSelectedCampaignIds }) {
  const selectedCampaigns = accountCampaigns.filter(campaign => selectedCampaignIds.includes(campaign.id));
  const hasCampaignFilter = selectedCampaignIds.length > 0;
  const campaignScopeLabel = !hasCampaignFilter
    ? `Todas as campanhas (${accountCampaigns.length})`
    : selectedCampaigns.length === 1
      ? `Campanha filtrada: ${selectedCampaigns[0].name}`
      : `${selectedCampaignIds.length} campanhas filtradas`;

  return (
          <div className="relative mt-5 rounded-2xl border border-border/60 bg-surface/45 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Filtro por campanhas</h3>
                <p className="mt-1 text-xs text-text-secondary">
                  Deixe vazio para considerar a conta inteira ou marque apenas as campanhas que quer incluir no relatório.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCampaignIds([])}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    !hasCampaignFilter
                      ? 'bg-primary/15 text-primary-light border border-primary/30'
                      : 'bg-bg/60 text-text-secondary border border-border hover:text-text-primary hover:border-primary/20'
                  }`}
                >
                  Todas as campanhas ({accountCampaigns.length})
                </button>
                {hasCampaignFilter && (
                  <button
                    type="button"
                    onClick={() => setSelectedCampaignIds([])}
                    className="rounded-xl border border-border bg-bg/60 px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-primary/20 hover:text-text-primary"
                  >
                    Limpar filtro
                  </button>
                )}
              </div>
            </div>

            {accountCampaigns.length > 0 ? (
              <>
                <div className="mt-4 grid max-h-56 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                  {accountCampaigns.map((campaign) => {
                    const checked = selectedCampaignIds.includes(campaign.id);
                    return (
                      <label
                        key={campaign.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                          checked
                            ? 'border-primary/35 bg-primary/10'
                            : 'border-border/70 bg-bg/50 hover:border-primary/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedCampaignIds((prev) => (
                              prev.includes(campaign.id)
                                ? prev.filter(id => id !== campaign.id)
                                : [...prev, campaign.id]
                            ));
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-border bg-bg text-primary focus:ring-primary/40"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            {campaign.name}
                          </span>
                          <span className="mt-1 block text-[11px] text-text-secondary">
                            Investimento: {formatCurrency(campaign.metrics?.spend || 0)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
                  <span className="rounded-full border border-border bg-bg/50 px-2.5 py-1">
                    Escopo atual: <span className="font-semibold text-text-primary">{campaignScopeLabel}</span>
                  </span>
                  {hasCampaignFilter && selectedCampaigns.length > 0 && (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary-light">
                      {selectedCampaigns.length} selecionada(s)
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-bg/35 px-4 py-5 text-sm text-text-secondary">
                Nenhuma campanha encontrada para esta conta no período atual.
              </div>
            )}
          </div>
  );
}
