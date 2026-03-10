# Controle de Revisão - Histórico de Atualizações

---

## 1. Integração Gmail IMAP

### Contexto

O sistema de controle de revisão gerencia uma frota de tratores, rastreando revisões periódicas (50h, 300h, 600h... até 3000h). Os dados ficam no Supabase e o dashboard é feito em Next.js.

O objetivo era baixar ~5037 emails de uma conta Gmail para verificar quais revisões foram ou não notificadas por email.

### Decisão: IMAP vs Gmail API vs Resend

| Opção | Custo | Complexidade | Observação |
|-------|-------|-------------|------------|
| **Resend API** | Grátis | Baixa | Só lista emails enviados pelo Resend, não serve para emails já enviados pelo Gmail |
| **Gmail API** | Grátis | Alta | Precisa criar projeto no Google Cloud Console, configurar OAuth2 |
| **IMAP (escolhido)** | Grátis | Média | Simples, sem dependência de Google Cloud, usa senha de app |

**Escolha: IMAP** — gratuito, sem necessidade de Google Cloud Console, e resolve bem o caso de uso.

### Padrão dos Emails

O assunto dos emails de revisão segue o formato:

```
CHEQUE DE REVISÃO - {HORAS} HORAS - {MODELO} {CHASSIS_FINAL}
```

Exemplo:
```
CHEQUE DE REVISÃO - 3000 HORAS - 6075E CAB 3787
```

Onde:
- **HORAS** = horas da revisão (3000)
- **MODELO** = modelo do trator (6075E CAB)
- **CHASSIS_FINAL** = últimos dígitos do chassis (3787)

Regex usada para parsing:
```ts
/(\d+)\s*HORAS?\s*-\s*(.+?)\s+(\S+)\s*$/i
```

### O que foi implementado

#### Credenciais no `.env.local`

```
GMAIL_USER=posvendas.novatratores@gmail.com
GMAIL_APP_PASSWORD=vuak yzex ycpm mydd
```

> `.env*` já está no `.gitignore`, então as credenciais não vão para o repositório.

#### Dependência instalada

```bash
npm install imapflow
```

#### API Route: `/api/emails` (`app/api/emails/route.ts`)

- Conecta via IMAP ao Gmail (imap.gmail.com:993)
- Abre a pasta "[Gmail]/E-mails enviados"
- Itera por todos os emails
- Filtra os que contêm "cheque de revis" no assunto
- Extrai: horas, modelo, final do chassis
- Retorna JSON com `{ total, emails[] }`

```ts
interface EmailRevisao {
  subject: string;
  date: string;
  horas: string | null;
  modelo: string | null;
  chassisFinal: string | null;
  attachments: EmailAttachment[];
}
```

#### Integração no Dashboard (`app/page.tsx`)

- Botão "VERIFICAR EMAILS" no header
- Indicador nos cards (roxo = emails encontrados, laranja = nenhum)
- Indicador na timeline do modal ("EMAIL ENVIADO" / "SEM EMAIL")

#### Lógica de cruzamento

```ts
// Compara os últimos caracteres do chassis com o final extraído do assunto
const emailsDoChassis = (chassis: string) => {
  return emails.filter(e => e.chassisFinal && chassis.endsWith(e.chassisFinal));
};

// Verifica se existe email para uma revisão específica
const emailDaRevisao = (chassis: string, rev: string) => {
  const horasRev = rev.replace("h", "");
  return emailsDoChassis(chassis).find(e => e.horas === horasRev) || null;
};
```

### Configuração da Senha de App do Gmail

1. Acessar **myaccount.google.com**
2. **Segurança** → ativar **Verificação em duas etapas**
3. Buscar **Senhas de app** → criar uma para "E-mail"
4. Copiar a senha gerada (formato: `abcd efgh ijkl mnop`)
5. Colocar no `.env.local` como `GMAIL_APP_PASSWORD`

---

## 2. Tema Escuro, Filtros e Detalhes de Email

### Tema Escuro
- Fundo `gray-950` em toda a aplicação
- Cards em `gray-900`, bordas em `gray-800`
- Scrollbar estilizada para tema escuro
- CSS forçando cores escuras (removido `prefers-color-scheme`)
- Select dropdown com fundo escuro

### Fontes Maiores
- Titulo: `text-5xl` (era `text-4xl`)
- Chassis nos cards: `text-3xl` (era `text-2xl`)
- Labels: `text-sm`/`text-base` (eram `text-[9px]`/`text-[10px]`)
- Textos gerais: `text-base`/`text-lg` (eram `text-xs`/`text-sm`)

### Filtros Adicionados
- **Filtro por Cliente**: dropdown que lista todos os clientes
- **Filtro por Trator**: dropdown que lista os chassis (filtra conforme o cliente selecionado)
- **Busca livre**: continua funcionando junto com os filtros
- Layout: 3 colunas no header (busca + cliente + trator)

### Emails - Corpo e Anexos (v1)
- API buscava `source` (corpo raw) e `bodyStructure` (anexos) de cada email
- Extraía corpo do email (text/plain ou fallback HTML stripped, max 500 chars)
- Extraía lista de anexos com nome, tipo e tamanho
- Na timeline do modal, "EMAIL ENVIADO" como botão clicável expandindo detalhes

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `app/page.tsx` | Tema escuro, fontes maiores, filtros cliente/trator, exibição de corpo e anexos do email na timeline |
| `app/api/emails/route.ts` | Busca source e bodyStructure, extrai corpo e anexos dos emails |
| `app/globals.css` | Tema escuro forçado, scrollbar dark, select dark |

---

## 3. Refatoração: Emails Automáticos, Aba de Emails no Modal

### Problemas identificados
- A busca de emails era lenta porque baixava o `source` (corpo raw) de cada um dos 5000+ emails
- O botão "VERIFICAR EMAILS" exigia ação manual do usuário
- O modal só mostrava um email por revisão (na timeline), não todos os emails do chassis

### Mudanças realizadas

#### API (`app/api/emails/route.ts`)
- **Removido fetch de `source`** — era o gargalo de performance. Agora busca apenas `envelope` + `bodyStructure`
- Campo `body` removido da interface `EmailRevisao`
- Extração de anexos simplificada com walk recursivo no `bodyStructure`

#### Dashboard (`app/page.tsx`)
- **Botão "VERIFICAR EMAILS" removido** — emails carregam automaticamente via `useEffect` ao abrir a página
- **Status no header** — mostra "Carregando emails..." (animado) e depois "X emails encontrados"
- **Modal com 2 abas**:
  - **TIMELINE** — linha do tempo das revisões com indicador "EMAIL ENVIADO" / "SEM EMAIL" (simplificado, sem expansão)
  - **EMAILS (N)** — lista **todos** os emails do chassis, ordenados por data (mais recente primeiro). Cada email é expansível mostrando:
    - Assunto completo
    - Data de envio formatada (pt-BR)
    - Horas da revisão
    - Lista de anexos em grid (2 colunas) com ícone (PDF/IMG/ARQ), nome e tamanho
- Fix: cast `Object.entries(grupos) as [string, Trator[]][]` para resolver erro de tipo `unknown`
- Fix: `REVISOES_LISTA` tipado como `string[]` para resolver `rev` implicitly `any`

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `app/api/emails/route.ts` | Removido fetch de source, só envelope+bodyStructure, removido campo body |
| `app/page.tsx` | Removido botão, auto-load emails, modal com abas timeline/emails, todos emails do chassis listados |
| `app/lib/types.ts` | `REVISOES_LISTA` tipado explicitamente como `string[]` |

---

## 4. Download de Anexos e Template de Envio com Assinatura

### Contexto

Os anexos dos emails listados na aba EMAILS do modal eram apenas informativos (nome, tipo, tamanho). O usuário precisava conseguir **abrir/baixar os anexos** diretamente. Além disso, o template de envio de emails precisava seguir o padrão real usado pela empresa, com assinatura contendo logos.

### Download de Anexos via IMAP

#### Nova rota: `/api/emails/attachment` (`app/api/emails/attachment/route.ts`)

- Recebe parâmetros via query string: `uid`, `part`, `filename`, `type`
- Conecta via IMAP ao Gmail
- Usa `client.download(uid, part, { uid: true })` para baixar o conteúdo binário do anexo específico
- Retorna o arquivo com headers corretos (`Content-Type`, `Content-Disposition: inline`)
- PDFs abrem direto no navegador, outros tipos fazem download

#### Mudanças na API de listagem (`app/api/emails/route.ts`)

- Adicionado `uid: true` nas opções do `fetch` para capturar o UID de cada mensagem
- `EmailRevisao` agora inclui campo `uid: number`
- `EmailAttachment` agora inclui campo `part: string` (identificador MIME do anexo no bodyStructure)
- A função `extractAttachmentsFromStructure` agora captura `part.part` de cada nó

#### Mudanças no Dashboard (`app/page.tsx`)

- Interfaces atualizadas com `uid` e `part`
- Cada anexo na aba EMAILS agora é um **link clicável** (`<a>`) que abre em nova aba
- URL do link: `/api/emails/attachment?uid=X&part=Y&filename=Z&type=T`
- Visual: hover com fundo violeta + label "ABRIR" à direita

### Template de Envio Atualizado

#### Formato do assunto

```
CHEQUE DE REVISÃO - [HORAS] HORAS - [MODELO] [4 ÚLTIMOS DÍGITOS CHASSI]
```

#### Formato do corpo (HTML)

```
Boa tarde, segue em anexo o cheque de revisão de [HORAS] Horas do Trator [MODELO].

CHASSI: [Nº CHASSI COMPLETO]
CLIENTE: [NOME CLIENTE]


Qualquer dúvida estou à disposição.

[NOME DO REMETENTE]
   Pós vendas

[imagem1.JPG - Logo Nova Tratores / Revenda]
[imagem2.jpg - Logo Mahindra]
```

#### Imagens de assinatura

- `imagem1.JPG` — Logo da revenda Nova Tratores (Piraju/SP, tel. (14) 3351-6049)
- `imagem2.jpg` — Logo da Mahindra
- As imagens são lidas do disco (`readFileSync`) e embutidas no HTML como base64 (`data:image/jpeg;base64,...`)
- Exibidas com `max-width: 300px`, uma abaixo da outra

#### API de envio (`app/api/route.ts`)

- Agora recebe campos adicionais via FormData: `horas`, `modelo`, `cliente`, `nome`
- Validação: `file`, `chassis`, `horas` e `modelo` são obrigatórios
- Email enviado em **HTML** (antes era `text` plain)
- Sanitização de todos os campos contra XSS
- `chassisFinal` calculado automaticamente (últimos 4 caracteres do chassis)

#### Formulário de envio no modal (`app/page.tsx`)

- Novo seletor de **revisão** (dropdown com todas as revisões: 50h até 3000h)
- Novo campo **"Seu nome"** (input text para assinatura)
- Validações: revisão obrigatória, nome obrigatório, arquivo obrigatório
- Os campos `modelo`, `chassis` e `cliente` são enviados automaticamente a partir do trator selecionado
- Layout: linha com [Revisão] [Nome] [Arquivo] [Botão ENVIAR]

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `app/api/emails/route.ts` | Adicionado uid no fetch, uid em EmailRevisao, part em EmailAttachment |
| `app/api/emails/attachment/route.ts` | **Novo** — endpoint para download de anexos via IMAP |
| `app/api/route.ts` | Template HTML com assinatura, imagens inline base64, novos campos (horas, modelo, cliente, nome) |
| `app/page.tsx` | Anexos clicáveis, seletor de revisão, campo nome, interfaces atualizadas |
| `imagem1.JPG` | Logo Nova Tratores (assinatura do email) |
| `imagem2.jpg` | Logo Mahindra (assinatura do email) |

---

## Arquivos do Projeto

| Arquivo | Descrição |
|---------|-----------|
| `app/page.tsx` | Dashboard principal (client component) |
| `app/layout.tsx` | Layout root com Geist fonts |
| `app/globals.css` | CSS global com tema escuro |
| `app/api/emails/route.ts` | GET: busca emails via IMAP Gmail |
| `app/api/emails/attachment/route.ts` | GET: download de anexo específico via IMAP |
| `app/api/route.ts` | POST: envia email via Nodemailer (Gmail SMTP) com template e assinatura |
| `app/lib/types.ts` | Interface `Trator`, `REVISOES_LISTA` |
| `app/lib/supabase.ts` | Cliente Supabase (browser) |
| `app/lib/utils.ts` | `calcularPrevisao()` para estimar revisões |
| `imagem1.JPG` | Logo Nova Tratores (assinatura do email) |
| `imagem2.jpg` | Logo Mahindra (assinatura do email) |

## 5. Filtro por Texto, Remoção Filtro Trator, Aba Enviar no Modal

### Contexto

O filtro de cliente era um dropdown (select), o que dificultava encontrar clientes com muitos registros. Além disso, o filtro por trator era pouco utilizado. O formulário de envio de email ficava no footer do modal, sem preview do template e sem gerenciamento de destinatários.

### Mudanças realizadas

#### Filtro de Cliente: Dropdown → Input de Texto

- O `<select>` de clientes foi substituído por um `<input type="text">` com placeholder "Filtrar por cliente..."
- A filtragem agora é por **substring case-insensitive** (`includes` ao invés de igualdade exata)
- Permite encontrar clientes rapidamente digitando parte do nome
- Grid de filtros mudou de 3 colunas para 2 colunas (busca + cliente)

#### Filtro por Trator: Removido

- O dropdown "Todos os Tratores" foi completamente removido
- Estado `filtroTrator` removido
- `useMemo` de `chassisList` removido
- `useMemo` de `clientes` removido (não era mais necessário para popular dropdown)

#### Nova Aba "ENVIAR" no Modal

O formulário de envio de email saiu do footer e virou a **3ª aba** do modal (TIMELINE | EMAILS | ENVIAR).

**Coluna esquerda — Preview do template em tempo real:**
- Mostra o assunto completo: `CHEQUE DE REVISÃO - [HORAS] HORAS - [MODELO] [CHASSI_FINAL]`
- Mostra o corpo do email com todos os campos preenchidos dinamicamente
- Atualiza conforme o usuário seleciona revisão e preenche o nome
- Indica as imagens de assinatura (imagem1.JPG, imagem2.jpg)

**Coluna direita — Destinatários + Formulário:**

*Destinatários (persistidos no localStorage):*
- Interface `Destinatario` com `nome` e `email`
- Armazenados na chave `controle-revisao-destinatarios` do `localStorage`
- Funções `loadDestinatarios()` e `saveDestinatarios()` para persistência
- Checkboxes para selecionar quais destinatários receberão o email
- Campos inline (nome + email + botão "+") para adicionar novos
- Botão "X" em cada destinatário para remover
- Validação: pelo menos um destinatário deve ser selecionado

*Dados do envio:*
- Seletor de revisão (dropdown 50h a 3000h)
- Campo "Seu Nome" (para assinatura do email)
- Input de arquivo para anexar o cheque de revisão
- Botão "ENVIAR EMAIL" full-width

#### API de Envio (`app/api/route.ts`)

- Novo campo `destinatarios` recebido via FormData (JSON string com array de emails)
- Parse com `JSON.parse` e fallback para `['fabrica@exemplo.com']` se vazio
- `resend.emails.send()` agora usa o array de destinatários dinâmico no campo `to`

### Novos estados no componente

| Estado | Tipo | Uso |
|--------|------|-----|
| `destinatarios` | `Destinatario[]` | Lista de destinatários salvos |
| `destinatariosSelecionados` | `Set<string>` | Emails marcados para envio |
| `novoDestNome` | `string` | Input nome do novo destinatário |
| `novoDestEmail` | `string` | Input email do novo destinatário |

### Novas funções

| Função | Descrição |
|--------|-----------|
| `loadDestinatarios()` | Carrega destinatários do localStorage |
| `saveDestinatarios()` | Salva destinatários no localStorage |
| `adicionarDestinatario()` | Adiciona novo destinatário e persiste |
| `removerDestinatario()` | Remove destinatário por email e persiste |
| `toggleDestinatario()` | Marca/desmarca destinatário para envio |

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `app/page.tsx` | Filtro cliente texto, removido filtro trator, aba ENVIAR com preview + destinatários + formulário |
| `app/api/route.ts` | Campo `destinatarios` no FormData, envio para múltiplos destinatários |

---

## 6. Migração de Resend para Nodemailer (Gmail SMTP)

### Problema

Os emails enviados pelo sistema **não estavam chegando** aos destinatários. A causa era o uso do remetente `onboarding@resend.dev` (endereço de teste do Resend), que **só consegue enviar emails para o email cadastrado na conta Resend**. Emails para qualquer outro destinatário eram silenciosamente descartados.

Além disso, o fallback de destinatários era `fabrica@exemplo.com` (endereço fictício).

### Solução: Nodemailer + Gmail SMTP

Substituído o Resend pelo **Nodemailer** usando o Gmail SMTP com as mesmas credenciais já configuradas para o IMAP (`GMAIL_USER` e `GMAIL_APP_PASSWORD`).

| Antes (Resend) | Depois (Nodemailer) |
|-----------------|---------------------|
| `resend.emails.send()` | `transporter.sendMail()` |
| Remetente: `onboarding@resend.dev` | Remetente: `posvendas.novatratores@gmail.com` |
| Só envia para o email da conta Resend | Envia para qualquer email (até 500/dia) |
| Dependência: `resend` | Dependência: `nodemailer` + `@types/nodemailer` |
| Fallback: `fabrica@exemplo.com` | Sem fallback — retorna erro 400 se sem destinatários |

### Mudanças no código (`app/api/route.ts`)

- Import: `resend` → `nodemailer`
- Criado `transporter` com `nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })`
- `from`: agora usa `process.env.GMAIL_USER` (email real da empresa)
- `to`: `destinatarios.join(', ')` (Nodemailer aceita string separada por vírgula)
- Attachments: adaptados para formato Nodemailer (`contentType` ao invés de `content_type`, sem campo `cid` separado)
- Imagens de assinatura: continuam inline via CID (`cid: 'imagem1'`, `cid: 'imagem2'`)
- Erro: mensagem agora inclui `error.message` para facilitar debug
- Fallback fictício removido: retorna `{ error: 'Nenhum destinatário informado.' }` com status 400

### Dependências

```bash
npm uninstall resend
npm install nodemailer
npm install -D @types/nodemailer
```

### Vantagens

- **Gratuito** — até 500 emails/dia pelo Gmail
- **Sem verificação de domínio** necessária
- Email chega com o remetente real da empresa (`posvendas.novatratores@gmail.com`)
- Emails enviados ficam na pasta "Enviados" do Gmail
- Usa as mesmas credenciais já configuradas para o IMAP

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `app/api/route.ts` | Resend → Nodemailer, Gmail SMTP, remetente real, erro detalhado, removido fallback fictício |
| `package.json` | Removido `resend`, adicionado `nodemailer` e `@types/nodemailer` |

---

## 7. Fontes Maiores, Preview de PDF e Corpo dos Emails

### Contexto

As fontes nos cards estavam muito pequenas, dificultando a leitura (especialmente o número do motor). Os PDFs anexados nos emails só podiam ser baixados, sem opção de visualizar diretamente. E na aba Emails do modal, só aparecia o assunto — o corpo do email não era exibido.

### Mudanças realizadas

#### Fontes aumentadas nos cards

| Elemento | Antes | Depois |
|----------|-------|--------|
| Modelo | `text-xs` | `text-sm` |
| Chassis | `text-lg` | `text-xl` |
| Motor | `text-xs` | `text-base font-medium` |
| Entrega | `text-xs` | `text-base` |
| Badge status | `text-xs` | `text-sm` |
| Emails count | `text-xs` | `text-sm` |
| Próxima/Última | `text-sm font-medium` | `text-base font-semibold` |
| Labels | `text-xs` | `text-sm` |

#### Fontes aumentadas no modal (aba Timeline - Informações)

| Elemento | Antes | Depois |
|----------|-------|--------|
| Label (Motor, Vendedor, etc.) | `text-[10px]` | `text-xs` |
| Valor | `text-sm` | `text-base font-medium` |

#### Preview de PDF inline

- Clicar em anexo PDF agora abre um **modal de visualização** com `<iframe>` em vez de baixar
- O modal ocupa 90% da tela (90vh) com z-index 60 (acima do modal principal)
- Header com botão "Baixar" (caso queira salvar) e "X" para fechar
- Clicando fora do modal fecha o preview
- Anexos não-PDF continuam abrindo em nova aba normalmente
- Botão mostra label "visualizar" nos anexos PDF
- Novo estado: `pdfPreviewUrl: string | null`

#### Corpo dos emails

**API (`app/api/emails/route.ts`):**
- Campo `body: string` adicionado à interface `EmailRevisao`
- Nova função `findTextPart()` que percorre o `bodyStructure` procurando `text/plain` (preferência) ou `text/html`
- Após o fetch inicial (que identifica emails pelo assunto), segunda passada baixa o corpo de cada email via `client.download(uid, partNumber)`
- Corpo limitado a 2000 caracteres para evitar respostas muito grandes
- Erros ao baixar corpo são tratados silenciosamente (body fica como string vazia)

**Dashboard (`app/page.tsx`):**
- Interface `EmailRevisao` atualizada com campo `body: string`
- Na aba Emails, ao expandir um email, o corpo completo é exibido em área estilizada (`<pre>` com `whitespace-pre-wrap`)
- Visual: fundo `zinc-950/50`, borda `zinc-800/30`, texto `zinc-400`, fonte `text-sm`

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `app/page.tsx` | Fontes maiores, preview PDF com iframe, corpo do email na aba Emails, tipos explícitos nos callbacks |
| `app/api/emails/route.ts` | Campo body, findTextPart(), download do corpo de cada email (max 2000 chars) |

---

## Como usar

1. Rodar o servidor: `npm run dev`
2. Acessar o dashboard
3. Os emails carregam automaticamente (pode levar 1-2 minutos com 5000+ emails)
4. Usar busca livre ou filtro por cliente (digitando o nome)
5. Clicar num card para abrir o modal
6. Aba "TIMELINE" mostra revisões, aba "EMAILS" mostra todos os emails com anexos
7. Aba "ENVIAR" para enviar cheque de revisão — cadastrar destinatários, selecionar revisão, anexar arquivo e enviar

## Possíveis melhorias futuras

- Barra de progresso durante o carregamento dos emails
- Cache dos resultados (localStorage ou banco)
- Busca incremental (só emails novos)
- Exportar relatório de revisões pendentes sem email
