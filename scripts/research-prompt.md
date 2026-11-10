You are refreshing the hand-researched figures behind the Pension Planner's Equities and Commodities
pages. Today is {{TODAY}}. Work in this repository and edit ONLY `data/markets-research.json`.
Do not touch any other file, do not run git, do not publish anything.

Read `data/markets-research.json` first. Keep its exact structure and keys (see its "schema" field).
Then use web search and fetch to update every figure to the most recent published value you can
verify, and update each figure's `asOf` (YYYY-MM-DD, the date the source's number refers to) and `src`
(the URL you used). Rules:

1. Never invent a number. If you cannot find a newer figure from a source you could open, leave the
   existing value, date and source exactly as they are.
2. valuation: CAPE, trailing P/E, forward P/E for each market. Prefer Siblis Research
   (siblisresearch.com) for every market on the same date so markets compare like for like; keep the
   note in "basis"/"alt" fields current. Dividend yields as fractions (0.031 = 3.1%).
3. aiConcentration: the weight of the named AI-linked companies in each index, from fund holdings
   (e.g. stockanalysis.com SPY and QQQ holdings pages, iShares/SSGA holdings files), index provider
   factsheets or reputable news. Give per-company weights in `constituents` with Yahoo Finance tickers
   (AAPL, NVDA, MSFT, GOOGL, AMZN, AVGO, META, TSLA; 6857.T, 8035.T, 9984.T; 005930.KS, 000660.KS;
   2330.TW; 0700.HK, 9988.HK, 1810.HK) and set `weight` to their sum. Use the date the holdings refer
   to as `asOf`. For KOSPI, give Samsung Electronics and SK Hynix separately if a source splits them.
   Capped ETF weights (e.g. EWY, EWT) are not index weights; do not use them.
4. forecasts: latest long-term capital market assumptions (J.P. Morgan LTCMA, Vanguard, Schroders,
   Research Affiliates, GMO, BlackRock if extractable). Annual returns as fractions; keep "basis"
   (currency, nominal or real) accurate.
5. commodities: gold and silver record highs (price and date), latest World Gold Council central-bank
   buying (update the "text" sentence), and current bank gold price forecasts: each entry has house,
   view (plain words incl. target date), numeric "mid" in $, asOf (YYYY-MM-DD it was reported) and src.
   Replace an entry only with a newer view from the same or another major bank; keep 4 to 6 entries.
6. aiContext: refresh the hyperscaler capex sentence and keep 2 to 3 recent official warnings
   (IMF, Bank of England, others) with dates and sources.
7. User-facing text: plain English, no en or em dashes (write "x to y" for ranges).
8. Set "retrieved" to {{TODAY}}.

When finished, check the file is valid JSON (read it back) and reply with a short list of what
changed and anything you could not verify.
