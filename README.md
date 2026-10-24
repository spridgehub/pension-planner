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
npm run build:web        # -> dist/pension-planner.html (bundles engine + data with esbuild)
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
