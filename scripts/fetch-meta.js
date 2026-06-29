// scripts/fetch-meta.js
// Busca dados da Meta Ads API e salva em public/data.json
// Roda via GitHub Actions — sem dependências externas (usa fetch nativo do Node 20)

const fs   = require('fs');
const path = require('path');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const TOKEN    = process.env.META_TOKEN;
const ACCOUNTS = (process.env.META_ACCOUNTS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => s.startsWith('act_') ? s : 'act_' + s);
const META_VER = 'v21.0';

if (!TOKEN)    { console.error('❌  META_TOKEN não configurado'); process.exit(1); }
if (!ACCOUNTS.length) { console.error('❌  META_ACCOUNTS não configurado'); process.exit(1); }

function getDateRange() {
  if (process.env.META_FROM && process.env.META_TO) {
    return { from: process.env.META_FROM, to: process.env.META_TO };
  }
  const days  = parseInt(process.env.META_DAYS || '30');
  const today = new Date();
  const from  = new Date(today.getTime() - days * 86400000);
  return {
    from: from.toISOString().slice(0, 10),
    to:   today.toISOString().slice(0, 10),
  };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getAssoc(name) {
  if (!name) return null;
  const c = name.toUpperCase();
  if (c.includes('[APSE]')) return 'APSE';
  if (c.includes('[APSO]')) return 'APSO';
  if (c.includes('[APAC]')) return 'APAC';
  if (c.includes('[APO]'))  return 'APO';
  if (c.includes('[APL]'))  return 'APL';
  if (c.includes('[APV]'))  return 'APV';
  if (c.includes('[APS]'))  return 'APS';
  if (c.includes('[AP]'))   return 'AP';
  return null;
}

function normName(n) {
  if (!n) return '(sem nome)';
  const tags = [...(n.match(/\[([^\]]+)\]/g) || [])].map(t => t.slice(1, -1));
  const anTag = tags.find(t => /^An\s*\d+$/i.test(t.trim())) || '';
  const num   = anTag.match(/\d+/);
  const numStr = num ? 'An' + String(parseInt(num[0])).padStart(2, '0') : '';
  const skip  = /^an\s*\d+$|^estáticos$|^junho|^alterado$|^\d{4}$|^v[ií]d|^leads?$|^forms?$|^whats/i;
  const desc  = tags.find(t => !skip.test(t.trim())) || '';
  const alt   = tags.some(t => /alterado/i.test(t)) ? ' [Alt]' : '';
  return (numStr + (desc ? ' - ' + desc : '') + alt).trim() || n.slice(0, 50);
}

// ── META API ──────────────────────────────────────────────────────────────────
async function metaGet(apiPath, params = {}) {
  const url = new URL(`https://graph.facebook.com/${META_VER}/${apiPath}`);
  url.searchParams.set('access_token', TOKEN);
  Object.entries(params).forEach(([k, v]) =>
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v)
  );
  const res  = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}

async function fetchAllPages(apiPath, params) {
  const results = [];
  let   cursor  = null;

  while (true) {
    const p = { ...params, limit: 500 };
    if (cursor) p.after = cursor;

    const data = await metaGet(apiPath, p);
    results.push(...(data.data || []));

    cursor = data.paging?.cursors?.after;
    if (!cursor || !data.paging?.next) break;
  }

  return results;
}

// ── LEAD TYPES ────────────────────────────────────────────────────────────────
const LEAD_TYPES = new Set([
  'lead',
]);

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const { from, to } = getDateRange();
  console.log(`\n📅 Período: ${from} → ${to}`);
  console.log(`📦 Contas: ${ACCOUNTS.join(', ')}\n`);

  const ASSOCS = ['APS', 'AP', 'APO', 'APL', 'APSO', 'APSE', 'APV', 'APAC'];

  const thermo  = {};
  const display = {};
  const units   = {};
  ASSOCS.forEach(a => { thermo[a] = {}; display[a] = {}; units[a] = {}; });

  let totalRows = 0;

  for (const account of ACCOUNTS) {
    console.log(`🔍 Buscando ${account}...`);

    try {
      const rows = await fetchAllPages(`${account}/insights`, {
        fields:     'campaign_name,adset_name,ad_name,spend,impressions,clicks,actions',
        level:      'ad',
        time_range: JSON.stringify({ since: from, until: to }),
      });

      console.log(`   └─ ${rows.length} registros encontrados`);

      for (const row of rows) {
        const assoc = getAssoc(row.campaign_name);
        if (!assoc) continue;

        const spend  = parseFloat(row.spend || 0);
        const impr   = parseInt(row.impressions || 0);
        const clicks = parseInt(row.clicks || 0);
        const leads  = (row.actions || [])
          .filter(a => LEAD_TYPES.has(a.action_type))
          .reduce((s, a) => s + parseInt(a.value || 0), 0);

        if (spend <= 0) continue;

        const unit  = row.adset_name || '(geral)';
        const cname = normName(row.ad_name);
        const key   = unit + '|||' + cname;

        if (!thermo[assoc][key]) thermo[assoc][key] = { g: 0, l: 0, i: 0, c: 0 };
        thermo[assoc][key].g  = Math.round((thermo[assoc][key].g + spend) * 100) / 100;
        thermo[assoc][key].l += leads;
        thermo[assoc][key].i += impr;
        thermo[assoc][key].c += clicks;

        if (!display[assoc][cname]) display[assoc][cname] = { g: 0, l: 0, i: 0, c: 0 };
        display[assoc][cname].g  = Math.round((display[assoc][cname].g + spend) * 100) / 100;
        display[assoc][cname].l += leads;
        display[assoc][cname].i += impr;
        display[assoc][cname].c += clicks;

        if (!units[assoc][unit]) units[assoc][unit] = { g: 0, l: 0 };
        units[assoc][unit].g  = Math.round((units[assoc][unit].g + spend) * 100) / 100;
        units[assoc][unit].l += leads;

        totalRows++;
      }
    } catch (err) {
      console.error(`   ❌ Erro em ${account}: ${err.message}`);
    }
  }

  console.log(`\n✅ ${totalRows} registros processados\n`);
  console.log('📊 Resumo por associação:');
  for (const a of ASSOCS) {
    const entries = Object.values(thermo[a]);
    const gasto  = entries.reduce((s, v) => s + v.g, 0);
    const leads  = entries.reduce((s, v) => s + v.l, 0);
    const aprov  = entries.filter(v => v.l > 0).reduce((s, v) => s + v.g, 0);
    const pct    = gasto > 0 ? (aprov / gasto * 100).toFixed(1) : '0.0';
    console.log(`   ${a.padEnd(5)} R$${gasto.toFixed(2).padStart(10)} | ${String(leads).padStart(4)} leads | ${pct}% aproveitado`);
  }

  const output = {
    meta: {
      last_updated: new Date().toISOString(),
      date_from:    from,
      date_to:      to,
      accounts:     ACCOUNTS,
    },
    thermo,
    display,
    units,
  };

  const outputPath = path.join(__dirname, '..', 'public', 'data.json');
  fs.writeFileSync(outputPath, JSON.stringify(output));
  const kb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`\n💾 public/data.json salvo (${kb} KB)`);
}

main().catch(err => {
  console.error('\n❌ Falha no sync:', err.message);
  process.exit(1);
});
