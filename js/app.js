/* ===================================================
   BitcoinPulse - app.js
   Fetches live BTC price + news via free public APIs
   =================================================== */

const RSS_FEEDS = [
  'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fcointelegraph.com%2Frss',
  'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fbitcoinist.com%2Ffeed',
  'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fnewsbtc.com%2Ffeed',
];
const BTC_PRICE_API = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,gbp&include_24hr_change=true';
const PRICE_HISTORY_API = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=daily';
const ITEMS_PER_PAGE = 6;

let allArticles = [];
let displayedCount = 0;

document.addEventListener('DOMContentLoaded', () => {
  fetchBTCPrice();
  fetchAllNews();
  setInterval(fetchBTCPrice, 60000);
  setInterval(fetchAllNews, 300000);
  document.getElementById('loadMoreBtn').addEventListener('click', showMoreArticles);
  document.getElementById('newsletterForm').addEventListener('submit', handleNewsletter);
});

async function fetchBTCPrice() {
  try {
    const res = await fetch(BTC_PRICE_API);
    const data = await res.json();
    const priceUSD = data.bitcoin.usd;
    const priceGBP = data.bitcoin.gbp;
    const change = data.bitcoin.usd_24h_change;
    const sign = change >= 0 ? '+' : '';
    const cls = change >= 0 ? 'price-up' : 'price-down';
    const arrow = change >= 0 ? '\u25b2' : '\u25bc';
    document.getElementById('priceDisplay').textContent = `$${priceUSD.toLocaleString()}`;
    document.getElementById('priceChange').innerHTML = `<span class="${cls}">${arrow} ${sign}${change.toFixed(2)}% (24h)</span> &nbsp; \u00a3${priceGBP.toLocaleString()}`;
    document.getElementById('btcTicker').textContent = `BTC: $${priceUSD.toLocaleString()} ${arrow} ${sign}${change.toFixed(2)}%`;
    document.getElementById('btcTicker').className = 'btc-ticker ' + cls;
    fetchMiniChart();
  } catch (e) {
    document.getElementById('priceDisplay').textContent = 'Price unavailable';
  }
}

async function fetchMiniChart() {
  try {
    const res = await fetch(PRICE_HISTORY_API);
    const data = await res.json();
    drawMiniChart(data.prices.map(p => p[1]));
  } catch (e) {}
}

function drawMiniChart(prices) {
  const canvas = document.getElementById('miniChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(247,147,26,0.3)');
  grad.addColorStop(1, 'rgba(247,147,26,0)');
  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / range) * h * 0.85 - h * 0.05;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#f7931a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
}

async function fetchAllNews() {
  document.getElementById('newsGrid').innerHTML = '<div class="skeleton"></div>'.repeat(6);
  const results = await Promise.allSettled(RSS_FEEDS.map(url => fetch(url).then(r => r.json())));
  allArticles = [];
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.items) allArticles.push(...r.value.items);
  });
  const seen = new Set();
  allArticles = allArticles.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; });
  allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  displayedCount = 0;
  document.getElementById('newsGrid').innerHTML = '';
  showMoreArticles();
  updateTicker();
  updateTrending();
}

function showMoreArticles() {
  const grid = document.getElementById('newsGrid');
  const slice = allArticles.slice(displayedCount, displayedCount + ITEMS_PER_PAGE);
  slice.forEach(article => grid.appendChild(createCard(article)));
  displayedCount += slice.length;
  document.getElementById('loadMoreBtn').style.display = displayedCount >= allArticles.length ? 'none' : 'block';
}

function createCard(article) {
  const img = article.thumbnail && article.thumbnail.length > 10
    ? article.thumbnail
    : `https://picsum.photos/seed/${encodeURIComponent(article.title.slice(0,10))}/400/200`;
  const date = article.pubDate ? new Date(article.pubDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';
  const source = article.author || new URL(article.link || 'https://bitcoinpulse.io').hostname.replace('www.', '');
  const desc = stripHtml(article.description || '').slice(0, 120) + '...';
  const card = document.createElement('div');
  card.className = 'news-card';
  card.innerHTML = `
    <a href="${article.link}" target="_blank" rel="noopener noreferrer nofollow" class="card-link">
      <img src="${img}" alt="${escapeHtml(article.title)}" loading="lazy" onerror="this.src='https://placehold.co/400x200/131720/f7931a?text=BitcoinPulse'" />
      <div class="card-body">
        <span class="card-tag">Bitcoin</span>
        <h2 class="card-title">${escapeHtml(article.title)}</h2>
        <p class="card-desc">${escapeHtml(desc)}</p>
        <div class="card-meta"><span>${source}</span><span>${date}</span></div>
      </div>
    </a>`;
  return card;
}

function updateTicker() {
  const headlines = allArticles.slice(0, 10).map(a => a.title).join('   \u2022   ');
  document.getElementById('newsTicker').textContent = headlines || 'Loading latest Bitcoin news...';
}

function updateTrending() {
  const list = document.getElementById('trendingList');
  if (!list) return;
  const top5 = allArticles.slice(0, 5);
  list.innerHTML = top5.map((a, i) => `
    <li><span class="trending-rank">${i + 1}</span>
    <a href="${a.link}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(a.title.slice(0, 60))}${a.title.length > 60 ? '...' : ''}</a></li>`).join('');
}

function handleNewsletter(e) {
  e.preventDefault();
  const email = e.target.querySelector('input').value;
  alert(`\u2705 Subscribed! Welcome to BitcoinPulse Daily Digest.\n\nEmail: ${email}`);
  e.target.reset();
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
