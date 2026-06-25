# RT Meta ADS · Live Dashboard

Dashboard de performance Meta Ads com atualização automática diária via GitHub Actions.  
**Zero custo** — GitHub Actions gratuito + Netlify hospeda apenas HTML/JSON estático.

---

## Como funciona

```
GitHub Actions (todo dia 06h BRT)
  → chama Meta Ads API
  → salva dados em public/data.json
  → commit automático no repositório
        ↓
    Netlify detecta o commit
  → publica automaticamente
        ↓
    Dashboard carrega data.json
  → renderiza tudo no browser
```

---

## Setup (10 minutos)

### 1. Crie um repositório no GitHub

Suba estes arquivos mantendo a estrutura:
```
.github/
  workflows/
    sync-meta.yml
scripts/
  fetch-meta.js
public/
  index.html
  data.json
```

### 2. Configure os Secrets no GitHub

No repositório → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Valor |
|--------|-------|
| `META_TOKEN` | Seu System User Token do Business Manager |
| `META_ACCOUNTS` | IDs das contas separados por vírgula: `act_123,act_456` |

### 3. Conecte ao Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. Selecione o repositório GitHub
3. Configure:
   - **Branch**: `main`
   - **Publish directory**: `public`
   - **Build command**: *(deixe vazio)*
4. Deploy!

### 4. Rode o primeiro sync manualmente

No GitHub: **Actions → 🔄 Sync Meta Ads → Run workflow → Run workflow**

Aguarde ~1 minuto, acesse seu site Netlify — os dados já estarão lá.

---

## Configurações

### Mudar o período dos dados

Por padrão, o Action busca os **últimos 30 dias**.

Para mudar permanentemente, edite `.github/workflows/sync-meta.yml`:
```yaml
META_DAYS: '60'  # mude aqui
```

Para um período específico via dispatch manual:
- **Actions → Run workflow**
- Preencha `date_from` (ex: `2026-06-01`) e `date_to` (ex: `2026-06-30`)

### Adicionar mais contas

No GitHub Secret `META_ACCOUNTS`, adicione separado por vírgula:
```
act_1234567890,act_0987654321,act_1122334455
```

### Alterar horário do sync

No arquivo `.github/workflows/sync-meta.yml`, linha do `cron`:
```yaml
- cron: '0 9 * * *'  # 09:00 UTC = 06:00 BRT
```
Use [crontab.guru](https://crontab.guru) para gerar outros horários.

---

## Estrutura de dados

O `public/data.json` contém:

```json
{
  "meta": {
    "last_updated": "2026-06-25T09:00:00Z",
    "date_from": "2026-05-26",
    "date_to": "2026-06-25",
    "accounts": ["act_xxx"]
  },
  "thermo": {
    "APS": { "Conjunto A|||An01 - Estáticos": { "g": 1234, "l": 45, "i": 50000, "c": 250 } }
  },
  "display": {
    "APS": { "An01 - Estáticos": { "g": 5000, "l": 120, "i": 200000, "c": 1000 } }
  },
  "units": {
    "APS": { "Embu Das Artes": { "g": 2000, "l": 50 } }
  }
}
```

**`thermo`**: uma entrada por instância `(conjunto × criativo)` — usado para calcular o termômetro corretamente  
**`display`**: agrupado por nome de criativo — usado na tabela de análise  
**`units`**: agrupado por conjunto de anúncio — usado na tabela de metas e unidades

---

## Metas e CPL Vendido

Os campos editáveis (Meta de Leads, CPL Vendido) ficam salvos no `localStorage` do navegador de cada usuário. Não são sobrescritos pelo sync.
