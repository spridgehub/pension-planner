# Pension Planner engine

UK retirement income engine plus a single-page dashboard (`dist/pension-planner.html`).
It lays out the options for someone at retirement so they can make their own decision.
It is information, not advice.

The engine works in three layers:

1. **State Pension.** New State Pension £241.30/week (2026/27), with State Pension age and
   either triple-lock or CPI uprating.
2. **Secure floor.** Annuities: single or joint life (survivor %), guarantee period, value
   protection, and level, fixed %, RPI, CPI or LPI (capped) escalation. Partial annuities are
   sized to cover essential spending.
3. **Discretionary.** Drawdown using the 4% rule (fixed real), percentage of pot, guardrails
   (Guyton-Klinger) or ceiling/floor, plus a later-life spending slowdown. Blends, and an
   annuity in place of the bond allocation.

## Data

| File | Source |
|---|---|
| `data/ons-qx-2022.json` | ONS 2022-based England life tables, principal projection, period qx 2020–2072 (cohort diagonals) |
| `data/uk-history.json` | UK CPI and equity, gilt and cash total returns 1872–2020 from the Jordà–Schularick–Taylor Macrohistory Database R6. **2021–2025 entered by hand from published figures (provisional).** |
| `data/market-rates-2026-10-22.json` | Hargreaves Lansdown best-buy annuity rates, 22 Oct 2026 |
| `data/market-basis.json` | Pricing basis fitted to those rates by `npm run calibrate` (RMS error 1.1%, max 2.4%) |

`python3 scripts/extract_data.py` rebuilds the first two files from the raw downloads (URLs are in the script).

MoneyHelper's comparison tool has no public API and sits behind bot protection, so it is not
scraped. Instead, enter or paste a quote from it, and `anchorBasis()` re-anchors the model to
that real price. The DMO gilt pages are also captcha-protected, so `SAMPLE_GILTS` holds a dated
price snapshot. Update the prices before using it.

## Live market data

`npm run refresh` fetches Bank Rate, the 10- and 20-year gilt yields, the 20-year real yield
and implied inflation (Bank of England), plus monthly CPI (ONS), into `data/market-now.json`,
then rebuilds the page. `liveBasis()` shifts the annuity pricing basis by the change in
20-year yields and implied inflation since calibration. `todaysRegime()` classifies today's
starting conditions; `regimeYears()` and `bootstrapScenarios({ startYears })` simulate futures
that open with a real decade from similar starts (like today, high inflation, low rates).

## Scenarios and insights

`PERSONAS` (four standard households), `strategySet()` (seven strategies to race),
`potMatrix()` (pot sizes £100k–£1m) and `insights()` (what-ifs on charges, timing,
inflation, starting conditions, annuity-for-bonds, survivor cover and gilts).

## Use

```sh
npm test                 # 12 checks: tax, mortality, calibration, cash-flow invariants, quotes, gilts
node cli.js [household.json]
npm run build:web        # -> dist/pension-planner.html and docs/index.html (GitHub Pages)
npm run calibrate        # refit the annuity basis after updating market rates
```

```js
import * as E from './src/index.js';
const household = { person: { age: 65, sex: 'male' }, partner: { age: 62, sex: 'female' },
  pensionPot: 400000, otherSavings: 20000, essentialSpending: 26000 };
const scen = E.bootstrapScenarios({ n: 2000, horizon: 50 });
const { results } = E.compareOptions(household, scen, E.MARKET_BASIS);
E.sustainableWithdrawal(household, scen, E.MARKET_BASIS, { confidence: 0.9 });
E.historicalBacktest(option, household, E.MARKET_BASIS, { toAge: 95 });   // every start year since 1900
E.safeMaxByStartYear(household, E.MARKET_BASIS, { toAge: 95 });
E.inflationProtection(household, E.MARKET_BASIS);
E.giltAfterTax(E.SAMPLE_GILTS[0], 0.4);
```

## Equities and Commodities pages

Two more pages (`#equities`, `#commodities`, switched from the nav) look at the S&P 500,
Nasdaq-100, FTSE 100, Nikkei 225, KOSPI, Hang Seng, TAIEX and Nifty 50, and at gold, silver,
platinum, copper and Brent, all from a UK investor's seat (in pounds, optionally after UK
inflation): growth of £10,000, track record, rolling returns, drawdowns, AI exposure and an
AI stress test, valuations against later returns, published house forecasts, bootstrapped
10-year ranges, a mix builder, crash behaviour, correlations and the gold to silver ratio.
The tiles at the top of each page open a page per market (`#m-spx`, `#m-gold`, ...): price
history over any period, calendar-year returns, AI exposure and valuation (shares) or role and
records (commodities), crash record, drawdowns, a 10-year range and the house forecasts that apply.

| File | Source |
|---|---|
| `data/assets.json` | `npm run refresh:assets`: Yahoo Finance monthly closes (daily for futures), BoE month-end sterling rates, ONS CPI, Shiller's S&P 500 data, gold since 1833 |
| `data/markets-research.json` | Hand-entered with sources: valuations (Siblis, 30 Sep 2026), AI-name index weights, house forecasts, gold forecasts and central-bank buying. Refresh by hand. |

Engine: `src/markets.js` (`series`, `stats`, `rolling`, `beta`, `aiStress`, `projection`, `mix`, ...).
UI: `web/markets.html` and `web/markets.js`, injected by `scripts/build-web.js`.
Dividends: true total return for the S&P 500; elsewhere the index's typical yield is added.

## Keeping it live

- **Twice a day** (launchd `com.spridge.pension-planner`, 06:20 and 21:30): `scripts/daily.sh`
  fetches BoE/ONS and market data, runs `scripts/check-data.js` and the tests, publishes with
  `~/bin/ship`, then waits until the live site serves the new `docs/build.txt`. If anything fails, the
  last good version stays live and an ntfy alert is sent (and a "fixed" one when it recovers).
  A run that happens during Citrix work hours commits but holds the push until the next run.
- **Research figures roll forward daily.** Valuations (CAPE, P/E) are scaled by each index's price
  move since the reading, and AI-company weights by each company's price relative to its index
  (Yahoo closes on each `asOf` date, stored in `assets.json` `live`).
- **Monthly** (launchd `com.spridge.pension-planner.research`, 1st at 05:15): `scripts/research.sh`
  runs headless Claude with `scripts/research-prompt.md` to re-research
  `data/markets-research.json` from published sources. It may edit only that file and the result
  must pass `check-data.js research`, or last month's file is restored. Summary in `logs/`.
- **Backup**: `.github/workflows/backup-refresh.yml` checks the live build twice a day and, only if it
  is over 36 hours old, refreshes the market data on GitHub's servers and pushes.
- The page footer says when prices and research were last updated, and a banner appears if prices
  are over 3 days old or research over 75 days.

## Simplifications

- Tax: rUK only (no Scottish rates). Inheritance tax on pensions from April 2027 is not modelled; legacy figures are gross.
- Annual time steps; payments at the start of each year. The tax-free cash is taken up front and kept invested as a tax-free pot.
- RPI after 2030 assumes UKSA's alignment with CPIH (about 0.1% above CPI).
- Health multipliers on ONS rates are rough, so use real enhanced-annuity quotes where health matters.
- The "future equity returns vs history" setting is a plain shift of the historical returns, not a forecast.

## Data licences and attribution

- ONS life tables and CPI: Office for National Statistics, Open Government Licence v3.0.
- Bank of England yields and Bank Rate: Bank of England Statistical Interactive Database, reused with attribution.
- Macrohistory Database: Òscar Jordà, Moritz Schularick and Alan M. Taylor, "Macrofinancial History and the New Business Cycle Facts", NBER Macroeconomics Annual 2016, vol. 31 (macrohistory.net). Free to use with citation.
- Annuity calibration rates: Hargreaves Lansdown best-buy table, 22 October 2026, quoted for model calibration.

This project is information, not financial advice.
