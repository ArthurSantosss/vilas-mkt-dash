// Documento completo do relatório em PDF.
// A ordem das páginas é fixa; as seções opcionais (criativos, público,
// posicionamentos) só entram quando há dado suficiente para elas.

import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { COLORS, PAGE, CONTENT_WIDTH, FONT } from './theme';
import { money, count, compact, percent, decimal, todayLabel, truncate } from './formatters';
import { DailyEvolutionChart, HorizontalBars, DonutChart, ShareBar } from './charts';
import { styles } from './pageStyles';
import {
  ContentPage,
  SectionTitle,
  SubTitle,
  KpiGrid,
  BulletList,
  CalloutBox,
  Table,
  DeltaBadge,
  CoverBackground,
  CoverLogo,
} from './ui';

const DOCUMENT_TITLE = 'Relatório de Performance';

// ── Página 1 — Capa ──

function CoverPage({ report }) {
  const { meta, totals, logos } = report;

  return (
    <Page size="A4" style={styles.coverPage}>
      <CoverBackground />

      <View style={{ position: 'absolute', top: 44, left: PAGE.marginX, right: PAGE.marginX }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CoverLogo src={logos.agency} height={36} fallbackText={meta.agencyName} />
          {logos.client ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 0.75, height: 26, backgroundColor: COLORS.inkLine, marginRight: 14 }} />
              <Image src={logos.client} style={{ height: 34, maxWidth: 120, objectFit: 'contain' }} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ position: 'absolute', top: 300, left: PAGE.marginX, right: PAGE.marginX }}>
        <Text style={{ fontSize: 8, letterSpacing: 2.4, color: COLORS.primaryLight, fontFamily: FONT, fontWeight: 'bold' }}>
          META ADS · {meta.objectiveLabel.toUpperCase()}
        </Text>

        <Text
          style={{
            fontSize: 40,
            fontFamily: FONT,
            fontWeight: 'bold',
            color: COLORS.onInk,
            marginTop: 14,
            lineHeight: 1.08,
            letterSpacing: -1.2,
          }}
        >
          Relatório de{'\n'}Performance
        </Text>

        <View style={{ width: 72, height: 3, backgroundColor: COLORS.primary, borderRadius: 2, marginTop: 22, marginBottom: 22 }} />

        <Text style={{ fontSize: 17, color: COLORS.onInk, fontFamily: FONT, fontWeight: 'bold' }}>
          {meta.clientName}
        </Text>
        <Text style={{ fontSize: 10, color: COLORS.onInkSoft, marginTop: 7 }}>
          Período analisado: {meta.period.label}
        </Text>
      </View>

      {/* Resumo de abertura */}
      <View
        style={{
          position: 'absolute',
          bottom: 96,
          left: PAGE.marginX,
          right: PAGE.marginX,
          flexDirection: 'row',
          borderTopWidth: 0.75,
          borderTopColor: COLORS.inkLine,
          borderTopStyle: 'solid',
          paddingTop: 18,
        }}
      >
        {[
          { label: 'Investimento', value: money(totals.spend) },
          { label: meta.resultShort, value: count(totals.results) },
          { label: 'Alcance', value: compact(totals.reach) },
        ].map((item, index) => (
          <View key={item.label} style={{ flex: 1, paddingRight: index === 2 ? 0 : 12 }}>
            <Text style={{ fontSize: 6.8, letterSpacing: 1, color: COLORS.onInkSoft, fontFamily: FONT, fontWeight: 'bold' }}>
              {item.label.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 17, color: COLORS.onInk, fontFamily: FONT, fontWeight: 'bold', marginTop: 6 }}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ position: 'absolute', bottom: 40, left: PAGE.marginX, right: PAGE.marginX }}>
        <Text style={{ fontSize: 7.5, color: COLORS.onInkSoft }}>
          {meta.agencyName} · Documento gerado em {todayLabel()}
        </Text>
      </View>
    </Page>
  );
}

// ── Página 2 — Sumário executivo ──

function SummaryPage({ report, summary, pageProps }) {
  const { meta, totals, deltas } = report;

  return (
    <ContentPage {...pageProps}>
      <SectionTitle
        eyebrow="Sumário executivo"
        title="O que aconteceu neste período"
        description={`Leitura consolidada da conta entre ${meta.period.start} e ${meta.period.end}.`}
      />

      <CalloutBox title="Destaque do período">
        <Text style={{ fontSize: 12, lineHeight: 1.4, color: COLORS.text, fontFamily: FONT, fontWeight: 'bold' }}>
          {summary.headline}
        </Text>
      </CalloutBox>

      <View style={{ marginTop: 18 }}>
        {summary.paragraphs.map((paragraph, index) => (
          <Text
            key={index}
            style={{
              fontSize: 9.5,
              lineHeight: 1.6,
              color: COLORS.textSoft,
              marginBottom: index === summary.paragraphs.length - 1 ? 0 : 10,
              textAlign: 'justify',
            }}
          >
            {paragraph}
          </Text>
        ))}
      </View>

      <View style={{ height: 20 }} />

      <KpiGrid
        perRow={3}
        items={[
          { label: 'Investimento', value: money(totals.spend), delta: deltas.spend, neutralDelta: true, highlight: true },
          { label: meta.resultLabel, value: count(totals.results), delta: deltas.results, higherIsBetter: true },
          { label: meta.costLabel, value: money(totals.costPerResult), delta: deltas.costPerResult, higherIsBetter: false },
        ]}
      />

      <View style={{ height: 22 }} />

      <SubTitle>Destaques</SubTitle>
      <BulletList items={summary.highlights} />

      {meta.hasPrevious ? (
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.textMuted, lineHeight: 1.5 }}>
            As variações desta página comparam o período analisado com o intervalo imediatamente anterior
            ({meta.period.previousLabel}), de mesma duração.
          </Text>
        </View>
      ) : null}
    </ContentPage>
  );
}

// ── Página 3 — Indicadores e evolução ──

function IndicatorsPage({ report, pageProps }) {
  const { meta, totals, deltas, daily } = report;

  return (
    <ContentPage {...pageProps}>
      <SectionTitle
        eyebrow="Indicadores"
        title="Números do período"
        description="Todos os indicadores comparados com o período anterior de mesma duração."
      />

      <KpiGrid
        perRow={3}
        items={[
          { label: 'Investimento', value: money(totals.spend), delta: deltas.spend, neutralDelta: true },
          { label: meta.resultLabel, value: count(totals.results), delta: deltas.results, higherIsBetter: true },
          { label: meta.costLabel, value: money(totals.costPerResult), delta: deltas.costPerResult, higherIsBetter: false },
          { label: 'Alcance', value: count(totals.reach), delta: deltas.reach, higherIsBetter: true, caption: 'pessoas' },
          { label: 'Impressões', value: count(totals.impressions), delta: deltas.impressions, higherIsBetter: true },
          { label: 'Cliques no link', value: count(totals.clicks), delta: deltas.clicks, higherIsBetter: true },
          { label: 'CTR', value: percent(totals.ctr), delta: deltas.ctr, higherIsBetter: true, caption: 'cliques / impressões' },
          { label: 'CPM', value: money(totals.cpm), delta: deltas.cpm, higherIsBetter: false, caption: 'por mil impressões' },
          { label: 'Frequência', value: decimal(totals.frequency, 1), delta: deltas.frequency, neutralDelta: true, caption: 'exibições por pessoa' },
        ]}
      />

      {daily.length > 1 ? (
        <View style={{ marginTop: 24 }}>
          <SubTitle>Evolução diária</SubTitle>
          <Text style={{ fontSize: 8, color: COLORS.textSoft, marginBottom: 10, lineHeight: 1.45 }}>
            A linha mostra o investimento diário; as barras, o volume de {meta.resultLabel.toLowerCase()} no mesmo dia.
          </Text>
          <View
            style={{
              borderWidth: 0.75,
              borderColor: COLORS.line,
              borderStyle: 'solid',
              borderRadius: 7,
              paddingVertical: 10,
              paddingHorizontal: 6,
            }}
          >
            <DailyEvolutionChart data={daily} width={CONTENT_WIDTH - 12} height={195} resultLabel={meta.resultShort} />
          </View>
        </View>
      ) : null}
    </ContentPage>
  );
}

// ── Página 4 — Campanhas ──

function CampaignsPage({ report, pageProps }) {
  const { campaigns, meta, totals } = report;

  const columns = [
    {
      key: 'name',
      label: 'Campanha',
      width: '31%',
      render: (row) => (
        <View>
          <Text style={{ fontSize: 8.2, color: COLORS.text, fontFamily: FONT, fontWeight: 'bold' }}>
            {truncate(row.name, 34)}
          </Text>
          <View style={{ marginTop: 3 }}>
            <ShareBar ratio={row.share} width={68} />
          </View>
        </View>
      ),
    },
    { key: 'spendLabel', label: 'Investido', width: '15%', align: 'right', strong: true },
    { key: 'shareLabel', label: '% verba', width: '11%', align: 'right' },
    { key: 'resultsLabel', label: meta.resultShort, width: '13%', align: 'right', strong: true },
    { key: 'costLabel', label: 'Custo/result.', width: '17%', align: 'right' },
    { key: 'ctrLabel', label: 'CTR', width: '13%', align: 'right' },
  ];

  const rows = campaigns.map((campaign) => ({
    key: campaign.id,
    ...campaign,
    spendLabel: money(campaign.spend),
    shareLabel: percent(campaign.share * 100, 0),
    resultsLabel: count(campaign.results),
    costLabel: campaign.results > 0 ? money(campaign.costPerResult) : '—',
    ctrLabel: percent(campaign.ctr, 1),
  }));

  return (
    <ContentPage {...pageProps}>
      <SectionTitle
        eyebrow="Campanhas"
        title="Desempenho por campanha"
        description={`${campaigns.length} ${campaigns.length === 1 ? 'campanha ativa' : 'campanhas ativas'} no período, ordenadas por investimento.`}
      />

      <Table columns={columns} rows={rows} />

      {/* Linha de total */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 9,
          marginTop: 2,
          borderTopWidth: 1,
          borderTopColor: COLORS.text,
          borderTopStyle: 'solid',
        }}
      >
        <Text style={{ width: '31%', fontSize: 8.2, fontFamily: FONT, fontWeight: 'bold', color: COLORS.text }}>Total da conta</Text>
        <Text style={{ width: '15%', fontSize: 8.2, textAlign: 'right', fontFamily: FONT, fontWeight: 'bold', color: COLORS.text }}>
          {money(totals.spend)}
        </Text>
        <Text style={{ width: '11%', fontSize: 8.2, textAlign: 'right', color: COLORS.textSoft }}>100%</Text>
        <Text style={{ width: '13%', fontSize: 8.2, textAlign: 'right', fontFamily: FONT, fontWeight: 'bold', color: COLORS.text }}>
          {count(totals.results)}
        </Text>
        <Text style={{ width: '17%', fontSize: 8.2, textAlign: 'right', color: COLORS.textSoft }}>
          {totals.results > 0 ? money(totals.costPerResult) : '—'}
        </Text>
        <Text style={{ width: '13%', fontSize: 8.2, textAlign: 'right', color: COLORS.textSoft }}>{percent(totals.ctr, 1)}</Text>
      </View>

      <View style={{ marginTop: 22 }}>
        <CalloutBox title="Como ler esta tabela">
          <Text style={{ fontSize: 8.5, color: COLORS.textSoft, lineHeight: 1.5 }}>
            A barra abaixo do nome indica a participação da campanha no investimento total.
            {' '}Custo por resultado menor significa mais eficiência: a mesma verba gera mais {meta.resultLabel.toLowerCase()}.
            {' '}O CTR mede quantas pessoas clicaram em relação a quantas viram o anúncio.
          </Text>
        </CalloutBox>
      </View>
    </ContentPage>
  );
}

// ── Página 5 — Criativos ──

function CreativesPage({ report, pageProps }) {
  const { ads, meta } = report;
  const cardWidth = (CONTENT_WIDTH - 12) / 2;

  return (
    <ContentPage {...pageProps}>
      <SectionTitle
        eyebrow="Criativos"
        title="Anúncios em destaque"
        description={`Os anúncios que mais contribuíram para o resultado do período, ordenados por ${meta.resultLabel.toLowerCase()}.`}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {ads.map((ad, index) => (
          <View
            key={ad.id}
            style={{
              width: cardWidth,
              marginRight: index % 2 === 0 ? 12 : 0,
              marginBottom: 12,
              borderWidth: 0.75,
              borderColor: COLORS.line,
              borderStyle: 'solid',
              borderRadius: 7,
              overflow: 'hidden',
            }}
          >
            <View style={{ height: 132, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              {ad.image ? (
                <Image src={ad.image} style={{ width: '100%', height: 132, objectFit: 'cover' }} />
              ) : (
                <Text style={{ fontSize: 7.5, color: COLORS.textMuted }}>Prévia indisponível</Text>
              )}
            </View>

            <View style={{ padding: 11 }}>
              <Text style={{ fontSize: 8.5, fontFamily: FONT, fontWeight: 'bold', color: COLORS.text, lineHeight: 1.35 }}>
                {truncate(ad.headline || ad.name, 46)}
              </Text>
              {ad.campaignName ? (
                <Text style={{ fontSize: 7, color: COLORS.textMuted, marginTop: 3 }}>{truncate(ad.campaignName, 40)}</Text>
              ) : null}

              <View
                style={{
                  flexDirection: 'row',
                  marginTop: 9,
                  paddingTop: 9,
                  borderTopWidth: 0.5,
                  borderTopColor: COLORS.lineSoft,
                  borderTopStyle: 'solid',
                }}
              >
                {[
                  { label: meta.resultShort, value: count(ad.results) },
                  { label: 'Investido', value: money(ad.spend) },
                  { label: 'CTR', value: percent(ad.ctr, 1) },
                ].map((metric, metricIndex) => (
                  <View key={metric.label} style={{ flex: 1, paddingRight: metricIndex === 2 ? 0 : 5 }}>
                    <Text style={{ fontSize: 6.2, letterSpacing: 0.5, color: COLORS.textMuted, fontFamily: FONT, fontWeight: 'bold' }}>
                      {metric.label.toUpperCase()}
                    </Text>
                    <Text style={{ fontSize: 9, color: COLORS.text, fontFamily: FONT, fontWeight: 'bold', marginTop: 2 }}>
                      {metric.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
      </View>
    </ContentPage>
  );
}

// ── Página 6 — Público ──

function AudiencePage({ report, pageProps }) {
  const { audience, meta } = report;
  const columnWidth = (CONTENT_WIDTH - 22) / 2;

  const genderTotal = audience.gender.reduce((sum, item) => sum + item.results, 0);

  return (
    <ContentPage {...pageProps}>
      <SectionTitle
        eyebrow="Público"
        title="Quem foi impactado"
        description={`Distribuição de ${meta.resultLabel.toLowerCase()} entre os perfis alcançados pelos anúncios.`}
      />

      <View style={{ flexDirection: 'row' }}>
        {audience.age.length > 0 ? (
          <View style={{ width: columnWidth, marginRight: 22 }}>
            <SubTitle>Faixa etária</SubTitle>
            <HorizontalBars
              data={audience.age.map((item) => ({ label: `${item.label} anos`, value: item.results }))}
              width={columnWidth}
              valueFormatter={(value) => count(value)}
            />
          </View>
        ) : null}

        {audience.gender.length > 0 && genderTotal > 0 ? (
          <View style={{ width: columnWidth }}>
            <SubTitle>Gênero</SubTitle>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <DonutChart
                data={audience.gender.map((item) => ({ label: item.label, value: item.results }))}
                size={112}
                thickness={19}
                centerValue={compact(genderTotal)}
                centerLabel={meta.resultShort.toUpperCase()}
              />
              <View style={{ marginLeft: 14, flex: 1 }}>
                {audience.gender.map((item, index) => (
                  <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: index === audience.gender.length - 1 ? 0 : 8 }}>
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 2,
                        backgroundColor: ['#0FA5AE', '#20CFCF', '#0B7B85'][index % 3],
                        marginRight: 7,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 7.8, color: COLORS.text }}>{item.label}</Text>
                      <Text style={{ fontSize: 7, color: COLORS.textMuted, marginTop: 1 }}>
                        {count(item.results)} · {percent((item.results / genderTotal) * 100, 0)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {audience.region.length > 0 ? (
        <View style={{ marginTop: 26 }}>
          <SubTitle>Principais regiões</SubTitle>
          <Table
            columns={[
              { key: 'label', label: 'Região', width: '40%', strong: true },
              { key: 'resultsLabel', label: meta.resultShort, width: '20%', align: 'right' },
              { key: 'spendLabel', label: 'Investido', width: '20%', align: 'right' },
              { key: 'costLabel', label: 'Custo/result.', width: '20%', align: 'right' },
            ]}
            rows={audience.region.map((item) => ({
              key: item.label,
              label: item.label,
              resultsLabel: count(item.results),
              spendLabel: money(item.spend),
              costLabel: item.results > 0 ? money(item.costPerResult) : '—',
            }))}
          />
        </View>
      ) : null}
    </ContentPage>
  );
}

// ── Página 7 — Posicionamentos ──

function PlacementsPage({ report, pageProps }) {
  const { placements, meta } = report;
  const platformTotal = placements.platform.reduce((sum, item) => sum + item.spend, 0);

  return (
    <ContentPage {...pageProps}>
      <SectionTitle
        eyebrow="Distribuição"
        title="Onde os anúncios apareceram"
        description="Como o investimento se distribuiu entre plataformas e posicionamentos da Meta."
      />

      {placements.platform.length > 0 && platformTotal > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 26 }}>
          <DonutChart
            data={placements.platform.map((item) => ({ label: item.label, value: item.spend }))}
            size={124}
            thickness={21}
            centerValue={`R$ ${compact(platformTotal)}`}
            centerLabel="INVESTIDO"
          />
          <View style={{ marginLeft: 22, flex: 1 }}>
            {placements.platform.map((item, index) => (
              <View
                key={item.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 6,
                  borderBottomWidth: index === placements.platform.length - 1 ? 0 : 0.5,
                  borderBottomColor: COLORS.lineSoft,
                  borderBottomStyle: 'solid',
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    backgroundColor: ['#0FA5AE', '#20CFCF', '#0B7B85', '#38BDF8', '#818CF8'][index % 5],
                    marginRight: 8,
                  }}
                />
                <Text style={{ flex: 1, fontSize: 8.5, color: COLORS.text }}>{item.label}</Text>
                <Text style={{ fontSize: 8, color: COLORS.textSoft, width: 62, textAlign: 'right' }}>{money(item.spend)}</Text>
                <Text style={{ fontSize: 8, color: COLORS.textMuted, width: 42, textAlign: 'right' }}>
                  {percent((item.spend / platformTotal) * 100, 0)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {placements.placement.length > 0 ? (
        <View>
          <SubTitle>Posicionamentos com melhor retorno</SubTitle>
          <Table
            columns={[
              { key: 'label', label: 'Posicionamento', width: '40%', strong: true },
              { key: 'resultsLabel', label: meta.resultShort, width: '18%', align: 'right' },
              { key: 'spendLabel', label: 'Investido', width: '20%', align: 'right' },
              { key: 'costLabel', label: 'Custo/result.', width: '22%', align: 'right' },
            ]}
            rows={placements.placement.map((item) => ({
              key: item.label,
              label: item.label,
              resultsLabel: count(item.results),
              spendLabel: money(item.spend),
              costLabel: item.results > 0 ? money(item.costPerResult) : '—',
            }))}
          />
        </View>
      ) : null}
    </ContentPage>
  );
}

// ── Página 8 — Próximos passos ──

function NextStepsPage({ report, summary, pageProps }) {
  const { meta, totals, deltas } = report;

  return (
    <ContentPage {...pageProps}>
      <SectionTitle
        eyebrow="Plano de ação"
        title="Próximos passos"
        description="O que será trabalhado no próximo ciclo, com base no que os dados mostraram."
      />

      <View style={{ marginBottom: 24 }}>
        {summary.recommendations.map((recommendation, index) => (
          <View
            key={index}
            style={{
              flexDirection: 'row',
              backgroundColor: COLORS.surface,
              borderRadius: 7,
              borderWidth: 0.75,
              borderColor: COLORS.line,
              borderStyle: 'solid',
              padding: 12,
              marginBottom: index === summary.recommendations.length - 1 ? 0 : 9,
            }}
          >
            <View
              style={{
                width: 19,
                height: 19,
                borderRadius: 10,
                backgroundColor: COLORS.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 11,
              }}
            >
              <Text style={{ fontSize: 8.5, color: COLORS.onInk, fontFamily: FONT, fontWeight: 'bold' }}>{index + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 9, color: COLORS.textSoft, lineHeight: 1.5, paddingTop: 3 }}>
              {recommendation}
            </Text>
          </View>
        ))}
      </View>

      <CalloutBox title="Resumo do período" tone="dark">
        <View style={{ flexDirection: 'row' }}>
          {[
            { label: 'Investimento', value: money(totals.spend), delta: deltas.spend, neutral: true },
            { label: meta.resultShort, value: count(totals.results), delta: deltas.results, higherIsBetter: true },
            { label: 'Custo/result.', value: totals.results > 0 ? money(totals.costPerResult) : '—', delta: deltas.costPerResult, higherIsBetter: false },
          ].map((item, index) => (
            <View key={item.label} style={{ flex: 1, paddingRight: index === 2 ? 0 : 10 }}>
              <Text style={{ fontSize: 6.5, letterSpacing: 0.7, color: COLORS.textMuted, fontFamily: FONT, fontWeight: 'bold' }}>
                {item.label.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.text, fontFamily: FONT, fontWeight: 'bold', marginTop: 4 }}>
                {item.value}
              </Text>
              <View style={{ marginTop: 3 }}>
                <DeltaBadge value={item.delta} higherIsBetter={item.higherIsBetter} neutral={item.neutral} />
              </View>
            </View>
          ))}
        </View>
      </CalloutBox>

      {/* Encerramento */}
      <View
        style={{
          marginTop: 26,
          backgroundColor: COLORS.ink,
          borderRadius: 8,
          padding: 22,
        }}
      >
        <Text style={{ fontSize: 12, color: COLORS.onInk, fontFamily: FONT, fontWeight: 'bold', lineHeight: 1.4 }}>
          Seguimos acompanhando a operação de perto.
        </Text>
        <Text style={{ fontSize: 8.8, color: COLORS.onInkSoft, marginTop: 8, lineHeight: 1.55 }}>
          Qualquer dúvida sobre os números deste relatório, estamos à disposição para conversar e detalhar
          cada frente de trabalho.
        </Text>
        <View style={{ height: 0.75, backgroundColor: COLORS.inkLine, marginVertical: 16 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 9.5, color: COLORS.onInk, fontFamily: FONT, fontWeight: 'bold' }}>{meta.agencyName}</Text>
            <Text style={{ fontSize: 7.5, color: COLORS.onInkSoft, marginTop: 3 }}>Gestão de tráfego pago · Meta Ads</Text>
          </View>
          <Text style={{ fontSize: 7.5, color: COLORS.onInkSoft }}>{todayLabel()}</Text>
        </View>
      </View>

      <Text style={{ fontSize: 6.5, color: COLORS.textMuted, marginTop: 16, lineHeight: 1.5 }}>
        Dados extraídos da plataforma Meta Ads referentes ao período de {meta.period.label}.
        {meta.hasPrevious ? ` Comparações calculadas sobre ${meta.period.previousLabel}.` : ''}
        {summary.source === 'ai' ? ' Análise textual assistida por IA e revisada pela agência.' : ''}
      </Text>
    </ContentPage>
  );
}

// ── Documento ──

export default function ReportDocument({ report, summary }) {
  const pageProps = {
    agencyName: report.meta.agencyName,
    documentTitle: `${DOCUMENT_TITLE} · ${report.meta.period.label}`,
    clientName: report.meta.clientName,
  };

  const hasCreatives = report.ads.length > 0;
  const hasAudience = report.audience.age.length > 0 || report.audience.gender.length > 0 || report.audience.region.length > 0;
  const hasPlacements = report.placements.platform.length > 0 || report.placements.placement.length > 0;

  return (
    <Document
      title={`Relatório de Performance — ${report.meta.clientName} — ${report.meta.period.label}`}
      author={report.meta.agencyName}
      subject={`Meta Ads · ${report.meta.period.label}`}
      creator={report.meta.agencyName}
      producer={report.meta.agencyName}
    >
      <CoverPage report={report} />
      <SummaryPage report={report} summary={summary} pageProps={pageProps} />
      <IndicatorsPage report={report} pageProps={pageProps} />
      {report.campaigns.length > 0 ? <CampaignsPage report={report} pageProps={pageProps} /> : null}
      {hasCreatives ? <CreativesPage report={report} pageProps={pageProps} /> : null}
      {hasAudience ? <AudiencePage report={report} pageProps={pageProps} /> : null}
      {hasPlacements ? <PlacementsPage report={report} pageProps={pageProps} /> : null}
      <NextStepsPage report={report} summary={summary} pageProps={pageProps} />
    </Document>
  );
}
