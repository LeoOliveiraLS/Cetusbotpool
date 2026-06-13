// Cetus CLMM - Monitor Contínuo DEEP/SUI
// node cetus-monitor.js

const RPC_URL      = "https://fullnode.mainnet.sui.io";
const CETUS_API    = "https://api-sui.cetus.zone";

// ─── CONFIGURE AQUI ──────────────────────────────────────────────────────────
const POSITION_ID      = "0x11301ccb6956334e1060d03edabd20936bb532151a29a2778291078d6c8cbd5c";
const POSITION_CREATED = 1781355956560; // timestamp de criação em ms
const INTERVAL_MS      = 40_000;
const TG_TOKEN         = "8768478427:AAEyBm8woaPapJOvRvRmdSroK0i-GGAUClo";
const TG_CHAT_ID       = "776460062";
// ─────────────────────────────────────────────────────────────────────────────

const R  = "\x1b[0m", G = "\x1b[32m", RE = "\x1b[31m";
const C  = "\x1b[36m", Y = "\x1b[33m", B  = "\x1b[1m";
const DM = "\x1b[2m",  MA = "\x1b[35m";

const now  = () => new Date().toLocaleTimeString("pt-BR");
const err  = (m) => console.log(`${RE}[${now()}] ✗ ${m}${R}`);
const info = (m) => console.log(`${C}[${now()}] → ${m}${R}`);
const row  = (k, v) => console.log(`   ${Y}${k.padEnd(26)}${R} ${v}`);
const sep  = (t) => console.log(`\n${B}── ${t} ${"─".repeat(Math.max(0, 44 - t.length))}${R}`);

function lifeTime() {
  const ms      = Date.now() - POSITION_CREATED;
  const days    = Math.floor(ms / 86_400_000);
  const hours   = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "HTML" }),
    });
    info("Notificação enviada ao Telegram ✓");
  } catch (e) {
    err("Falha ao enviar Telegram: " + e.message);
  }
}

function notifyOutOfRange(currentPrice, priceLower, priceUpper, pct, y) {
  const side = pct < 0 ? "abaixo do mínimo 📉" : "acima do máximo 📈";

  let yieldLines = "";
  if (y) {
    const feeAUSD   = Number(y.FeeA?.uUnClaimedFor24HUSD ?? 0);
    const feeBUSD   = Number(y.FeeB?.uUnClaimedFor24HUSD ?? 0);
    const miningUSD = (y.Mining ?? []).reduce((s, m) => s + Number(m.uUnClaimedFor24HUSD ?? 0), 0);
    const totalUSD  = feeAUSD + feeBUSD + miningUSD;
    const activeMin = (y.Mining ?? []).filter(m => Number(m.unClaimedFor24HAmount) > 0);

    let miningLines = "";
    activeMin.forEach(m => {
      miningLines += `  • ${coinName(m.CoinType)}: ${m.unClaimedFor24HAmount} ($${fmtUSD(Number(m.uUnClaimedFor24HUSD))})\n`;
    });

    yieldLines =
      `\n💰 <b>Claimable Yield ao sair</b>\n` +
      `  • ${coinName(y.FeeA.CoinType)}: ${y.FeeA.unClaimedFor24HAmount} ($${fmtUSD(feeAUSD)})\n` +
      `  • ${coinName(y.FeeB.CoinType)}: ${y.FeeB.unClaimedFor24HAmount} ($${fmtUSD(feeBUSD)})\n` +
      (miningLines ? miningLines : "") +
      `  <b>Total: $${fmtUSD(totalUSD)}</b>\n`;
  }

  sendTelegram(
    `⚠️ <b>DEEP/SUI saiu do range!</b>\n\n` +
    `💰 Preço atual: <code>${currentPrice.toFixed(6)}</code> SUI/DEEP\n` +
    `📊 Range: <code>${priceLower.toFixed(6)}</code> → <code>${priceUpper.toFixed(6)}</code>\n` +
    `📍 Posição: ${side}\n` +
    `🕐 Tempo de vida: ${lifeTime()}\n` +
    yieldLines +
    `\n⏰ ${new Date().toLocaleString("pt-BR")}`
  );
  try {
    const { execSync } = require("child_process");
    execSync(
      `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; ` +
      `[System.Windows.Forms.MessageBox]::Show('DEEP/SUI saiu do range!\\nPreco: ${currentPrice.toFixed(6)}', 'Cetus Monitor', 'OK', 'Warning')"`,
      { stdio: "ignore", timeout: 10000 }
    );
  } catch (_) { process.stdout.write("\x07"); }
}

function notifyBackInRange(currentPrice, priceLower, priceUpper) {
  sendTelegram(
    `✅ <b>DEEP/SUI voltou ao range!</b>\n\n` +
    `💰 Preço atual: <code>${currentPrice.toFixed(6)}</code> SUI/DEEP\n` +
    `📊 Range: <code>${priceLower.toFixed(6)}</code> → <code>${priceUpper.toFixed(6)}</code>\n\n` +
    `⏰ ${new Date().toLocaleString("pt-BR")}`
  );
}

function renderRangeBar(currentPrice, priceLower, priceUpper) {
  const BAR_WIDTH = 48;
  const pct       = (currentPrice - priceLower) / (priceUpper - priceLower);
  const inRange   = pct >= 0 && pct <= 1;
  const clamped   = Math.max(0, Math.min(1, pct));
  const cursorPos = Math.round(clamped * (BAR_WIDTH - 1));

  let bar = "";
  for (let i = 0; i < BAR_WIDTH; i++) {
    if (i === cursorPos) {
      const danger = pct < 0.08 || pct > 0.92;
      const warn   = pct < 0.15 || pct > 0.85;
      const color  = !inRange ? RE : danger ? RE : warn ? Y : G;
      bar += `${color}${B}▼${R}`;
    } else {
      bar += inRange ? `${DM}${G}─${R}` : `${RE}─${R}`;
    }
  }

  const pctStr    = inRange ? `${(pct * 100).toFixed(1)}% do range`
                            : pct < 0 ? `${RE}ABAIXO do range${R}` : `${RE}ACIMA do range${R}`;
  const minLabel  = priceLower.toFixed(5);
  const maxLabel  = priceUpper.toFixed(5);
  const midSpaces = BAR_WIDTH - minLabel.length - maxLabel.length + 2;

  console.log(`   ${DM}${G}[${R}${bar}${DM}${G}]${R}  ${pctStr}`);
  console.log(`   ${DM}${minLabel}${" ".repeat(Math.max(1, midSpaces))}${maxLabel}${R}`);

  if (inRange) {
    const distMin = ((currentPrice - priceLower) / priceLower * 100).toFixed(1);
    const distMax = ((priceUpper - currentPrice) / priceUpper * 100).toFixed(1);
    const cMin    = Number(distMin) < 5 ? RE : Number(distMin) < 15 ? Y : G;
    const cMax    = Number(distMax) < 5 ? RE : Number(distMax) < 15 ? Y : G;
    console.log(`   ${DM}dist. min:${R} ${cMin}${distMin}%${R}   ${DM}dist. max:${R} ${cMax}${distMax}%${R}`);
  }

  return pct;
}

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const d = await res.json();
  if (d.error) throw new Error(d.error.message ?? JSON.stringify(d.error));
  return d.result;
}

async function fetchYield() {
  const res = await fetch(
    `${CETUS_API}/v3/sui/clmm/position/daily_earning?position_id=${POSITION_ID}`
  );
  if (!res.ok) throw new Error("HTTP " + res.status);
  const d = await res.json();
  if (d.code !== 0) throw new Error(d.msg);
  return d.data;
}

function toSignedI32(val) {
  const n = Number(val);
  return n > 2_147_483_647 ? n - 4_294_967_296 : n;
}

function sqrtPriceToPrice(raw) {
  const s = Number(BigInt(raw)) / 2 ** 64;
  return s * s;
}

function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

function fmtAmount(raw, decimals) {
  if (raw === undefined || raw === null) return "—";
  const v = typeof raw === "object" ? (raw?.fields?.value ?? raw?.value ?? "0") : raw;
  return (Number(v) / 10 ** decimals).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function fmtUSD(val) {
  return Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function coinName(coinType) {
  return coinType.split("::").pop() ?? coinType;
}

async function fetchAll() {
  const posRes = await rpc("sui_getObject", [POSITION_ID, { showType: true, showContent: true }]);
  if (!posRes?.data?.content?.fields)
    throw new Error("Position não encontrada — verifique o POSITION_ID");

  const pf        = posRes.data.content.fields;
  const tickLower = toSignedI32(pf.tick_lower_index?.fields?.bits ?? pf.tick_lower_index);
  const tickUpper = toSignedI32(pf.tick_upper_index?.fields?.bits ?? pf.tick_upper_index);
  const liquidity = pf.liquidity ?? "0";

  const poolRes = await rpc("sui_getObject", [pf.pool, { showType: true, showContent: true }]);
  if (!poolRes?.data?.content?.fields) throw new Error("Pool não encontrado");

  const pool         = poolRes.data.content.fields;
  const currentTick  = toSignedI32(pool.current_tick_index?.fields?.bits ?? pool.current_tick_index);
  const currentPrice = sqrtPriceToPrice(pool.current_sqrt_price);
  const feeRate      = Number(pool.fee_rate) / 1_000_000;
  const priceLower   = tickToPrice(tickLower);
  const priceUpper   = tickToPrice(tickUpper);
  const inRange      = currentTick >= tickLower && currentTick <= tickUpper;

  // Yield da API Cetus
  let yieldData = null;
  try { yieldData = await fetchYield(); } catch (_) {}

  return {
    poolId: pf.pool,
    position: { tickLower, tickUpper, liquidity },
    pool: { currentTick, currentPrice, feeRate, coinA: pool.coin_a, coinB: pool.coin_b, isPause: pool.is_pause },
    derived: { inRange, priceLower, priceUpper },
    yield: yieldData,
  };
}

function displayYield(y) {
  if (!y) { console.log(`   ${DM}Dados indisponíveis${R}`); return; }

  // Fees
  const feeAUSD  = Number(y.FeeA?.uUnClaimedFor24HUSD ?? 0);
  const feeBUSD  = Number(y.FeeB?.uUnClaimedFor24HUSD ?? 0);
  const totalFee = feeAUSD + feeBUSD;

  console.log(`\n   ${B}Fees claimáveis${R}`);
  row(`  ${coinName(y.FeeA.CoinType)}`,
      `${y.FeeA.unClaimedFor24HAmount}  ${DM}($${fmtUSD(feeAUSD)})${R}`);
  row(`  ${coinName(y.FeeB.CoinType)}`,
      `${y.FeeB.unClaimedFor24HAmount}  ${DM}($${fmtUSD(feeBUSD)})${R}`);
  row("  Total fees USD",  `${G}$${fmtUSD(totalFee)}${R}`);

  // Mining rewards
  const active = (y.Mining ?? []).filter(m => Number(m.unClaimedFor24HAmount) > 0);
  if (active.length > 0) {
    console.log(`\n   ${B}Mining rewards claimáveis${R}`);
    let totalMining = 0;
    active.forEach(m => {
      const usd = Number(m.uUnClaimedFor24HUSD ?? 0);
      totalMining += usd;
      row(`  ${coinName(m.CoinType)}`,
          `${m.unClaimedFor24HAmount}  ${DM}($${fmtUSD(usd)})${R}`);
    });
    row("  Total mining USD", `${MA}$${fmtUSD(totalMining)}${R}`);
    row("  TOTAL CLAIMÁVEL",  `${G}${B}$${fmtUSD(totalFee + totalMining)}${R}`);
  } else {
    row("  TOTAL CLAIMÁVEL", `${G}${B}$${fmtUSD(totalFee)}${R}`);
  }
}

function display(data, iteration) {
  const { position, pool, derived } = data;
  const ts = new Date().toLocaleString("pt-BR");

  console.clear();
  console.log(`${B}╔══════════════════════════════════════════════════╗${R}`);
  console.log(`${B}║   Cetus CLMM Monitor  ·  DEEP/SUI  ·  0.25%     ║${R}`);
  console.log(`${B}╚══════════════════════════════════════════════════╝${R}`);
  console.log(`${DM}   #${iteration}  ·  ${ts}  ·  próxima em ${INTERVAL_MS / 1000}s${R}\n`);

  console.log(`   Status         ${derived.inRange ? G+B+"IN RANGE ✓"+R : RE+B+"⚠️  OUT OF RANGE ✗"+R}`);
  console.log(`   Pool Paused    ${pool.isPause ? RE+"SIM"+R : G+"NÃO"+R}`);
  console.log(`   Tempo de vida  ${C}${B}${lifeTime()}${R}`);

  sep("Posição no Range");
  const pct = renderRangeBar(pool.currentPrice, derived.priceLower, derived.priceUpper);

  sep("Preço");
  row("Preço Atual",  `${pool.currentPrice.toFixed(6)} SUI/DEEP`);
  row("Tick Atual",   `${pool.currentTick}`);
  row("Min Price",    `${derived.priceLower.toFixed(6)} SUI/DEEP`);
  row("Max Price",    `${derived.priceUpper.toFixed(6)} SUI/DEEP`);

  sep("Claimable Yield");
  displayYield(data.yield);

  sep("Liquidez");
  row("Liquidity",    position.liquidity.toString());
  row("Fee Rate",     `${(pool.feeRate * 100).toFixed(2)}%`);

  sep("Balances do Pool");
  row("Coin A (DEEP)", fmtAmount(pool.coinA, 6) + " DEEP");
  row("Coin B (SUI)",  fmtAmount(pool.coinB, 9) + " SUI");

  console.log(`\n${DM}   Position: ${POSITION_ID}${R}`);
  console.log(`${DM}   Pool:     ${data.poolId}${R}`);
  console.log(`\n${DM}   Ctrl+C para parar${R}\n`);

  return pct;
}

async function main() {
  await sendTelegram(
    `🟢 <b>Cetus Monitor iniciado!</b>\n\n` +
    `📍 Monitorando posição DEEP/SUI\n` +
    `⏱ Intervalo: ${INTERVAL_MS / 1000}s\n` +
    `🕐 Posição aberta há: <b>${lifeTime()}</b>\n` +
    `⏰ ${new Date().toLocaleString("pt-BR")}`
  );

  // Dispara yield imediatamente na inicialização
  try {
    const y         = await fetchYield();
    const feeAUSD   = Number(y.FeeA?.uUnClaimedFor24HUSD ?? 0);
    const feeBUSD   = Number(y.FeeB?.uUnClaimedFor24HUSD ?? 0);
    const miningUSD = (y.Mining ?? []).reduce((s, m) => s + Number(m.uUnClaimedFor24HUSD ?? 0), 0);
    const totalUSD  = feeAUSD + feeBUSD + miningUSD;
    const activeMin = (y.Mining ?? []).filter(m => Number(m.unClaimedFor24HAmount) > 0);

    let miningLines = "";
    activeMin.forEach(m => {
      miningLines += `  • ${coinName(m.CoinType)}: ${m.unClaimedFor24HAmount} ($${fmtUSD(Number(m.uUnClaimedFor24HUSD))})\n`;
    });

    await sendTelegram(
      `💰 <b>Claimable Yield — DEEP/SUI</b>\n\n` +
      `<b>Fees</b>\n` +
      `  • ${coinName(y.FeeA.CoinType)}: ${y.FeeA.unClaimedFor24HAmount} ($${fmtUSD(feeAUSD)})\n` +
      `  • ${coinName(y.FeeB.CoinType)}: ${y.FeeB.unClaimedFor24HAmount} ($${fmtUSD(feeBUSD)})\n\n` +
      (miningLines ? `<b>Mining Rewards</b>\n${miningLines}\n` : "") +
      `<b>Total Claimável: $${fmtUSD(totalUSD)}</b>\n\n` +
      `⏰ ${new Date().toLocaleString("pt-BR")}`
    );
  } catch (e) {
    err("Falha ao buscar yield inicial: " + e.message);
  }

  let iteration      = 0;
  let wasInRange     = true;
  let lastYieldNotif = Date.now(); // controle do intervalo de 30min
  const YIELD_NOTIF_INTERVAL = 5 * 60 * 1000; // 30 minutos em ms

  const run = async () => {
    iteration++;
    try {
      info(`Buscando dados (iteração #${iteration})...`);
      const data = await fetchAll();
      const pct  = display(data, iteration);

      if (wasInRange && !data.derived.inRange) {
        notifyOutOfRange(data.pool.currentPrice, data.derived.priceLower, data.derived.priceUpper, pct, data.yield);
      } else if (!wasInRange && data.derived.inRange) {
        notifyBackInRange(data.pool.currentPrice, data.derived.priceLower, data.derived.priceUpper);
      }

      wasInRange = data.derived.inRange;

      // Envia resumo de yield ao Telegram a cada 30 minutos
      if (data.yield && Date.now() - lastYieldNotif >= YIELD_NOTIF_INTERVAL) {
        const y          = data.yield;
        const feeAUSD    = Number(y.FeeA?.uUnClaimedFor24HUSD ?? 0);
        const feeBUSD    = Number(y.FeeB?.uUnClaimedFor24HUSD ?? 0);
        const miningUSD  = (y.Mining ?? []).reduce((s, m) => s + Number(m.uUnClaimedFor24HUSD ?? 0), 0);
        const totalUSD   = feeAUSD + feeBUSD + miningUSD;
        const activeMin  = (y.Mining ?? []).filter(m => Number(m.unClaimedFor24HAmount) > 0);

        let miningLines = "";
        activeMin.forEach(m => {
          miningLines += `  • ${coinName(m.CoinType)}: ${m.unClaimedFor24HAmount} ($${fmtUSD(Number(m.uUnClaimedFor24HUSD))})\n`;
        });

        await sendTelegram(
          `💰 <b>Claimable Yield — DEEP/SUI</b>\n\n` +
          `<b>Fees</b>\n` +
          `  • ${coinName(y.FeeA.CoinType)}: ${y.FeeA.unClaimedFor24HAmount} ($${fmtUSD(feeAUSD)})\n` +
          `  • ${coinName(y.FeeB.CoinType)}: ${y.FeeB.unClaimedFor24HAmount} ($${fmtUSD(feeBUSD)})\n\n` +
          (miningLines ? `<b>Mining Rewards</b>\n${miningLines}\n` : "") +
          `<b>Total Claimável: $${fmtUSD(totalUSD)}</b>\n\n` +
          `⏰ ${new Date().toLocaleString("pt-BR")}`
        );
        lastYieldNotif = Date.now();
      }
    } catch (e) {
      err("Erro: " + e.message);
      console.error(e);
    }
  };

  await run();
  setInterval(run, INTERVAL_MS);
}

main();
