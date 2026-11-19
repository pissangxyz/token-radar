// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, and a per-protocol detail view with the model's own inputs
// and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
// decide the action, the capital, the hold and every cost and time. No name is special-cased, and
// the page recomputes each row's implied value from the snapshot figures, so the page's code and the
// board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a pre-token row from the snapshot figures and
  // checks the number board.json carries. Traded rows carry a residual, not a launch value.
  function impliedOf(row) {
    if (row.token_status === 'traded') return null;
    return Math.max(1, Math.round(row.tvl_usd * row.calibrated_multiple * row.category_multiplier * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier));
  }
  function minPreToken() {
    var min = Infinity;
    DATA.rows.forEach(function (r) { if (r.token_status === 'pre-token' && r.implied_value_usd < min) min = r.implied_value_usd; });
    return min === Infinity ? 1 : min;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function secondChainOf(p) { return p.chains && p.chains.length > 1 ? p.chains[1] : chainOf(p); }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', borrow $' + Math.round(capital / 2) + ' of the cheapest asset against it, and repay the borrow within a day.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + capital + " of USDC into the main pair on " + name + ' on ' + chain + ", then add the full amount as liquidity in the pool's active range.";
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('aggregator') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s highest-TVL vault on " + chain + ' and keep the vault shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', use the bridged funds in one app there, and bridge a small amount back.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ', open one small hedged position, and close it the same week.';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + name + ' with $' + capital + ' on ' + chain + ' and take one position in a market that resolves within a month.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and leave the allocation untouched for the hold.';
    if (c.indexOf('stable') >= 0) return 'Mint $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the same wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it through one yield payout.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the hold.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s basis vault on " + chain + ' and keep the position through one funding cycle.';
    if (c.indexOf('launchpad') >= 0) return 'Register for ' + name + "'s next launch on " + chain + ' with $' + capital + ' and complete its allocation steps.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and use its main feature once with the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'On ' + chain + ", stake the liquidity receipt or join " + name + "'s gauge with $" + small + ' so the position earns a second reward stream.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'On ' + chain + ', supply $' + small + ' of a second asset to ' + name + ' so the wallet shows two collateral types.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Send $' + small + ' back across ' + name + ' to the chain you started on, so the wallet shows a round trip.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Delegate the staked position' + "'s voting power on " + chain + ' and vote on one live proposal.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Place one limit order for $' + small + ' on ' + name + ' on ' + chain + ' and let it fill or expire on its own.';
    return 'On ' + chain + ', vote on one live ' + name + ' proposal or join its community call with the position open, and keep a note of the date.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var chain2 = secondChainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var small = Math.max(10, Math.round(capital / 5));
    if (p.token_status === 'traded') {
      return [
        { text: 'The token already trades, so there is no launch left to farm here: do not buy it expecting an airdrop.', cost: 'nothing to check', time: '5 minutes' },
        { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '20 minutes to set up' },
        { text: 'If you hold the token, vote on one live governance proposal; if you do not hold it, skip this step.', cost: 'about $1 of gas to vote', time: '10 minutes' },
        { text: 'Check the position weekly and exit when the yield falls below your hurdle; write the wallet, the dates and every transaction in a farm log.', cost: 'the capital stays in the position', time: '10 minutes a week' }
      ].map(stepText);
    }
    return [
      { text: "Open the protocol's own site from its official docs and check the points or rewards page before you deposit anything.", cost: 'nothing to check', time: '10 minutes' },
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, fund it with $' + capital + ' of USDC on ' + chain + ', and keep its seed phrase offline.', cost: 'about $2 of gas for the first transfer', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '20 minutes to set up' },
      { text: secondActionFor(p, capital, chain2), cost: 'about $' + small + ' of capital and $2 of gas', time: '15 minutes' },
      { text: 'Do one qualifying action a week — a deposit, a swap, a vote or a claim — and hold the position for at least ' + hold + ' days so the activity spans more than one snapshot.', cost: 'about $2 of gas a week', time: '10 minutes a week for ' + hold + ' days' },
      { text: "Write the wallet, the dates and every transaction in a farm log; before you withdraw, claim only from the link the protocol's own page publishes, and never pay to claim.", cost: 'no fee to check', time: '10 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tab === 'pre-token' && r.token_status !== 'pre-token') return false;
      if (state.tab === 'traded' && r.token_status !== 'traded') return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null, 'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }), ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.pre_token_size - DATA.watchlist_size) }), ' pre-token protocols below that floor, scored by a multiple the market itself sets. Implied value is a model, not a promise.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.pre_token_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Already launched, set apart' }), el('b', { text: String(DATA.traded_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Calibrated FDV/TVL multiple' }), el('b', { text: String(DATA.calibrated_multiple) + 'x' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var traded = el('button', { type: 'button', class: 'teal', 'aria-pressed': state.tab === 'traded' ? 'true' : 'false', text: 'Already launched', onclick: function () { state.tab = 'traded'; render(); } });
    var all = el('button', { type: 'button', 'aria-pressed': state.tab === 'all' ? 'true' : 'false', text: 'All rows', onclick: function () { state.tab = 'all'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, traded, all)),
      el('span', { class: 'count', text: rows().length + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.token_status === 'pre-token' && r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var traded = r.token_status === 'traded';
      var pill = traded
        ? el('span', { class: 'pill traded', text: 'already trades' })
        : r.watchlist
          ? el('span', { class: 'pill watch', text: 'watchlist' })
          : el('span', { class: 'pill', text: 'no token' });
      var tr = el('tr', {
        class: traded ? 'traded-row' : null,
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar' + (traded ? ' teal' : ''), 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, pill)
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: state.tab === 'traded' ? 'Already launched: these protocols trade, so their value is a small residual, not a launch. Select a row for its detail.' : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var catSeen = {};
    var chips = [];
    DATA.rows.forEach(function (r) {
      if (r.token_status !== 'pre-token' || !r.category) return;
      if (catSeen[r.category]) return;
      catSeen[r.category] = true;
      chips.push(el('span', { class: 'catchip' }, r.category + ' ', el('b', { text: 'x' + r.category_multiplier })));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every pre-token row, and the market sets its multiple: the median mcap/TVL of the ' + DATA.calibrated_samples + ' traded protocols that report both figures is ' + DATA.calibrated_multiple + 'x. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ', el('b', { text: String(DATA.calibrated_multiple) }), ' x category x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.04 x min(chains - 1, 5)) )'
      ),
      el('div', { class: 'catgrid' }, chips),
      el('p', { class: 'sub', text: 'Category is the median mcap/TVL of that category\'s traded protocols (3+ samples), clamped to 0.5x-2.0x the calibrated multiple; a category with too few traded names uses 1.0x. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Already-launched protocols sit at the bottom with a small residual (1000 + 1000 x log10(1 + mcap/1M), capped at half the smallest pre-token row): ' + DATA.traded_unranked + ' more already trade but report no market cap, so no residual is stated for them.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var traded = row.token_status === 'traded';
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var eqRows = [
      el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
      el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) }))
    ];
    if (traded) {
      eqRows.push(
        el('div', null, el('span', { text: 'Market cap (live)' }), el('b', { class: 'num', text: fmtUsd(row.mcap_usd) })),
        el('div', null, el('span', { text: 'Residual value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      );
    } else {
      eqRows.push(
        el('div', null, el('span', { text: 'Calibrated FDV/TVL' }), el('b', { class: 'num', text: String(row.calibrated_multiple) + 'x' })),
        el('div', null, el('span', { text: 'Category multiplier' }), el('b', { class: 'num', text: 'x' + row.category_multiplier })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) }))
      );
    }
    eqRows.push(el('div', { class: 'total' }, el('span', { text: traded ? 'Residual value' : 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: traded ? 'Already launched' : 'Implied value' }),
      el('div', { class: 'equation' }, eqRows),
      el('p', { class: 'sub', text: traded
        ? 'The token already trades, so this is a residual for the live incentives around it, capped below half the smallest pre-token row (' + fmtUsd(Math.floor(minPreToken() / 2)) + '). There is no launch left to farm here.'
        : 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(boardTable());
    if (state.tab !== 'traded') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
