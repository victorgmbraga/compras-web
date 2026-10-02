import data from './business-data.json' with { type: 'json' };
import folding from './casefold.json' with { type: 'json' };
import { columnMap, categorizePresets } from './schema.js';
import { compareDecimal, validDate } from './validation.js';
import { assert, fail } from './errors.js';
import { scalarText, itemSituation } from './adapter.js';

export const casefold = value => [...value].map(c => folding[c] ?? c.toLowerCase()).join('');
const normalize = value => value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'');
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const word = '\\p{L}\\p{N}_';
const boundary = `(?:(?<=[${word}])(?![${word}])|(?<![${word}])(?=[${word}]))`;
const categoryPatterns = Object.entries(data.categories).map(([name,terms])=>[name,new RegExp(`${boundary}(?:${terms.map(t=>escaped(normalize(t))).join('|')})${boundary}`,'u')]);
export function categorize(value) {
  if (value === null) return '';
  const text = normalize(value);
  return categoryPatterns.filter(([,pattern])=>pattern.test(text)).map(([name])=>name).sort().join(', ');
}
export function compileRegex(pattern) {
  assert(!/\(\?[a-zA-Z-]|\(\?P|\(\?<|\\[1-9]|\\[gkN]|\\[pP]\{|\\[AZz]|[İı]/u.test(pattern), 'UNSUPPORTED_REGEX', 'Construção Python/Unicode não suportada por este subconjunto de regex.');
  let translated = '', inClass = false;
  for (let i=0;i<pattern.length;i++) {
    const c = pattern[i];
    if (c === '\\') {
      const next = pattern[++i];
      if (['b','B'].includes(next)) {
        assert(!inClass,'UNSUPPORTED_REGEX','Fronteiras dentro de classes não são suportadas.');
        const boundary = `(?:(?<=[${word}])(?![${word}])|(?<![${word}])(?=[${word}]))`;
        const inverse = `(?:(?<=[${word}])(?=[${word}])|(?<![${word}])(?![${word}]))`;
        translated += next === 'b' ? boundary : inverse;
      } else if (next === 'w') translated += inClass ? word : `[${word}]`;
      else if (next === 'W') { assert(!inClass,'UNSUPPORTED_REGEX','\\W dentro de classe não suportado.'); translated += `[^${word}]`; }
      else if (next === 'd') translated += inClass ? '\\p{Nd}' : '\\p{Nd}';
      else if (next === 'D') { assert(!inClass,'UNSUPPORTED_REGEX','\\D dentro de classe não suportado.'); translated += '\\P{Nd}'; }
      else translated += '\\' + (next ?? '');
    } else { if(c==='[')inClass=true; if(c===']')inClass=false; translated += c; }
  }
  try { return new RegExp(translated,'iu'); } catch { fail('INVALID_REGEX','Expressão regular inválida.'); }
}
function predicate(rule) {
  const regex = rule.type === 'regex' ? compileRegex(rule.value) : null;
  const target = casefold(rule.value);
  return doc => {
    const raw = doc[rule.field];
    if (rule.type === 'empty') return raw === null || raw === '';
    if (rule.type === 'not_empty') return raw !== null && raw !== '';
    if (raw === null) return ['not_like','!='].includes(rule.type);
    if (regex) return regex.test(raw);
    const value = casefold(raw);
    return { like:()=>value.includes(target), not_like:()=>!value.includes(target), '=':()=>value===target, '!=':()=>value!==target, starts:()=>value.startsWith(target), ends:()=>value.endsWith(target) }[rule.type]();
  };
}
export function documentPresetState(doc, preset) {
  if (['all','personalizado'].includes(preset)) return 'match';
  const raw = doc._raw;
  let unknown = false;
  const exact = (actual, expected) => { if(actual===null || actual===undefined || actual==='') unknown = true; else if(!expected.includes(String(actual))) return false; return true; };
  if(raw.situacao_id!==null && raw.situacao_id!==undefined && raw.situacao_id!=='') {
    if(!exact(raw.situacao_id,['1']))return 'no_match';
  } else if(doc.situacao_compra_nome_pncp===null || doc.situacao_compra_nome_pncp==='')unknown=true;
  else if(!['Divulgada no PNCP','Divulgada'].includes(doc.situacao_compra_nome_pncp))return 'no_match';
  if (['desenvolvimento','infraestrutura'].includes(preset)) {
    if (!exact(doc.orgao_entidade_esfera_id,['F'])) return 'no_match';
    const modality = raw.modalidade_licitacao_id;
    if (modality == null) { if(doc.modalidade_nome==null)unknown=true; else if(!['Pregão - Eletrônico','Pregão Eletrônico'].includes(doc.modalidade_nome))return 'no_match'; }
    else if (!exact(modality,['6'])) return 'no_match';
  }
  const patterns = data.presets[preset].AND.objeto_compra;
  if (patterns) {
    if (doc.objeto_compra === null) unknown = true;
    else if(!patterns.some(p=>compileRegex(p).test(doc.objeto_compra))) return 'no_match';
  }
  return unknown ? 'unknown' : 'match';
}
export function itemPresetState(items, preset, catalogId) {
  if (['all','personalizado'].includes(preset)) return { state:'match', matching:[] };
  const codes = data.presets[preset].AND.cod_item_catalogo?.map(c=>c.replace(/^(\d+)\.0$/,'$1'));
  let unknown = false; const matching = [];
  for (const item of items) {
    const service = scalarText(item.materialOuServico), situation = itemSituation(item);
    const code = scalarText(item.catalogoCodigoItem), catalog = scalarText(item.catalogo?.id);
    if (service !== null && service !== '' && service !== 'S' || situation !== null && situation !== '' && !['1','2'].includes(situation)) continue;
    if (codes && (code !== null && code !== '' && !codes.includes(code) || catalog !== null && catalog !== '' && catalog !== catalogId)) continue;
    if (!service || !situation || codes && (!code || !catalog)) { unknown = true; continue; }
    matching.push(scalarText(item.numeroItem));
  }
  return { state: matching.length ? 'match' : unknown ? 'unknown' : 'no_match', matching };
}
function compareDate(a,b) {
  const parts=value=>{
    const m=value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?)?$/);
    assert(m && validDate(m[1]) && Number(m[2] || 0)<24 && Number(m[3] || 0)<60 && Number(m[4] || 0)<60,'INVALID_SOURCE_DATE','Data da fonte não pode ser ordenada.',502);
    // Compare whole seconds separately from the exact fractional string.
    // Z is a common reference for two naive dates, not an assigned source zone.
    const seconds=Date.parse(`${m[1]}T${m[2] || '00'}:${m[3] || '00'}:${m[4] || '00'}${m[6] || 'Z'}`);
    assert(Number.isFinite(seconds),'INVALID_SOURCE_DATE','Data da fonte não pode ser ordenada.',502);
    return {seconds,fraction:'0.'+(m[5] || '0'),zone:!!m[6]};
  };
  const x=parts(a),y=parts(b);
  assert(x.zone===y.zone,'INCOMPARABLE_DATES','Não é possível ordenar datas com e sem fuso sem uma convenção explícita.',422);
  return Math.sign(x.seconds-y.seconds) || compareDecimal(x.fraction,y.fraction);
}
export function applyRules(documents, query) {
  const categorizeRows = categorizePresets.includes(query.preset) || [...query.filters,...query.header_filters].some(r=>r.field==='categorizacao') || query.sorters.some(r=>r.field==='categorizacao');
  const rules=query.filters.map(predicate), headers=query.header_filters.map(predicate);
  let docs = documents.map(doc=>({...doc,categorizacao:categorizeRows ? categorize(doc.objeto_compra) : ''})).filter(doc=>(!rules.length || (query.filter_join==='and' ? rules.every(fn=>fn(doc)) : rules.some(fn=>fn(doc)))) && headers.every(fn=>fn(doc)));
  const matched = docs.length;
  if (query.deduplicate==='objeto_exato') {
    const objects=new Set(); docs=docs.filter(doc=>{if(objects.has(doc.objeto_compra))return false;objects.add(doc.objeto_compra);return true;});
  }
  if(query.sorters.length)docs.sort((a,b)=>{
    for(const {field,dir} of query.sorters) {
      let x=a[field], y=b[field];
      if(x===null || y===null){if(x===y)continue;return x===null?1:-1;}
      const type=columnMap[field].type;
      const c=type==='decimal'?compareDecimal(x,y):type==='date'?compareDate(x,y):type==='boolean'?Number(x)-Number(y):((x=casefold(x)),(y=casefold(y)),x<y?-1:x>y?1:0);
      if(c)return (dir==='desc'?-1:1)*c;
    }
    return 0;
  });
  return {documents:docs,matched_documents:matched};
}
