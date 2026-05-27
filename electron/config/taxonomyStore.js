"use strict";
// 分面分类体系 — 加载 taxonomy.json 并提供编码/标签双向查询
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxonomyStore = void 0;
const fs = require("fs");
const path = require("path");
const DEFAULT_TAXONOMY = { version: '0.0.0', updated: '', description: '', facets: {} };
class TaxonomyStore {
    constructor() {
        this.data = DEFAULT_TAXONOMY;
        this.codeIndex = new Map();
        this.aliasIndex = new Map();
        this.load();
    }
    load() {
        try {
            const seedPath = path.join(__dirname, '..', 'config', 'taxonomy.json');
            const appData = process.env.APPDATA || path.join(process.env.HOME || '.', 'AppData', 'Roaming');
            const userPath = path.join(appData, 'dbghf', 'taxonomy.json');
            let raw = null;
            if (fs.existsSync(userPath))
                raw = fs.readFileSync(userPath, 'utf-8');
            else if (fs.existsSync(seedPath))
                raw = fs.readFileSync(seedPath, 'utf-8');
            if (raw) {
                this.data = JSON.parse(raw);
                this.buildIndex();
                console.log('[taxonomyStore] 加载完成, version:', this.data.version, ', facets:', Object.keys(this.data.facets).length);
            }
        }
        catch (e) {
            console.error('[taxonomyStore] 加载失败:', e);
        }
    }
    buildIndex() {
        this.codeIndex.clear();
        this.aliasIndex.clear();
        for (const [, facet] of Object.entries(this.data.facets)) {
            for (const v of facet.values) {
                this.codeIndex.set(v.code, v);
                for (const alias of v.aliases) {
                    this.aliasIndex.set(alias.toLowerCase(), v.code);
                }
                this.aliasIndex.set(v.label.toLowerCase(), v.code);
            }
        }
    }
    getVersion() { return this.data.version; }
    getFacets() { return this.data.facets; }
    getFacet(name) { return this.data.facets[name]; }
    getFacetNames() { return Object.keys(this.data.facets); }
    getLabel(code) { return this.codeIndex.get(code)?.label || code; }
    getLabels(codes) { return codes.map(c => this.getLabel(c)); }
    resolveAlias(alias) { return this.aliasIndex.get(alias.toLowerCase()); }
    getValues(facetName) { return this.data.facets[facetName]?.values || []; }
    expand(facets) {
        const parts = [];
        for (const [name, codes] of Object.entries(facets)) {
            if (!codes || codes.length === 0)
                continue;
            const facet = this.data.facets[name];
            if (!facet)
                continue;
            const arr = Array.isArray(codes) ? codes : [codes];
            const labels = arr.map(c => this.getLabel(c)).filter(Boolean);
            if (labels.length > 0) {
                parts.push(`${facet.label}:${labels.join(',')}`);
            }
        }
        return parts.join(' ');
    }
    resolve(facets) {
        const result = {};
        if (!facets)
            return result;
        for (const [name, def] of Object.entries(this.data.facets)) {
            const codes = facets[name];
            if (!codes)
                continue;
            const arr = Array.isArray(codes) ? codes : [codes];
            if (arr.length === 0 || (arr.length === 1 && (arr[0] === 'L000' || arr[0] === 'Q000' || arr[0] === 'P000' || arr[0] === 'K000' || arr[0] === 'D000' || arr[0] === 'R000')))
                continue;
            const values = arr.filter(c => c !== '000' && !c.endsWith('000')).map(c => ({ code: c, label: this.getLabel(c) }));
            if (values.length > 0) {
                result[name] = { label: def.label, values };
            }
        }
        return result;
    }
}
exports.taxonomyStore = new TaxonomyStore();
