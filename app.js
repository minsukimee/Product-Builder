// --- DOM Elements ---
const dom = {
    timer: document.getElementById('timer'),
    nextRoundCountdown: document.getElementById('next-round-countdown'),
    roundNumber: document.getElementById('round-number'),
    roundSeed: document.getElementById('round-seed'),
    copySeedBtn: document.getElementById('copy-seed-btn'),
    accountBalance: document.getElementById('account-balance'),
    lastRoundPnl: document.getElementById('last-round-pnl'),
    allTimeHigh: document.getElementById('all-time-high'),
    bankruptCount: document.getElementById('bankrupt-count'),
    roundCash: document.getElementById('round-cash'),
    positionSize: document.getElementById('position-size'),
    entryPrice: document.getElementById('entry-price'),
    pnlValue: document.getElementById('pnl-value'),
    pnlPercent: document.getElementById('pnl-percent'),
    marginUsed: document.getElementById('margin-used'),
    riskMeter: document.getElementById('risk-meter'),
    leverageDisplay: document.getElementById('leverage-display'),
    leverageSlider: document.getElementById('leverage-slider'),
    leveragePresets: document.querySelectorAll('.leverage-presets button'),
    qtyInput: document.getElementById('qty-input'),
    qtyPresets: document.querySelectorAll('.qty-presets button'),
    maxQtyBtn: document.getElementById('max-qty-btn'),
    buyBtn: document.getElementById('buy-btn'),
    sellBtn: document.getElementById('sell-btn'),
    panicSellBtn: document.getElementById('panic-sell-btn'),
    currentPrice: document.getElementById('current-price'),
    priceChartCanvas: document.getElementById('price-chart'),
    newsFeed: document.getElementById('news-feed'),
    bankruptOverlay: document.getElementById('bankrupt-overlay'),
    adRescueBtn: document.getElementById('ad-rescue-btn'),
    adTimer: document.getElementById('ad-timer'),
    adProgress: document.getElementById('ad-progress'),
    adCooldown: document.getElementById('ad-cooldown'),
};

// --- Game Constants ---
const ROUND_DURATION = 300 * 1000;
const TICK_INTERVAL = 250;
const SLIPPAGE = 0.0008;
const FEE_RATE = 0.0015;
const AD_RESCUE_AMOUNT = 2000;
const AD_COOLDOWN = 60 * 1000;
const AD_DAILY_LIMIT = 10;
const CANDLE_INTERVAL = 15 * 1000; // 15 seconds

// --- Game State ---
let gameState = {};
let roundState = {};
let chart;
let candleState = null;
let gameLoopInterval;

const EVENTS = {
    'Whale Pump': { driftBoost: 0.0005, volMult: 1.8, duration: [12, 25] },
    'Rug Fear Dump': { driftBoost: -0.0006, volMult: 2.2, duration: [12, 25] },
    'Exchange Lag': { driftBoost: 0, volMult: 4.0, duration: [8, 15] },
    'Influencer FOMO': { driftBoost: 0.0008, volMult: 2.5, duration: [15, 30] },
    'Liquidation Cascade': { driftBoost: -0.0009, volMult: 3.5, duration: [10, 20] },
};
let activeEvent = null;

function init() {
    loadGameState();
    initEventListeners();
    initChart();
    startNewRound();
    gameLoopInterval = setInterval(tick, TICK_INTERVAL);
}

function loadGameState() {
    const savedState = localStorage.getItem('WW_GAME_STATE_V1');
    if (savedState) {
        gameState = JSON.parse(savedState);
    } else {
        gameState = {
            accountBalance: 10000,
            allTimeHigh: 10000,
            bankruptCount: 0,
            lastRoundPnl: 0,
            adRescue: { count: 0, lastUsed: 0 },
            roundNumber: 0,
        };
    }
}

function saveGameState() {
    localStorage.setItem('WW_GAME_STATE_V1', JSON.stringify(gameState));
}

function startNewRound() {
    if (gameState.accountBalance <= 0 && gameState.bankruptCount > 0) {
        handleLiquidation(true);
        return;
    }

    // Explicitly hide overlay and enable controls
    dom.bankruptOverlay.classList.add('hidden');
    [dom.buyBtn, dom.sellBtn, dom.panicSellBtn].forEach(btn => btn.disabled = false);

    roundState = {
        isActive: true,
        isLiquidated: false,
        roundNumber: gameState.roundNumber + 1,
        seed: Math.random().toString(36).substring(2),
        startTime: Date.now(),
        cash: gameState.accountBalance,
        positionSize: 0,
        entryPrice: 0,
        leverage: roundState.leverage || 1,
        startPrice: 100,
        currentPrice: 100,
        minPrice: 50,
        maxPrice: 150,
        drift: (Math.random() - 0.5) * 0.0004,
        unrealizedPnl: 0,
    };
    gameState.roundNumber = roundState.roundNumber;
    
    candleState = null;
    chart.data.datasets[0].data = [];
    chart.update();
    
    logEvent("New round started! Good luck!", "system");
    updateAllUI();
}

function endRound() {
    roundState.isActive = false;
    if (roundState.positionSize > 0) {
        sell(roundState.positionSize, true);
    }
    
    gameState.lastRoundPnl = roundState.cash - gameState.accountBalance;
    gameState.accountBalance = roundState.cash;
    if (gameState.accountBalance > gameState.allTimeHigh) {
        gameState.allTimeHigh = gameState.accountBalance;
    }
    if (gameState.accountBalance <= 0) {
        handleLiquidation(true);
        return; 
    }
    
    saveGameState();
    logEvent(`Round ended. Final cash: $${roundState.cash.toFixed(2)}. Next round starts soon.`, "system");
    
    setTimeout(startNewRound, 2000);
}

function tick() {
    if (!roundState.isActive) return;

    const elapsed = Date.now() - roundState.startTime;
    if (elapsed >= ROUND_DURATION) {
        endRound();
        return;
    }

    updatePrice();
    updateMemeEvent();
    if (!roundState.isLiquidated) checkLiquidation();
    
    updateAllUI();
    
    // Candlestick aggregation
    const candleTime = Math.floor(elapsed / CANDLE_INTERVAL) * CANDLE_INTERVAL;
    if (!candleState || candleTime !== candleState.t) {
        if (candleState) {
            chart.data.datasets[0].data.push({x: candleState.t + roundState.startTime, o: candleState.o, h: candleState.h, l: candleState.l, c: candleState.c});
        }
        candleState = {
            t: candleTime,
            o: roundState.currentPrice,
            h: roundState.currentPrice,
            l: roundState.currentPrice,
            c: roundState.currentPrice,
        };
    } else {
        candleState.h = Math.max(candleState.h, roundState.currentPrice);
        candleState.l = Math.min(candleState.l, roundState.currentPrice);
        candleState.c = roundState.currentPrice;
    }
    
    const chartData = chart.data.datasets[0].data;
    const lastCandleData = chartData[chartData.length - 1];

    if (chartData.length > 0 && lastCandleData.x === candleState.t + roundState.startTime) {
        lastCandleData.h = candleState.h;
        lastCandleData.l = candleState.l;
        lastCandleData.c = candleState.c;
    } else {
         chartData.push({x: candleState.t + roundState.startTime, o: candleState.o, h: candleState.h, l: candleState.l, c: candleState.c});
    }

    if(chartData.length > 100) { 
        chartData.shift();
    }
    
    chart.update('none');
}

function buy(qty) {
    if (roundState.isLiquidated || qty <= 0) return;
    const fillPrice = roundState.currentPrice * (1 + SLIPPAGE);
    const notionalAdd = qty * fillPrice;
    const marginRequiredAdd = notionalAdd / roundState.leverage;
    const fee = notionalAdd * FEE_RATE;
    const totalCashNeeded = marginRequiredAdd + fee;

    if (roundState.cash < totalCashNeeded) {
        logEvent("Not enough cash to buy.", "error");
        return;
    }
    roundState.cash -= totalCashNeeded;
    const oldQty = roundState.positionSize;
    roundState.entryPrice = ((roundState.entryPrice * oldQty) + (fillPrice * qty)) / (oldQty + qty);
    roundState.positionSize += qty;
    logEvent(`Bought ${qty} @ $${fillPrice.toFixed(2)}`, "buy");
}

function sell(qty, isPanic = false) {
    if (roundState.isLiquidated || qty <= 0 || roundState.positionSize <= 0) return;
    qty = Math.min(qty, roundState.positionSize);
    const fillPrice = roundState.currentPrice * (1 - SLIPPAGE);
    const fee = (qty * fillPrice) * FEE_RATE;
    const pnl = qty * (fillPrice - roundState.entryPrice) * roundState.leverage;
    const marginReleased = (qty * roundState.entryPrice) / roundState.leverage;

    roundState.cash += marginReleased + pnl - fee;
    roundState.positionSize -= qty;
    if (roundState.positionSize < 1e-6) {
        roundState.positionSize = 0;
        roundState.entryPrice = 0;
    }
    logEvent(`Sold ${qty} @ $${fillPrice.toFixed(2)}`, "sell");
}

function checkLiquidation() {
    const totalEquity = roundState.cash + roundState.unrealizedPnl;
    if (roundState.positionSize > 0 && totalEquity <= 0) {
        logEvent("!!! POSITION LIQUIDATED !!!", "error");
        roundState.cash = 0;
        roundState.positionSize = 0;
        handleLiquidation(false);
    }
}

function handleLiquidation(isEndOfRound) {
    roundState.isLiquidated = true;
    if (isEndOfRound) {
      gameState.bankruptCount++;
      gameState.accountBalance = 0;
    }
    [dom.buyBtn, dom.sellBtn, dom.panicSellBtn].forEach(btn => btn.disabled = true);
    dom.bankruptOverlay.classList.remove('hidden');
    updateAdRescueUI();
    saveGameState();
}

function handleAdRescue() {
    const now = Date.now();
    const cooldownLeft = (gameState.adRescue.lastUsed + AD_COOLDOWN) - now;
    if (cooldownLeft > 0) {
        logEvent(`Ad Rescue on cooldown for ${Math.ceil(cooldownLeft / 1000)}s`, "error");
        return;
    }
    if (now - gameState.adRescue.lastUsed > 24 * 60 * 60 * 1000) {
        gameState.adRescue.count = 0;
    }
    if (gameState.adRescue.count >= AD_DAILY_LIMIT) {
        logEvent("Ad Rescue daily limit reached.", "error");
        return;
    }

    dom.adRescueBtn.disabled = true;
    dom.adTimer.classList.remove('hidden');
    let progress = 0;
    const adInterval = setInterval(() => {
        progress += 10;
        dom.adProgress.value = progress;
        if (progress >= 100) {
            clearInterval(adInterval);
            dom.adTimer.classList.add('hidden');
            
            gameState.accountBalance += AD_RESCUE_AMOUNT;
            gameState.adRescue.lastUsed = now;
            gameState.adRescue.count++;
            
            logEvent(`Ad Rescue successful! +$${AD_RESCUE_AMOUNT}`, "system");
            saveGameState();
            startNewRound();
        }
    }, 300);
}

function updatePrice() {
    let baseVol = 0.006;
    let currentDrift = roundState.drift;
    if (activeEvent) {
        baseVol *= activeEvent.volMult;
        currentDrift += activeEvent.driftBoost;
    }
    const proximity = (roundState.currentPrice - roundState.startPrice) / roundState.startPrice;
    if (proximity > 0.45) currentDrift -= (proximity - 0.45) * 0.02;
    if (proximity < -0.45) currentDrift += (-0.45 - proximity) * 0.02;
    const delta = (Math.random() - 0.5) * 2 * baseVol + currentDrift;
    roundState.currentPrice = Math.max(roundState.minPrice, Math.min(roundState.currentPrice * (1 + delta), roundState.maxPrice));
}

function updateMemeEvent() {
    if (activeEvent) {
        activeEvent.ticksLeft--;
        if (activeEvent.ticksLeft <= 0) {
            logEvent(`The ${activeEvent.name} has ended.`, "system");
            activeEvent = null;
        }
        return;
    }
    if (Math.random() < 0.015) {
        const eventKeys = Object.keys(EVENTS);
        const eventName = eventKeys[Math.floor(Math.random() * eventKeys.length)];
        const event = EVENTS[eventName];
        activeEvent = {
            name: eventName,
            ...event,
            ticksLeft: Math.floor(Math.random() * (event.duration[1] - event.duration[0]) + event.duration[0]),
        };
        logEvent(`*** ${eventName} STARTED ***`, "event");
    }
}

function logEvent(message, type = "info") {
    const li = document.createElement('li');
    li.textContent = message;
    li.classList.add(`log-${type}`);
    dom.newsFeed.prepend(li);
    if (dom.newsFeed.children.length > 40) {
        dom.newsFeed.lastChild.remove();
    }
}

function updateAllUI() {
    const remaining = Math.max(0, ROUND_DURATION - (Date.now() - roundState.startTime));
    dom.timer.textContent = `${Math.floor(remaining / 60000).toString().padStart(2, '0')}:${Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0')}`;
    dom.currentPrice.textContent = roundState.currentPrice.toFixed(2);
    dom.roundCash.textContent = `$${roundState.cash.toFixed(2)}`;
    dom.positionSize.textContent = roundState.positionSize.toFixed(4);
    dom.entryPrice.textContent = roundState.entryPrice > 0 ? `$${roundState.entryPrice.toFixed(2)}` : 'N/A';
    if (roundState.positionSize > 0) {
        roundState.unrealizedPnl = roundState.positionSize * (roundState.currentPrice - roundState.entryPrice) * roundState.leverage;
        const margin = (roundState.positionSize * roundState.entryPrice) / roundState.leverage;
        dom.pnlValue.textContent = `$${roundState.unrealizedPnl.toFixed(2)}`;
        dom.pnlPercent.textContent = `${(margin !== 0 ? (roundState.unrealizedPnl / margin * 100) : 0).toFixed(2)}%`;
        dom.pnlValue.style.color = roundState.unrealizedPnl >= 0 ? 'var(--long-color)' : 'var(--short-color)';
        dom.pnlPercent.style.color = dom.pnlValue.style.color;
    } else {
        dom.pnlValue.textContent = '$0.00';
        dom.pnlPercent.textContent = '0%';
        dom.pnlValue.style.color = '';
        dom.pnlPercent.style.color = '';
    }
    updateAccountUI();
}

function updateAccountUI() {
    dom.accountBalance.textContent = `$${gameState.accountBalance.toFixed(2)}`;
    dom.lastRoundPnl.textContent = `$${gameState.lastRoundPnl.toFixed(2)}`;
    dom.allTimeHigh.textContent = `$${gameState.allTimeHigh.toFixed(2)}`;
    dom.bankruptCount.textContent = gameState.bankruptCount;
}

function updateAdRescueUI() {
    const now = Date.now();
    const cooldownLeft = (gameState.adRescue.lastUsed + AD_COOLDOWN) - now;
    if (cooldownLeft > 0) {
        dom.adRescueBtn.disabled = true;
        dom.adCooldown.classList.remove('hidden');
        dom.adCooldown.textContent = `Available in ${Math.ceil(cooldownLeft/1000)}s`;
    } else {
        dom.adRescueBtn.disabled = false;
        dom.adCooldown.classList.add('hidden');
    }
}

function initEventListeners() {
    dom.copySeedBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(roundState.seed).then(() => {
            logEvent("Round seed copied to clipboard!", "system");
        });
    });
    dom.leverageSlider.addEventListener('input', e => {
        if(roundState.positionSize > 0) { e.target.value = roundState.leverage; return; }
        roundState.leverage = Number(e.target.value);
        dom.leverageDisplay.textContent = `${roundState.leverage}x`;
    });
    dom.leveragePresets.forEach(btn => {
        btn.addEventListener('click', () => {
             if(roundState.positionSize > 0) return;
            roundState.leverage = Number(btn.dataset.leverage);
            dom.leverageSlider.value = roundState.leverage;
            dom.leverageDisplay.textContent = `${roundState.leverage}x`;
        });
    });
    dom.buyBtn.addEventListener('click', () => buy(Number(dom.qtyInput.value)));
    dom.sellBtn.addEventListener('click', () => sell(Number(dom.qtyInput.value)));
    dom.panicSellBtn.addEventListener('click', () => sell(roundState.positionSize, true));
    dom.adRescueBtn.addEventListener('click', handleAdRescue);
}

function initChart() {
    const ctx = dom.priceChartCanvas.getContext('2d');
    chart = new Chart(ctx, {
        type: 'candlestick',
        data: {
            datasets: [{
                label: 'Price',
                data: [],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'second' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                },
                y: { 
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
