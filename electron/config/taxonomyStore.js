"use strict";
// 分面分类体系 — 加载 taxonomy.json 并提供编码/标签双向查询
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxonomyStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DEFAULT_TAXONOMY = {
    version: '0.0.0',
    updated: '',
    description: '',
    facets: {},
};
class TaxonomyStore {
    constructor() {
        this.data = DEFAULT_TAXONOMY;
        this.codeIndex = new Map();
        this.aliasIndex = new Map();
        this.load();
    }
    load() {
        try {
            // 优先读项目自带的种子文件
            const seedPath = path.join(__dirname, '..', 'config', 'taxonomy.json');
            // 也检查 APPDATA 是否有更新版本
            const appData = process.env.APPDATA || path.join(process.env.HOME || '.', 'AppData', 'Roaming');
            const userPath = path.join(appData, 'dbghf', 'taxonomy.json');
            let raw = null;
            if (fs.existsSync(userPath)) {
                raw = fs.readFileSync(userPath, 'utf-8');
            }
            else if (fs.existsSync(seedPath)) {
                raw = fs.readFileSync(seedPath, 'utf-8');
            }
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
    /** 编码 → 标签 */
    getLabel(code) {
        return this.codeIndex.get(code)?.label || code;
    }
    /** 批量编码 → 标签 */
    getLabels(codes) {
        return codes.map(c => this.getLabel(c));
    }
    /** 别名 → 编码 */
    resolveAlias(alias) {
        return this.aliasIndex.get(alias.toLowerCase());
    }
    /** 获取某个维度的所有可选值 */
    getValues(facetName) {
        return this.data.facets[facetName]?.values || [];
    }
    /** 将编码展开为可读文本（用于向量搜索/展示） */
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
    /** 获取某个维度下指定编码的子节点 */
    getChildren(facetName, parentCode) {
        const facet = this.data.facets[facetName];
        if (!facet)
            return [];
        return facet.values.filter(v => v.parents.includes(parentCode));
    }
    /** 获取某个维度的根节点（无 parents 或 parents 为空） */
    getRoots(facetName) {
        const facet = this.data.facets[facetName];
        if (!facet)
            return [];
        return facet.values.filter(v => !v.parents || v.parents.length === 0);
    }
    /** 将 facets 编码转换为标签展示结构 */
    resolve(facets) {
        const result = {};
        if (!facets)
            return result;
        for (const [name, def] of Object.entries(this.data.facets)) {
            const codes = facets[name];
            if (!codes)
                continue;
            const arr = Array.isArray(codes) ? codes : [codes];
            if (arr.length === 0)
                continue;
            const isGeneric = (c) => c === 'S000' || c === 'T000' || c === 'K000' || c === 'O000' || c === 'F000' || c === 'L000';
            if (arr.length === 1 && isGeneric(arr[0]))
                continue;
            const values = arr.filter(c => !c.endsWith('000')).map(c => ({ code: c, label: this.getLabel(c) }));
            if (values.length > 0) {
                result[name] = { label: def.label, values };
            }
        }
        return result;
    }
}
exports.taxonomyStore = new TaxonomyStore();
