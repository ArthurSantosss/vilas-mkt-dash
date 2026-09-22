# Configurar Google Ads na plataforma

A integração aceita vários e-mails Google. Conecte separadamente cada perfil que tem acesso às contas de anúncios ou às MCCs. Não é necessário mover as contas diretas para uma MCC. Contas repetidas aparecem uma única vez; a plataforma prefere um caminho sem falha conhecida e, entre caminhos equivalentes, o acesso direto.

## 1. Preparar o Supabase

No projeto Supabase usado pela plataforma, abra **SQL Editor** e execute o conteúdo completo de:

[`supabase/migrations/20260922000000_google_ads_private_connections.sql`](../supabase/migrations/20260922000000_google_ads_private_connections.sql)

A migração cria duas tabelas privadas (`google_ads_connections` e `google_ads_oauth_states`), restringe o acesso ao servidor e remove a credencial antiga de `app_preferences`. As demais preferências permanecem na tabela original. A migração pode ser executada novamente.

Se chegou a conectar o Google Ads na versão anterior, remova a autorização antiga deste app em [Conexões da sua Conta Google](https://myaccount.google.com/connections), em cada perfil usado. O token antigo era salvo em uma tabela cuja migração permitia acesso público; apagar o registro não revoga uma eventual cópia desse token. Depois conecte novamente pelo novo fluxo. Revogue apenas a autorização deste aplicativo; se ele também atende outra integração Google, será necessário reconectá-la.

Obtenha a **service_role key** nas configurações de API do Supabase. Ela será configurada somente no ambiente do servidor. Nunca use prefixo `VITE_`, nem coloque essa chave no código do frontend.

## 2. Preparar o Google Cloud

1. Selecione ou crie o projeto Google Cloud da plataforma e habilite a **Google Ads API**.
2. Confira o acesso a contas reais no [Google Ads API Overview](https://console.cloud.google.com/apis/api/googleads.googleapis.com/overview) desse projeto. Acesso **Test** não basta para consultar contas reais. Solicite o nível apropriado disponível para o projeto.
3. Configure a tela de consentimento no **Google Auth Platform**. Como os perfis podem ser de organizações diferentes ou Gmail pessoal, use público **External**, salvo se todos pertencerem à mesma organização Workspace e o aplicativo for realmente interno.
4. Configure os escopos `https://www.googleapis.com/auth/adwords`, `openid` e `email`. O acesso ao e-mail identifica cada perfil na plataforma. A API Ads não oferece um escopo OAuth separado apenas para leitura; os endpoints implementados aqui só consultam dados.
5. Durante a fase de testes, adicione **todos os e-mails que você vai conectar** à lista de test users. Aplicativos externos em Testing normalmente recebem refresh tokens com validade de sete dias para esses escopos. Para uso contínuo, configure a publicação e conclua as verificações que o Google exigir.
6. Crie uma credencial OAuth do tipo **Web application**. Em **Authorized redirect URIs**, cadastre exatamente `https://SEU-DOMINIO/auth/callback`. Não use curingas nem acrescente uma barra ao final. O domínio precisa ser o mesmo pelo qual você abre a plataforma.
7. Copie o **Client ID** e o **Client secret** para as variáveis do servidor abaixo. Você utiliza um único cliente OAuth para os vários perfis Google; cada perfil autoriza esse mesmo app.

Em setembro de 2026, o Google transferiu os níveis de acesso do developer token para o projeto Cloud que possui as credenciais OAuth. Esta implementação usa a API v25 e não exige nem envia developer token. Consulte a [migração oficial](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) caso já tenha iniciado a configuração pelo antigo API Center da MCC.

## 3. Configurar o ambiente e publicar

Na Vercel, abra o projeto da plataforma em **Settings → Environment Variables**. Configure no ambiente em que será publicada a aplicação:

| Variável | Valor |
| --- | --- |
| `GOOGLE_ADS_CLIENT_ID` | Client ID do cliente OAuth Web |
| `GOOGLE_ADS_CLIENT_SECRET` | Client secret do mesmo cliente |
| `GOOGLE_ADS_REDIRECT_URI` | `https://SEU-DOMINIO/auth/callback`, idêntico ao cadastro Google |
| `SUPABASE_URL` | URL do projeto Supabase da plataforma |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role do mesmo projeto |
| `AUTH_EMAIL` | E-mail usado para entrar na plataforma, não necessariamente um dos perfis Google |
| `AUTH_PASS` | Senha de entrada da plataforma |
| `AUTH_SESSION_SECRET` | Segredo aleatório, por exemplo gerado com `openssl rand -hex 32` |

As configurações públicas existentes de Supabase e outras integrações continuam necessárias. Não substitua a chave pública do frontend pela service_role. Não configure `VITE_AUTH_PASS`: segredos com prefixo `VITE_` podem ser incorporados ao JavaScript público.

Publique o código atualizado depois de executar a migração e cadastrar as variáveis. Alterações nas variáveis da Vercel exigem um novo deploy. A configuração de função permite até 300 segundos para sincronização, sujeito aos limites do plano da hospedagem.

Para desenvolvimento local, use as mesmas variáveis em `.env`, com `GOOGLE_ADS_REDIRECT_URI=http://localhost:5173/auth/callback` e essa URL também cadastrada no OAuth. Inicie com `npm run dev`. O login é obrigatório também no localhost. Use um projeto/banco de desenvolvimento se quiser testar sem afetar as conexões de produção.

## 4. Conectar os perfis

1. Saia e entre novamente na plataforma para obter uma sessão válida.
2. Abra **Configurações → Google Ads → Conectar Google Ads**.
3. Escolha o primeiro e-mail, confirme a autorização e aguarde o retorno à plataforma.
4. Clique em **Adicionar perfil Google** e repita com os demais e-mails.
5. Confira a lista: cada conta mostra o e-mail de acesso e se o caminho é direto ou por MCC.
6. Use **Sincronizar contas** depois de ganhar/perder acesso a uma conta ou alterar vínculos de MCC.

O botão **Desconectar** remove somente a conexão escolhida da plataforma. Ele não revoga a autorização do aplicativo no Google; para isso, use a página Conexões da Conta Google. Não desconectamos outros perfis ao adicionar um novo.

## 5. Conferir o resultado

Na página **Visão Detalhada**, selecione **Google Ads** para abrir as contas e campanhas dessa integração. O Dashboard reúne Meta e Google e exibe um aviso quando houver falha de atualização Google.

- Selecione uma conta com acesso direto e uma gerenciada pela MCC, preferencialmente de e-mails diferentes.
- Compare gasto, cliques, impressões e conversões com o Google Ads no mesmo período e com as mesmas colunas de conversão. O app usa `metrics.conversions` e `metrics.conversions_value`, não “Todas as conversões”.
- Compare os totais incluindo campanhas removidas: elas continuam entrando no histórico do período.
- Datas relativas são calculadas no fuso da conta. “Este mês” inclui hoje; 7/14/30 dias usam dias completos até ontem.
- Se um perfil falhar, confira o aviso em Configurações; as demais conexões continuam sendo sincronizadas. Contas anteriores de um caminho com falha permanecem na lista até uma sincronização bem-sucedida, acompanhadas do aviso.
- O dashboard só apresenta os dados de contas cuja consulta terminou com sucesso; um aviso de consulta deve ser resolvido antes de usar o agregado como total de todas as contas.

## Erros comuns

| Mensagem | Ação |
| --- | --- |
| `redirect_uri_mismatch` | Igualar domínio, protocolo, porta e `/auth/callback` no Google e na variável do servidor |
| Sessão expirada / 401 | Sair e entrar novamente na plataforma; conferir `AUTH_EMAIL`, `AUTH_PASS` e segredo do servidor |
| Origem não autorizada | Abrir a plataforma no domínio cadastrado em `GOOGLE_ADS_REDIRECT_URI`; previews têm domínios diferentes |
| Migração ou conexão privada indisponível | Executar a migração no projeto correto e conferir URL + service_role no servidor |
| `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` | Conferir a aprovação do projeto Cloud que possui o cliente OAuth |
| `invalid_grant` | Autorizar novamente o mesmo perfil; conferir revogação e modo Testing |
| Conta não aparece | Verificar se o e-mail escolhido tem acesso à conta ou à MCC; conectar outro perfil se necessário e sincronizar |

## O que foi validado nesta alteração

Testes automatizados com respostas simuladas de Google/Supabase cobrem sessão, OAuth com PKCE e state de uso único, dois perfis, desconexão individual, MCC/sub-MCC, deduplicação, falhas parciais, paginação, mais de 500 campanhas, datas e roteamento do token no servidor. Build e lint executados. A migração não foi aplicada a um banco real e as consultas reais aguardam configuração das credenciais e consentimento dos perfis.

Referências: [OAuth Web Server](https://developers.google.com/identity/protocols/oauth2/web-server), [expiração de tokens](https://developers.google.com/identity/protocols/oauth2#expiration), [modelo de acesso Ads](https://developers.google.com/google-ads/api/docs/oauth/access-model), [paginação](https://developers.google.com/google-ads/api/docs/reporting/paging).
