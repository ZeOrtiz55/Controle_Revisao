# Atualização - Tema Escuro, Filtros e Detalhes de Email

## Resumo das Mudanças

### 1. Tema Escuro
- Fundo `gray-950` em toda a aplicação
- Cards em `gray-900`, bordas em `gray-800`
- Scrollbar estilizada para tema escuro
- CSS forçando cores escuras (removido `prefers-color-scheme`)
- Select dropdown com fundo escuro

### 2. Fontes Maiores
- Titulo: `text-5xl` (era `text-4xl`)
- Chassis nos cards: `text-3xl` (era `text-2xl`)
- Labels: `text-sm`/`text-base` (eram `text-[9px]`/`text-[10px]`)
- Textos gerais: `text-base`/`text-lg` (eram `text-xs`/`text-sm`)

### 3. Filtros Adicionados
- **Filtro por Cliente**: dropdown que lista todos os clientes
- **Filtro por Trator**: dropdown que lista os chassis (filtra conforme o cliente selecionado)
- **Busca livre**: continua funcionando junto com os filtros
- Layout: 3 colunas no header (busca + cliente + trator)

### 4. Emails - Corpo e Anexos
- **API modificada** (`app/api/emails/route.ts`):
  - Agora busca `source` (corpo raw) e `bodyStructure` (anexos) de cada email
  - Extrai corpo do email (text/plain ou fallback HTML stripped, max 500 chars)
  - Extrai lista de anexos com nome, tipo e tamanho
  - Função `extractAttachmentsFromStructure` para navegar na estrutura MIME
- **Frontend** (`app/page.tsx`):
  - Na timeline do modal, cada revisão mostra "EMAIL ENVIADO" como botão clicável
  - Ao clicar, expande mostrando:
    - Assunto do email
    - Data de envio formatada (pt-BR)
    - Corpo do email (scroll se muito longo)
    - Lista de anexos com ícone (PDF/IMG/ARQ), nome e tamanho
  - "SEM EMAIL" para revisões sem email correspondente
  - Estado `emailExpandido` controla qual revisão está expandida

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `app/page.tsx` | Tema escuro, fontes maiores, filtros cliente/trator, exibição de corpo e anexos do email na timeline |
| `app/api/emails/route.ts` | Busca source e bodyStructure, extrai corpo e anexos dos emails |
| `app/globals.css` | Tema escuro forçado, scrollbar dark, select dark |
