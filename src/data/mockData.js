// ============================================================
// DADOS MOCKADOS — Sistema VilasMKT Marketing
// Estrutura pronta para integração com APIs reais
// ============================================================

const today = new Date();
const currentDay = today.getDate();
const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

// ============================================================
// CLIENTES
// ============================================================
export const clientsData = [
  {
    id: "client_001",
    name: "Escritório Silva & Associados",
    contactName: "Dr. André Silva",
    phone: "(73) 99912-3456",
    email: "andre@silvaadvocacia.com.br",
    niche: "previdenciario",
    platforms: ["meta"],
    metaAccountId: "act_001",
    monthlyBudget: 5000,
    contractStartDate: "2024-03-01",
    paymentDueDay: 10,
    status: "active",
    notes: "Cliente desde março/24. Foco em BPC-LOAS e aposentadoria por invalidez. Prefere reuniões às terças."
  },
  {
    id: "client_002",
    name: "Mendes Advocacia Previdenciária",
    contactName: "Dra. Camila Mendes",
    phone: "(71) 98845-7890",
    email: "camila@mendesadv.com.br",
    niche: "previdenciario",
    platforms: ["meta"],
    metaAccountId: "act_002",
    monthlyBudget: 3000,
    contractStartDate: "2024-06-15",
    paymentDueDay: 15,
    status: "active",
    notes: "Foco em aposentadoria especial e revisão de benefícios. Alto volume de mensagens."
  },
  {
    id: "client_003",
    name: "Oliveira & Ramos Advogados",
    contactName: "Dr. Paulo Oliveira",
    phone: "(73) 99934-5678",
    email: "paulo@oliveiraeramos.adv.br",
    niche: "trabalhista",
    platforms: ["meta"],
    metaAccountId: "act_003",
    monthlyBudget: 4000,
    contractStartDate: "2024-01-10",
    paymentDueDay: 5,
    status: "active",
    notes: "Trabalhista e previdenciário. Campanhas separadas por área. Cliente exigente com relatórios."
  },
  {
    id: "client_004",
    name: "Ferreira Advocacia",
    contactName: "Dr. Lucas Ferreira",
    phone: "(77) 99876-1234",
    email: "lucas@ferreiraadv.com.br",
    niche: "previdenciario",
    platforms: ["meta"],
    metaAccountId: "act_004",
    monthlyBudget: 2000,
    contractStartDate: "2024-09-01",
    paymentDueDay: 20,
    status: "active",
    notes: "Escritório novo, em fase de crescimento. Foco em auxílio-doença e BPC."
  },
  {
    id: "client_005",
    name: "Costa & Lima Sociedade de Advogados",
    contactName: "Dra. Juliana Costa",
    phone: "(71) 99765-4321",
    email: "juliana@costaelima.adv.br",
    niche: "trabalhista",
    platforms: ["meta"],
    metaAccountId: "act_005",
    monthlyBudget: 6000,
    contractStartDate: "2023-11-01",
    paymentDueDay: 10,
    status: "active",
    notes: "Maior conta. Trabalhista puro. Campanhas de alta performance. Reunião mensal obrigatória."
  },
  {
    id: "client_006",
    name: "Barbosa Advogados Associados",
    contactName: "Dr. Ricardo Barbosa",
    phone: "(73) 99654-9876",
    email: "ricardo@barbosaadv.com.br",
    niche: "tributario",
    platforms: ["meta"],
    metaAccountId: "act_006",
    monthlyBudget: 2500,
    contractStartDate: "2024-07-01",
    paymentDueDay: 25,
    status: "active",
    notes: "Tributário para empresas. Campanhas de conteúdo educativo + mensagens."
  },
  {
    id: "client_007",
    name: "Souza & Pereira Advocacia",
    contactName: "Dr. Marcos Souza",
    phone: "(77) 99543-2109",
    email: "marcos@souzapereira.adv.br",
    niche: "civil",
    platforms: ["meta"],
    metaAccountId: "act_007",
    monthlyBudget: 3500,
    contractStartDate: "2024-04-01",
    paymentDueDay: 15,
    status: "active",
    notes: "Direito civil e família. Público diferente dos previdenciários. Criativos com abordagem mais institucional."
  },
  {
    id: "client_008",
    name: "Almeida Advocacia Criminal",
    contactName: "Dra. Fernanda Almeida",
    phone: "(71) 99432-8765",
    email: "fernanda@almeidacriminal.adv.br",
    niche: "criminal",
    platforms: ["meta"],
    metaAccountId: "act_008",
    monthlyBudget: 1500,
    contractStartDate: "2025-01-15",
    paymentDueDay: 10,
    status: "onboarding",
    notes: "Cliente novo. Início em janeiro/25. Foco em criminal — precisa de criativos específicos."
  },
  {
    id: "client_009",
    name: "Teixeira & Santos Advocacia",
    contactName: "Dr. Roberto Teixeira",
    phone: "(73) 99321-6543",
    email: "roberto@teixeirasantos.adv.br",
    niche: "previdenciario",
    platforms: ["meta"],
    metaAccountId: "act_009",
    monthlyBudget: 4500,
    contractStartDate: "2024-02-01",
    paymentDueDay: 5,
    status: "active",
    notes: "Previdenciário puro. Excelente taxa de conversão. Referência para novos clientes."
  },
  {
    id: "client_010",
    name: "Moreira Advocacia",
    contactName: "Dr. Henrique Moreira",
    phone: "(77) 99210-5432",
    email: "henrique@moreiraadv.com.br",
    niche: "previdenciario",
    platforms: ["meta"],
    metaAccountId: "act_010",
    monthlyBudget: 2000,
    contractStartDate: "2024-08-01",
    paymentDueDay: 20,
    status: "paused",
    notes: "Pausou campanhas em fev/25 por férias. Retorno previsto para abril/25."
  },
  {
    id: "client_011",
    name: "Dias & Cardoso Advogados",
    contactName: "Dra. Patrícia Dias",
    phone: "(71) 99109-4321",
    email: "patricia@diascardoso.adv.br",
    niche: "trabalhista",
    platforms: ["meta"],
    metaAccountId: null,
    monthlyBudget: 3000,
    contractStartDate: "2024-05-01",
    paymentDueDay: 15,
    status: "active",
    notes: "Foco em Meta Ads para trabalhista."
  },
  {
    id: "client_012",
    name: "Araújo Advocacia Especializada",
    contactName: "Dr. Felipe Araújo",
    phone: "(73) 99087-3210",
    email: "felipe@araujoadvocacia.com.br",
    niche: "previdenciario",
    platforms: ["meta"],
    metaAccountId: "act_011",
    monthlyBudget: 1800,
    contractStartDate: "2024-10-01",
    paymentDueDay: 10,
    status: "defaulting",
    notes: "Inadimplente desde janeiro/25. Duas faturas em atraso. Campanhas pausadas."
  }
];

// ============================================================
// META ADS ACCOUNTS
// ============================================================
export const metaAccountsData = [
  {
    id: "act_001",
    clientId: "client_001",
    clientName: "Escritório Silva & Associados",
    accountId: "123456789001",
    status: "active",
    niche: "previdenciario",
    monthlyBudget: 5000,
    metrics: {
      spend: 1247.83,
      impressions: 67430,
      cpm: 18.50,
      linkClicks: 1842,
      cpc: 0.68,
      messagingConversationsStarted: 267,
      costPerMessage: 4.67,
      ctr: 2.73
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 165.20, messages: 38, impressions: 9200 },
      { date: "2026-03-03", spend: 172.40, messages: 41, impressions: 9800 },
      { date: "2026-03-04", spend: 158.90, messages: 35, impressions: 8900 },
      { date: "2026-03-05", spend: 181.30, messages: 43, impressions: 10200 },
      { date: "2026-03-06", spend: 190.50, messages: 45, impressions: 10800 },
      { date: "2026-03-07", spend: 195.23, messages: 42, impressions: 9530 },
      { date: "2026-03-08", spend: 184.30, messages: 23, impressions: 9000 }
    ]
  },
  {
    id: "act_002",
    clientId: "client_002",
    clientName: "Mendes Advocacia Previdenciária",
    accountId: "123456789002",
    status: "active",
    niche: "previdenciario",
    monthlyBudget: 3000,
    metrics: {
      spend: 743.21,
      impressions: 41200,
      cpm: 18.04,
      linkClicks: 1105,
      cpc: 0.67,
      messagingConversationsStarted: 178,
      costPerMessage: 4.17,
      ctr: 2.68
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 95.40, messages: 24, impressions: 5400 },
      { date: "2026-03-03", spend: 102.30, messages: 27, impressions: 5900 },
      { date: "2026-03-04", spend: 98.70, messages: 22, impressions: 5600 },
      { date: "2026-03-05", spend: 108.50, messages: 29, impressions: 6100 },
      { date: "2026-03-06", spend: 112.80, messages: 31, impressions: 6300 },
      { date: "2026-03-07", spend: 115.51, messages: 28, impressions: 5950 },
      { date: "2026-03-08", spend: 110.00, messages: 17, impressions: 5950 }
    ]
  },
  {
    id: "act_003",
    clientId: "client_003",
    clientName: "Oliveira & Ramos Advogados",
    accountId: "123456789003",
    status: "active",
    niche: "trabalhista",
    monthlyBudget: 2500,
    metrics: {
      spend: 612.45,
      impressions: 34500,
      cpm: 17.75,
      linkClicks: 920,
      cpc: 0.67,
      messagingConversationsStarted: 132,
      costPerMessage: 4.64,
      ctr: 2.67
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 78.30, messages: 17, impressions: 4400 },
      { date: "2026-03-03", spend: 82.10, messages: 19, impressions: 4700 },
      { date: "2026-03-04", spend: 76.90, messages: 16, impressions: 4300 },
      { date: "2026-03-05", spend: 88.40, messages: 21, impressions: 5000 },
      { date: "2026-03-06", spend: 91.50, messages: 22, impressions: 5100 },
      { date: "2026-03-07", spend: 99.25, messages: 20, impressions: 5500 },
      { date: "2026-03-08", spend: 96.00, messages: 17, impressions: 5500 }
    ]
  },
  {
    id: "act_004",
    clientId: "client_004",
    clientName: "Ferreira Advocacia",
    accountId: "123456789004",
    status: "active",
    niche: "previdenciario",
    monthlyBudget: 2000,
    metrics: {
      spend: 487.92,
      impressions: 28900,
      cpm: 16.88,
      linkClicks: 812,
      cpc: 0.60,
      messagingConversationsStarted: 118,
      costPerMessage: 4.13,
      ctr: 2.81
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 62.40, messages: 15, impressions: 3700 },
      { date: "2026-03-03", spend: 65.80, messages: 17, impressions: 3900 },
      { date: "2026-03-04", spend: 60.20, messages: 14, impressions: 3500 },
      { date: "2026-03-05", spend: 70.10, messages: 18, impressions: 4200 },
      { date: "2026-03-06", spend: 73.90, messages: 19, impressions: 4400 },
      { date: "2026-03-07", spend: 78.52, messages: 20, impressions: 4600 },
      { date: "2026-03-08", spend: 77.00, messages: 15, impressions: 4600 }
    ]
  },
  {
    id: "act_005",
    clientId: "client_005",
    clientName: "Costa & Lima Sociedade de Advogados",
    accountId: "123456789005",
    status: "active",
    niche: "trabalhista",
    monthlyBudget: 4000,
    metrics: {
      spend: 982.67,
      impressions: 53200,
      cpm: 18.47,
      linkClicks: 1456,
      cpc: 0.67,
      messagingConversationsStarted: 198,
      costPerMessage: 4.96,
      ctr: 2.74
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 125.30, messages: 25, impressions: 6800 },
      { date: "2026-03-03", spend: 132.40, messages: 28, impressions: 7200 },
      { date: "2026-03-04", spend: 120.80, messages: 24, impressions: 6500 },
      { date: "2026-03-05", spend: 140.50, messages: 30, impressions: 7600 },
      { date: "2026-03-06", spend: 148.20, messages: 32, impressions: 8000 },
      { date: "2026-03-07", spend: 155.47, messages: 34, impressions: 8500 },
      { date: "2026-03-08", spend: 160.00, messages: 25, impressions: 8600 }
    ]
  },
  {
    id: "act_006",
    clientId: "client_006",
    clientName: "Barbosa Advogados Associados",
    accountId: "123456789006",
    status: "active",
    niche: "tributario",
    monthlyBudget: 2500,
    metrics: {
      spend: 598.34,
      impressions: 32100,
      cpm: 18.64,
      linkClicks: 876,
      cpc: 0.68,
      messagingConversationsStarted: 89,
      costPerMessage: 6.72,
      ctr: 2.73
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 76.40, messages: 11, impressions: 4100 },
      { date: "2026-03-03", spend: 80.20, messages: 13, impressions: 4300 },
      { date: "2026-03-04", spend: 74.50, messages: 10, impressions: 4000 },
      { date: "2026-03-05", spend: 86.30, messages: 14, impressions: 4600 },
      { date: "2026-03-06", spend: 90.10, messages: 15, impressions: 4800 },
      { date: "2026-03-07", spend: 95.84, messages: 13, impressions: 5100 },
      { date: "2026-03-08", spend: 95.00, messages: 13, impressions: 5200 }
    ]
  },
  {
    id: "act_007",
    clientId: "client_007",
    clientName: "Souza & Pereira Advocacia",
    accountId: "123456789007",
    status: "active",
    niche: "civil",
    monthlyBudget: 2000,
    metrics: {
      spend: 478.56,
      impressions: 26800,
      cpm: 17.86,
      linkClicks: 734,
      cpc: 0.65,
      messagingConversationsStarted: 67,
      costPerMessage: 7.14,
      ctr: 2.74
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 60.80, messages: 8, impressions: 3400 },
      { date: "2026-03-03", spend: 64.30, messages: 10, impressions: 3600 },
      { date: "2026-03-04", spend: 58.90, messages: 7, impressions: 3200 },
      { date: "2026-03-05", spend: 69.40, messages: 11, impressions: 3800 },
      { date: "2026-03-06", spend: 72.80, messages: 12, impressions: 4000 },
      { date: "2026-03-07", spend: 76.36, messages: 10, impressions: 4300 },
      { date: "2026-03-08", spend: 76.00, messages: 9, impressions: 4500 }
    ]
  },
  {
    id: "act_008",
    clientId: "client_008",
    clientName: "Almeida Advocacia Criminal",
    accountId: "123456789008",
    status: "active",
    niche: "criminal",
    monthlyBudget: 1500,
    metrics: {
      spend: 345.12,
      impressions: 19800,
      cpm: 17.43,
      linkClicks: 543,
      cpc: 0.64,
      messagingConversationsStarted: 42,
      costPerMessage: 8.22,
      ctr: 2.74
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 44.20, messages: 5, impressions: 2500 },
      { date: "2026-03-03", spend: 46.80, messages: 6, impressions: 2700 },
      { date: "2026-03-04", spend: 42.50, messages: 5, impressions: 2400 },
      { date: "2026-03-05", spend: 50.30, messages: 7, impressions: 2900 },
      { date: "2026-03-06", spend: 52.60, messages: 7, impressions: 3000 },
      { date: "2026-03-07", spend: 55.72, messages: 6, impressions: 3100 },
      { date: "2026-03-08", spend: 53.00, messages: 6, impressions: 3200 }
    ]
  },
  {
    id: "act_009",
    clientId: "client_009",
    clientName: "Teixeira & Santos Advocacia",
    accountId: "123456789009",
    status: "active",
    niche: "previdenciario",
    monthlyBudget: 3000,
    metrics: {
      spend: 723.45,
      impressions: 39800,
      cpm: 18.18,
      linkClicks: 1098,
      cpc: 0.66,
      messagingConversationsStarted: 201,
      costPerMessage: 3.60,
      ctr: 2.76
    },
    dailyMetrics: [
      { date: "2026-03-02", spend: 92.30, messages: 26, impressions: 5100 },
      { date: "2026-03-03", spend: 97.40, messages: 29, impressions: 5400 },
      { date: "2026-03-04", spend: 89.80, messages: 24, impressions: 4900 },
      { date: "2026-03-05", spend: 104.20, messages: 31, impressions: 5700 },
      { date: "2026-03-06", spend: 108.50, messages: 33, impressions: 5900 },
      { date: "2026-03-07", spend: 115.25, messages: 30, impressions: 6300 },
      { date: "2026-03-08", spend: 116.00, messages: 28, impressions: 6500 }
    ]
  },
  {
    id: "act_010",
    clientId: "client_010",
    clientName: "Moreira Advocacia",
    accountId: "123456789010",
    status: "paused",
    niche: "previdenciario",
    monthlyBudget: 2000,
    metrics: {
      spend: 0,
      impressions: 0,
      cpm: 0,
      linkClicks: 0,
      cpc: 0,
      messagingConversationsStarted: 0,
      costPerMessage: 0,
      ctr: 0
    },
    dailyMetrics: []
  },
  {
    id: "act_011",
    clientId: "client_012",
    clientName: "Araújo Advocacia Especializada",
    accountId: "123456789011",
    status: "problem",
    niche: "previdenciario",
    monthlyBudget: 1800,
    metrics: {
      spend: 0,
      impressions: 0,
      cpm: 0,
      linkClicks: 0,
      cpc: 0,
      messagingConversationsStarted: 0,
      costPerMessage: 0,
      ctr: 0
    },
    dailyMetrics: []
  }
];

// ============================================================
// META BALANCES
// ============================================================
export const metaBalancesData = [
  {
    accountId: "act_001", clientName: "Escritório Silva & Associados", currentBalance: 842.50, creditLimit: 2000,
    spentToday: 184.30, avgDailySpend7d: 178.26, estimatedDaysRemaining: 4.7, paymentMethod: "credit_card", lastTopUp: "2026-03-05T14:00:00"
  },
  {
    accountId: "act_002", clientName: "Mendes Advocacia Previdenciária", currentBalance: 127.45, creditLimit: 500,
    spentToday: 110.00, avgDailySpend7d: 103.10, estimatedDaysRemaining: 1.2, paymentMethod: "boleto", lastTopUp: "2026-03-01T10:00:00"
  },
  {
    accountId: "act_003", clientName: "Oliveira & Ramos Advogados", currentBalance: 312.80, creditLimit: 1000,
    spentToday: 96.00, avgDailySpend7d: 85.18, estimatedDaysRemaining: 3.7, paymentMethod: "credit_card", lastTopUp: "2026-03-03T16:00:00"
  },
  {
    accountId: "act_004", clientName: "Ferreira Advocacia", currentBalance: 45.20, creditLimit: 300,
    spentToday: 77.00, avgDailySpend7d: 68.42, estimatedDaysRemaining: 0.7, paymentMethod: "boleto", lastTopUp: "2026-02-28T09:00:00"
  },
  {
    accountId: "act_005", clientName: "Costa & Lima Sociedade de Advogados", currentBalance: 567.30, creditLimit: 1500,
    spentToday: 160.00, avgDailySpend7d: 138.89, estimatedDaysRemaining: 4.1, paymentMethod: "credit_card", lastTopUp: "2026-03-04T11:00:00"
  },
  {
    accountId: "act_006", clientName: "Barbosa Advogados Associados", currentBalance: 198.60, creditLimit: 600,
    spentToday: 95.00, avgDailySpend7d: 83.34, estimatedDaysRemaining: 2.4, paymentMethod: "pix", lastTopUp: "2026-03-02T13:00:00"
  },
  {
    accountId: "act_007", clientName: "Souza & Pereira Advocacia", currentBalance: 89.40, creditLimit: 500,
    spentToday: 76.00, avgDailySpend7d: 66.79, estimatedDaysRemaining: 1.3, paymentMethod: "boleto", lastTopUp: "2026-03-01T15:00:00"
  },
  {
    accountId: "act_008", clientName: "Almeida Advocacia Criminal", currentBalance: 234.50, creditLimit: 400,
    spentToday: 53.00, avgDailySpend7d: 48.66, estimatedDaysRemaining: 4.8, paymentMethod: "credit_card", lastTopUp: "2026-03-06T10:00:00"
  },
  {
    accountId: "act_009", clientName: "Teixeira & Santos Advocacia", currentBalance: 412.30, creditLimit: 800,
    spentToday: 116.00, avgDailySpend7d: 101.06, estimatedDaysRemaining: 4.1, paymentMethod: "credit_card", lastTopUp: "2026-03-04T09:00:00"
  },
  {
    accountId: "act_010", clientName: "Moreira Advocacia", currentBalance: 0, creditLimit: 500,
    spentToday: 0, avgDailySpend7d: 0, estimatedDaysRemaining: 0, paymentMethod: "boleto", lastTopUp: "2026-01-15T10:00:00"
  },
  {
    accountId: "act_011", clientName: "Araújo Advocacia Especializada", currentBalance: 0, creditLimit: 400,
    spentToday: 0, avgDailySpend7d: 0, estimatedDaysRemaining: 0, paymentMethod: "boleto", lastTopUp: "2025-12-20T10:00:00"
  }
];

// ============================================================
// ALERTS
// ============================================================
export const alertsData = [
  {
    id: 1, type: "critical", platform: "meta", accountName: "Ferreira Advocacia", accountId: "act_004",
    message: "Saldo abaixo de R$ 50,00 — campanhas podem pausar a qualquer momento",
    timestamp: "2026-03-08T07:30:00", read: false
  },
  {
    id: 2, type: "critical", platform: "meta", accountName: "Mendes Advocacia Previdenciária", accountId: "act_002",
    message: "Saldo de R$ 127,45 com gasto diário de R$ 103. Estimativa: 1,2 dias restantes",
    timestamp: "2026-03-08T07:45:00", read: false
  },
  {
    id: 3, type: "critical", platform: "meta", accountName: "Dias & Cardoso Advogados", accountId: "gads_006",
    message: "Saldo de R$ 38,40 — menos de 1 dia restante. Recarregar urgentemente",
    timestamp: "2026-03-08T08:00:00", read: false
  },
  {
    id: 4, type: "warning", platform: "meta", accountName: "Souza & Pereira Advocacia", accountId: "act_007",
    message: "Saldo de R$ 89,40 — aproximadamente 1,3 dias restantes",
    timestamp: "2026-03-08T08:15:00", read: false
  },
  {
    id: 5, type: "warning", platform: "meta", accountName: "Barbosa Advogados Associados", accountId: "act_006",
    message: "Custo por mensagem subiu para R$ 6,72 — acima da meta de R$ 5,00",
    timestamp: "2026-03-08T09:00:00", read: false
  },
  {
    id: 6, type: "warning", platform: "meta", accountName: "Almeida Advocacia Criminal", accountId: "act_008",
    message: "Custo por mensagem em R$ 8,22 — muito acima do benchmark. Revisar criativos",
    timestamp: "2026-03-08T09:15:00", read: false
  },
  {
    id: 7, type: "warning", platform: "meta", accountName: "Souza & Pereira Advocacia", accountId: "gads_004",
    message: "Cobrança rejeitada no cartão. Verificar método de pagamento",
    timestamp: "2026-03-08T08:30:00", read: false
  },
  {
    id: 8, type: "info", platform: "meta", accountName: "Teixeira & Santos Advocacia", accountId: "act_009",
    message: "Melhor custo por mensagem do mês: R$ 3,60. Performance excelente!",
    timestamp: "2026-03-08T10:00:00", read: true
  },
  {
    id: 9, type: "warning", platform: "meta", accountName: "Araújo Advocacia Especializada", accountId: "act_011",
    message: "Conta com status 'Problema' — verificar inadimplência do cliente",
    timestamp: "2026-03-08T07:00:00", read: false
  },
  {
    id: 10, type: "info", platform: "meta", accountName: "Costa & Lima Sociedade de Advogados", accountId: "act_005",
    message: "Gasto 15% acima do ritmo planejado. Projeção: R$ 4.600 vs orçamento de R$ 4.000",
    timestamp: "2026-03-08T10:30:00", read: false
  }
];

// ============================================================
// CALENDAR EVENTS
// ============================================================
export const calendarEventsData = [
  {
    id: "evt_001", title: "Reunião Mensal — Dr. André Silva", client: "Escritório Silva & Associados",
    start: "2026-03-08T10:00:00", end: "2026-03-08T11:00:00", type: "client_meeting",
    meetingLink: "https://meet.google.com/abc-defg-hij", notes: "Revisar resultados de fevereiro e ajustar orçamento de março"
  },
  {
    id: "evt_002", title: "Análise de Criativos", client: null,
    start: "2026-03-08T14:00:00", end: "2026-03-08T15:30:00", type: "focus_block",
    meetingLink: null, notes: "Revisar performance dos vídeos novos de BPC-LOAS"
  },
  {
    id: "evt_003", title: "Call Dra. Camila — Resultados", client: "Mendes Advocacia Previdenciária",
    start: "2026-03-09T09:00:00", end: "2026-03-09T09:30:00", type: "client_meeting",
    meetingLink: "https://meet.google.com/xyz-abcd-efg", notes: "Apresentar relatório semanal"
  },
  {
    id: "evt_004", title: "Produção de Conteúdo", client: null,
    start: "2026-03-09T13:00:00", end: "2026-03-09T16:00:00", type: "focus_block",
    meetingLink: null, notes: "Gravar 3 vídeos para campanhas previdenciário"
  },
  {
    id: "evt_005", title: "Reunião — Dr. Paulo Oliveira", client: "Oliveira & Ramos Advogados",
    start: "2026-03-10T11:00:00", end: "2026-03-10T12:00:00", type: "client_meeting",
    meetingLink: "https://zoom.us/j/123456789", notes: "Discutir expansao de campanhas"
  },
  {
    id: "evt_006", title: "Planejamento Semanal", client: null,
    start: "2026-03-10T08:00:00", end: "2026-03-10T09:00:00", type: "internal",
    meetingLink: null, notes: "Planejar ações da semana e priorizar contas"
  },
  {
    id: "evt_007", title: "Reunião Mensal — Dra. Juliana Costa", client: "Costa & Lima Sociedade de Advogados",
    start: "2026-03-10T14:00:00", end: "2026-03-10T15:00:00", type: "client_meeting",
    meetingLink: "https://meet.google.com/mno-pqrs-tuv", notes: "Relatório mensal + aprovação de novos criativos"
  },
  {
    id: "evt_008", title: "Otimização de Campanhas", client: null,
    start: "2026-03-11T09:00:00", end: "2026-03-11T12:00:00", type: "focus_block",
    meetingLink: null, notes: "Bloco de foco para otimizar campanhas com alto CPM"
  },
  {
    id: "evt_009", title: "Onboarding — Dra. Fernanda Almeida", client: "Almeida Advocacia Criminal",
    start: "2026-03-11T14:00:00", end: "2026-03-11T15:30:00", type: "client_meeting",
    meetingLink: "https://meet.google.com/uvw-xyza-bcd", notes: "Finalizar setup da conta e aprovar primeiros criativos"
  },
  {
    id: "evt_010", title: "Review de Performance", client: null,
    start: "2026-03-12T10:00:00", end: "2026-03-12T11:30:00", type: "internal",
    meetingLink: null, notes: "Analisar metricas de performance de todas as contas Meta"
  },
  {
    id: "evt_011", title: "Call Dr. Marcos Souza", client: "Souza & Pereira Advocacia",
    start: "2026-03-12T15:00:00", end: "2026-03-12T15:30:00", type: "client_meeting",
    meetingLink: "https://meet.google.com/efg-hijk-lmn", notes: "Discutir resultados e próximos passos"
  },
  {
    id: "evt_012", title: "Reunião Equipe Interna", client: null,
    start: "2026-03-13T09:00:00", end: "2026-03-13T10:00:00", type: "internal",
    meetingLink: "https://meet.google.com/opq-rstu-vwx", notes: "Alinhamento semanal da equipe"
  },
  {
    id: "evt_013", title: "Call — Dra. Patrícia Dias", client: "Dias & Cardoso Advogados",
    start: "2026-03-13T14:00:00", end: "2026-03-13T14:30:00", type: "client_meeting",
    meetingLink: "https://meet.google.com/yza-bcde-fgh", notes: "Discutir expansao de budget"
  },
  {
    id: "evt_014", title: "Análise de Métricas Avançadas", client: null,
    start: "2026-03-14T09:00:00", end: "2026-03-14T12:00:00", type: "focus_block",
    meetingLink: null, notes: "Deep dive em frequência e hook rate dos vídeos"
  }
];

// ============================================================
// CHECKLIST
// ============================================================
export const defaultChecklistItems = [
  { id: "chk_001", text: "Verificar saldos de todas as contas Meta", completed: false, completedAt: null },
  { id: "chk_002", text: "Verificar saldos de todas as contas Meta", completed: false, completedAt: null },
  { id: "chk_003", text: "Checar campanhas pausadas por erro", completed: false, completedAt: null },
  { id: "chk_004", text: "Revisar métricas das campanhas principais", completed: false, completedAt: null },
  { id: "chk_005", text: "Responder mensagens de clientes", completed: false, completedAt: null },
  { id: "chk_006", text: "Verificar agendamentos do dia", completed: false, completedAt: null },
  { id: "chk_007", text: "Analisar criativos com baixo desempenho", completed: false, completedAt: null },
  { id: "chk_008", text: "Documentar alterações no Log", completed: false, completedAt: null }
];

// ============================================================
// CHANGE LOG
// ============================================================
export const changeLogData = [
  {
    id: "log_001", date: "2026-03-08T14:30:00", platform: "meta", clientName: "Escritório Silva & Associados",
    accountId: "act_001", campaignName: "BPC-LOAS | Mensagens | Março",
    changeType: "creative", description: "Troquei o criativo principal por vídeo novo (formato reels). Público mantido.",
    previousValue: "Imagem estática carrossel 3 cards", newValue: "Vídeo 60s formato vertical", impact: "pending"
  },
  {
    id: "log_002", date: "2026-03-07T16:45:00", platform: "meta", clientName: "Mendes Advocacia Previdenciária",
    accountId: "act_002", campaignName: "Aposentadoria Especial | WhatsApp",
    changeType: "audience", description: "Expandido público de 45-65 para 35-65 anos. Incluído interesse em INSS.",
    previousValue: "45-65 anos, interesse: aposentadoria", newValue: "35-65 anos, interesse: aposentadoria + INSS", impact: "positive"
  },
  {
    id: "log_003", date: "2026-03-07T10:20:00", platform: "meta", clientName: "Costa & Lima Sociedade de Advogados",
    accountId: "gads_003", campaignName: "Search | Advogado Trabalhista",
    changeType: "bid", description: "Ajustado lance máximo de CPC para palavras-chave principais.",
    previousValue: "CPC máx: R$ 1,80", newValue: "CPC máx: R$ 2,20", impact: "pending"
  },
  {
    id: "log_004", date: "2026-03-06T09:15:00", platform: "meta", clientName: "Ferreira Advocacia",
    accountId: "act_004", campaignName: "Auxílio-Doença | Messenger",
    changeType: "budget", description: "Aumentado orçamento diário após bons resultados na primeira semana.",
    previousValue: "R$ 50/dia", newValue: "R$ 70/dia", impact: "positive"
  },
  {
    id: "log_005", date: "2026-03-05T14:00:00", platform: "meta", clientName: "Barbosa Advogados Associados",
    accountId: "act_006", campaignName: "Tributário Empresas | WhatsApp",
    changeType: "copy", description: "Alterado texto do anúncio para ser mais direto e com CTA mais forte.",
    previousValue: "Texto longo com 3 parágrafos", newValue: "Texto curto com pergunta + CTA direto", impact: "positive"
  },
  {
    id: "log_006", date: "2026-03-04T11:30:00", platform: "meta", clientName: "Teixeira & Santos Advocacia",
    accountId: "gads_005", campaignName: "Search | BPC LOAS",
    changeType: "targeting", description: "Adicionadas palavras-chave negativas para reduzir cliques irrelevantes.",
    previousValue: "23 palavras-chave negativas", newValue: "41 palavras-chave negativas", impact: "positive"
  },
  {
    id: "log_007", date: "2026-03-03T16:00:00", platform: "meta", clientName: "Souza & Pereira Advocacia",
    accountId: "act_007", campaignName: "Direito de Família | Mensagens",
    changeType: "new_campaign", description: "Criada nova campanha focada em divórcio consensual. Público feminino 30-55.",
    previousValue: null, newValue: "Nova campanha: Divórcio | Mensagens | Março", impact: "pending"
  },
  {
    id: "log_008", date: "2026-03-02T09:00:00", platform: "meta", clientName: "Moreira Advocacia",
    accountId: "act_010", campaignName: "Todas as campanhas",
    changeType: "pause", description: "Pausadas todas as campanhas a pedido do cliente (férias).",
    previousValue: "Ativas", newValue: "Pausadas", impact: "neutral"
  }
];

// ============================================================
// CAMPAIGNS (for Detailed View)
// ============================================================
export const metaCampaignsData = {
  act_001: [
    {
      id: "camp_001", name: "BPC-LOAS | Mensagens | Março", status: "active", objective: "messages",
      spend: 523.40, impressions: 28300, clicks: 780, ctr: 2.76, messages: 112, costPerMessage: 4.67,
      frequency: 2.8, hookRate: 45.2, holdRate: 28.1, thruPlayRate: 22.5, costPerThruPlay: 0.42
    },
    {
      id: "camp_002", name: "Aposentadoria Invalidez | WhatsApp", status: "active", objective: "messages",
      spend: 412.30, impressions: 22100, clicks: 612, ctr: 2.77, messages: 89, costPerMessage: 4.63,
      frequency: 2.4, hookRate: 52.1, holdRate: 31.4, thruPlayRate: 25.8, costPerThruPlay: 0.38
    },
    {
      id: "camp_003", name: "Remarketing | Silva | Março", status: "active", objective: "messages",
      spend: 312.13, impressions: 17030, clicks: 450, ctr: 2.64, messages: 66, costPerMessage: 4.73,
      frequency: 3.8, hookRate: 38.4, holdRate: 22.3, thruPlayRate: 18.1, costPerThruPlay: 0.52
    }
  ],
  act_002: [
    {
      id: "camp_004", name: "Aposentadoria Especial | WhatsApp", status: "active", objective: "messages",
      spend: 456.80, impressions: 25400, clicks: 681, ctr: 2.68, messages: 112, costPerMessage: 4.08,
      frequency: 2.1, hookRate: 48.3, holdRate: 30.2, thruPlayRate: 24.1, costPerThruPlay: 0.40
    },
    {
      id: "camp_005", name: "Revisão de Benefícios | Messenger", status: "active", objective: "messages",
      spend: 286.41, impressions: 15800, clicks: 424, ctr: 2.68, messages: 66, costPerMessage: 4.34,
      frequency: 1.9, hookRate: 44.7, holdRate: 27.8, thruPlayRate: 21.3, costPerThruPlay: 0.44
    }
  ]
};

// ============================================================
// BUDGET PACING
// ============================================================
export function calculateBudgetPacing(accounts) {
  return accounts.filter(a => a.status === 'active').map(account => {
    const expectedDaily = account.monthlyBudget / daysInMonth;
    const expectedToDate = expectedDaily * currentDay;
    const actualSpend = account.metrics.spend;
    const pacingPct = expectedToDate > 0 ? (actualSpend / expectedToDate) * 100 : 0;
    const projected = currentDay > 0 ? (actualSpend / currentDay) * daysInMonth : 0;

    let status = 'on_track';
    if (pacingPct > 120) status = 'overspending';
    else if (pacingPct > 110) status = 'slightly_over';
    else if (pacingPct < 80) status = 'underspending';
    else if (pacingPct < 90) status = 'slightly_under';

    return {
      accountId: account.id,
      clientName: account.clientName,
      platform: 'meta',
      monthlyBudget: account.monthlyBudget,
      expectedDaily,
      expectedToDate,
      actualSpend,
      pacingPercentage: pacingPct,
      projectedMonthly: projected,
      status
    };
  });
}
