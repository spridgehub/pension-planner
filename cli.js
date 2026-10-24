#!/usr/bin/env node
// Usage: node cli.js [household.json]
import { readFileSync } from 'node:fs';
import * as E from './src/index.js';

const household = process.argv[2] ? JSON.parse(readFileSync(process.argv[2])) : {
  person: { age: 65, sex: 'male', health: 'average' },
  partner: { age: 62, sex: 'female', health: 'average' },
  pensionPot: 400000, otherSavings: 20000, tfcPct: 0.25, essentialSpending: 26000,
};
const basis = E.MARKET_BASIS;
const gbp = (v) => (v == null ? '-' : '£' + Math.round(v).toLocaleString('en-GB'));
const pc = (v) => (v * 100).toFixed(1) + '%';

console.log('Longevity (ONS 2022-based):');
for (const p of [household.person, household.partner].filter(Boolean)) {
  const l = E.longevitySummary(p);
  console.log(`  ${p.sex} ${p.age}: life expectancy ${l.lifeExpectancy.toFixed(1)}, 1 in 4 reach ${l.oneInFour.toFixed(0)}, 1 in 10 reach ${l.oneInTen.toFixed(0)}`);
}
const scen = E.bootstrapScenarios({ n: 2000, horizon: 55 });
const cmp = E.compareOptions(household, scen, basis);
console.log(`\nOptions (${cmp.paths} paths; real net household income in today's money)`);
console.log('option'.padEnd(78), 'yr1 likely', 'age85 prudent/likely/upside'.padStart(30), 'short%(pre/post SPA)', 'legacy likely');
for (const r of cmp.results) {
  const a85 = r.byYear.find((y) => y.age === 85);
  console.log(`${r.name.slice(0, 77).padEnd(78)} ${gbp(r.firstYearIncome.likely).padStart(9)} ${[a85?.income.prudent, a85?.income.likely, a85?.income.upside].map(gbp).join(' / ').padStart(30)} ${(pc(r.pShortfall)+'/'+pc(r.pShortfallAfterStatePension)).padStart(20)} ${gbp(r.legacy.likely).padStart(10)}`);
}
console.log('\nSustainable starting withdrawal (fixed real, 60/40, money lasts while either alive):');
const paths = E.buildPaths(household, scen);
for (const c of [0.95, 0.9, 0.75, 0.5]) {
  const s = E.sustainableWithdrawal(household, scen, basis, { confidence: c, paths });
  console.log(`  ${pc(c)} confidence: ${pc(s.rate)} = ${gbp(s.firstYear)} a year`);
}
const bt = E.historicalBacktest({ id: 'dd4', drawdown: { strategy: 'fixedReal', rate: 0.04, mix: { equity: 0.6, bonds: 0.4 }, fee: 0.006 } }, household, basis, { toAge: 95 });
const failed = bt.filter((b) => b.depletedAge !== null);
console.log(`\nBacktest 4% rule to 95, ${bt.length} start years ${bt[0].startYear}-${bt[bt.length - 1].startYear}: ran out in ${failed.length} (${failed.map((b) => `${b.startYear}@${b.depletedAge}`).join(', ')})`);
