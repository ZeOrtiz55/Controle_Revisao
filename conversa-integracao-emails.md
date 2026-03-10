# Integração Gmail IMAP - Controle de Revisão

## Contexto

O sistema de controle de revisão gerencia uma frota de tratores, rastreando revisões periódicas (50h, 300h, 600h... até 3000h). Os dados ficam no Supabase e o dashboard é feito em Next.js.

O objetivo era baixar ~5037 emails de uma conta Gmail para verificar quais revisões foram ou não notificadas por email.

---

## Decisão: IMAP vs Gmail API vs Resend

| Opção | Custo | Complexidade | Observação |
|-------|-------|-------------|------------|
| **Resend API** | Grátis | Baixa | Só lista emails enviados pelo Resend, não serve para emails já enviados pelo Gmail |
| **Gmail API** | Grátis | Alta | Precisa criar projeto no Google Cloud Console, configurar OAuth2 |
| **IMAP (escolhido)** | Grátis | Média | Simples, sem dependência de Google Cloud, usa senha de app |

**Escolha: IMAP** — gratuito, sem necessidade de Google Cloud Console, e resolve bem o caso de uso.

---

## Padrão dos Emails

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

---

## O que foi implementado

### 1. Credenciais no `.env.local`

```
GMAIL_USER=posvendas.novatratores@gmail.com
GMAIL_APP_PASSWORD=vuak yzex ycpm mydd
```

> `.env*` já está no `.gitignore`, então as credenciais não vão para o repositório.

### 2. Dependência instalada

```bash
npm install imapflow
```

### 3. API Route: `/api/emails` (`app/api/emails/route.ts`)

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
}
```

### 4. Integração no Dashboard (`app/page.tsx`)

#### Botão "VERIFICAR EMAILS"
- Adicionado no header ao lado da barra de busca
- Ao clicar, chama `GET /api/emails`
- Mostra contador de emails encontrados após carregar

#### Indicador nos cards dos tratores
- Após carregar emails, cada card mostra:
  - **"X encontrado(s)"** (roxo) — se há emails para aquele chassis
  - **"nenhum"** (laranja) — se não há emails

#### Indicador na timeline do modal
- Cada revisão na "Linha do Tempo de Manutenção" mostra:
  - **"EMAIL ENVIADO"** (roxo) — revisão confirmada por email
  - **"SEM EMAIL"** (laranja) — sem email correspondente

### Lógica de cruzamento

```ts
// Compara os últimos 4 caracteres do chassis com o final extraído do assunto
const emailsDoChassis = (chassis: string) => {
  return emails.filter(e => e.chassisFinal && chassis.endsWith(e.chassisFinal));
};

// Verifica se existe email para uma revisão específica
const revisaoConfirmadaPorEmail = (chassis: string, rev: string) => {
  const horasRev = rev.replace("h", "");
  return emailsDoChassis(chassis).some(e => e.horas === horasRev);
};
```

---

## Arquivos modificados/criados

| Arquivo | Ação |
|---------|------|
| `.env.local` | Adicionado `GMAIL_USER` e `GMAIL_APP_PASSWORD` |
| `app/api/emails/route.ts` | **Criado** — rota IMAP para buscar emails |
| `app/page.tsx` | **Modificado** — botão, estados e indicadores visuais |
| `package.json` | **Modificado** — adicionado `imapflow` |

---

## Como usar

1. Rodar o servidor: `npm run dev`
2. Acessar o dashboard
3. Clicar em **VERIFICAR EMAILS**
4. Aguardar o carregamento (pode levar 1-2 minutos com 5000+ emails)
5. Os cards e modais serão atualizados com os indicadores de email

---

## Configuração da Senha de App do Gmail

1. Acessar **myaccount.google.com**
2. **Segurança** → ativar **Verificação em duas etapas**
3. Buscar **Senhas de app** → criar uma para "E-mail"
4. Copiar a senha gerada (formato: `abcd efgh ijkl mnop`)
5. Colocar no `.env.local` como `GMAIL_APP_PASSWORD`

---

## Possíveis melhorias futuras

- Barra de progresso durante o carregamento dos emails
- Cache dos resultados (localStorage ou banco)
- Busca incremental (só emails novos)
- Exportar relatório de revisões pendentes sem email
