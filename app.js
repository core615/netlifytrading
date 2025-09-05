// app.js (V2-ready, no API key in client, calls Netlify function proxy)
const Config = {
  emailJsServiceId: 'service_zkkk11g',
  emailJsTemplateId: 'template_easlzdw',
  emailJsPublicKey: 'jxuRqREhhKGPV99oe'
};

const State = {
  currentSymbol: 'AAPL',
  currentExchange: '',
  currentChart: null,
  watchlist: [],
  currentTimeframe: '1D'
};

const DOM = {
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  stockName: document.getElementById('stockName'),
  stockSymbol: document.getElementById('stockSymbol'),
  stockPrice: document.getElementById('stockPrice'),
  stockChange: document.getElementById('stockChange'),
  tfControls: document.getElementById('tfControls'),
  chartCanvas: document.getElementById('stockChart'),
  statOpen: document.getElementById('statOpen'),
  statHigh: document.getElementById('statHigh'),
  statLow: document.getElementById('statLow'),
  statVolume: document.getElementById('statVolume'),
  stat52wHigh: document.getElementById('stat52wHigh'),
  stat52wLow: document.getElementById('stat52wLow'),
  searchInput: document.getElementById('stockSearchInput'),
  searchResults: document.getElementById('searchResults'),
  watchlistContainer: document.getElementById('watchlist'),
  profileForm: document.getElementById('profileForm'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail'),
  saveConfirmation: document.getElementById('saveConfirmation'),
  emailNotification: document.getElementById('emailNotification'),
  emailError: document.getElementById('emailError'),
};

const UI = {
  showLoading(show) { DOM.loading.style.display = show ? 'flex' : 'none'; },
  showError(message) { DOM.error.style.display = 'block'; DOM.error.textContent = message; },
  updateQuote(q) {
    if (!q) return;
    console.log('Updating quote with data:', q); // Debug: Log quote data
    DOM.stockName.textContent = q.name || q.symbol || '—';
    DOM.stockSymbol.textContent = q.symbol || '—';
    DOM.stockPrice.textContent = (q.last ?? q.close ?? q.open ?? '—');
    const cp = q.change_percentage;
    DOM.stockChange.textContent = (typeof cp === 'number' ? `${cp}%` : (cp || '—'));
    DOM.statOpen.textContent = q.open ?? '—';
    DOM.statHigh.textContent = q.high ?? '—';
    DOM.statLow.textContent = q.low ?? '—';
    DOM.statVolume.textContent = q.volume ?? '—';
    DOM.stat52wHigh.textContent = q.year_high ?? '—';
    DOM.stat52wLow.textContent = q.year_low ?? '—';
  },
  showNotification(message, type, element = DOM.saveConfirmation) {
    element.textContent = message;
    element.className = `notification ${type}`;
    element.style.display = 'block';
    setTimeout(() => (element.style.display = 'none'), 3000);
  }
};

const API = {
  async fetchMarketstack(endpoint, params = {}) {
    UI.showLoading(true);
    console.log('Fetching Marketstack:', { endpoint, params }); // Debug: Log API request
    try {
      const url = '/.netlify/functions/marketstack?' + new URLSearchParams({ endpoint, ...params }).toString();
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()));
      const j = await r.json();
      console.log('Marketstack response:', j); // Debug: Log API response
      if (j?.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j;
    } catch (err) {
      console.error('Marketstack fetch failed:', err); // Debug: Log fetch errors
      throw err;
    } finally {
      UI.showLoading(false);
    }
  },
  first(data) {
    const result = (Array.isArray(data?.data) ? data.data[0] : (Array.isArray(data) ? data[0] : (data?.data || data || null)));
    console.log('First data extracted:', result); // Debug: Log extracted data
    return result;
  },
  async getQuote(symbol, exchange) {
    let q = null;
    console.log('Getting quote for:', { symbol, exchange }); // Debug: Log quote request
    try {
      const intra = await this.fetchMarketstack('intraday/latest', { symbols: symbol, exchange });
      q = this.first(intra);
    } catch (_) {
      console.log('Intraday failed, falling back to EOD:', _); // Debug: Log intraday fallback
    }
    if (!q) {
      const e = await this.fetchMarketstack('eod/latest', { symbols: symbol, exchange });
      q = this.first(e);
    }
    console.log('Quote result:', q); // Debug: Log final quote
    return q;
  },
  async getIntradayData(symbol, limit = 48) {
    console.log('Getting intraday data for:', { symbol, limit }); // Debug: Log intraday request
    try {
      const today = new Date().toISOString().split('T')[0];
      const r = await this.fetchMarketstack('intraday', { symbols: symbol, date_from: today, limit });
      return r.data || r;
    } catch (_) {
      console.log('Intraday failed, falling back to EOD:', _); // Debug: Log intraday fallback
      const r = await this.fetchMarketstack('eod', { symbols: symbol, limit: 30 });
      return r.data || r;
    }
  },
  async getHistoricalData(symbol, tf) {
    console.log('Getting historical data for:', { symbol, tf }); // Debug: Log historical request
    if (tf === '1D') return await this.getIntradayData(symbol, 48);
    const limits = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
    const r = await this.fetchMarketstack('eod', { symbols: symbol, limit: limits[tf] || 30 });
    return r.data || r;
  }
};

const ChartManager = {
  draw(rows) {
    const ctx = DOM.chartCanvas.getContext('2d');
    if (State.currentChart) State.currentChart.destroy();
    const data = Array.isArray(rows?.data) ? rows.data : rows;
    console.log('Chart data received:', data); // Debug: Log chart data
    const labels = (data || []).map(d => {
      const dt = new Date(d.date);
      return (State.currentTimeframe === '1D') ? dt.toLocaleTimeString() : dt.toLocaleDateString();
    });
    const values = (data || []).map(d => d.close ?? d.last ?? d.open ?? 0);
    State.currentChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Price', data: values, fill: true, tension: 0.1 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
    });
  }
};

const App = {
  init() {
    emailjs.init(Config.emailJsPublicKey);
    this.addEventListeners();
    this.loadInitialData();
  },
  addEventListeners() {
    DOM.profileForm.addEventListener('submit', (e) => this.handleProfileSave(e));
    DOM.tfControls.addEventListener('click', (e) => this.handleTimeframeChange(e));
    DOM.searchInput.addEventListener('input', this.handleSearch);
  },
  async loadInitialData() {
    console.log('Loading initial data for:', State.currentSymbol); // Debug: Log initial load
    const saved = localStorage.getItem('userProfile');
    if (saved) { const { name, email } = JSON.parse(saved); DOM.userName.value = name; DOM.userEmail.value = email; }
    await this.loadSymbolData(State.currentSymbol, State.currentExchange);
  },
  async loadSymbolData(symbol, exchange) {
    console.log('Loading symbol data:', { symbol, exchange, timeframe: State.currentTimeframe }); // Debug: Log symbol load
    State.currentSymbol = symbol;
    State.currentExchange = exchange;
    DOM.stockSymbol.textContent = symbol;
    try {
      const q = await API.getQuote(symbol, exchange);
      if (!q) throw new Error('No quote found');
      UI.updateQuote(q);
      const chart = await API.getHistoricalData(symbol, State.currentTimeframe);
      console.log('Historical data for chart:', chart); // Debug: Log chart data
      if (chart && (chart.length || chart.data?.length)) ChartManager.draw(chart);
      else UI.showError('No chart data available for this timeframe');
    } catch (err) {
      console.error('Load data failed:', err); // Debug: Log load errors
      UI.showError('Failed to load stock data');
    }
  },
  handleProfileSave(e) {
    e.preventDefault();
    const name = DOM.userName.value, email = DOM.userEmail.value;
    console.log('Saving profile:', { name, email }); // Debug: Log profile save
    localStorage.setItem('userProfile', JSON.stringify({ name, email }));
    UI.showNotification('Details saved!', 'success');
    emailjs.send(Config.emailJsServiceId, Config.emailJsTemplateId, { to_name: name, to_email: email })
      .then(() => UI.showNotification('Welcome email sent successfully!', 'success', DOM.emailNotification))
      .catch((err) => { console.error('Email send failed:', err); UI.showNotification('Failed to send welcome email.', 'error', DOM.emailError); });
  },
  handleTimeframeChange(e) {
    if (e.target.tagName === 'BUTTON') {
      console.log('Changing timeframe to:', e.target.dataset.tf); // Debug: Log timeframe change
      State.currentTimeframe = e.target.dataset.tf;
      this.loadSymbolData(State.currentSymbol, State.currentExchange);
    }
  },
  handleSearch(e) {
    const q = e.target.value.trim();
    console.log('Search input:', q); // Debug: Log search input
    if (q.length < 2) { DOM.searchResults.innerHTML = ''; return; }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
