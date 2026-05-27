export interface ResourceItem {
    id: string;
    name: string;
    type: string;
    category: string;
    subcategory?: string;
    tech_stack: string[];
    style_tags: string[];
    use_cases: string[];
    score: number;
    rating_count: number;
    usage_count: number;
    source_url: string;
    summary: string;
    summary_en?: string;
    file: string;
    repo: string;
    rawYaml?: Record<string, any>;
    body?: string;
    facets?: Record<string, any>;
}
export interface QueryParams {
    query: string;
    repo?: string | 'all';
    type?: string;
    category?: string;
    techStack?: string[];
    maxResults?: number;
    minScore?: number;
}
declare class ResourceStore {
    private initialized;
    private manifests;
    private aiManifests;
    private aiIndexes;
    private resourceDir;
    private _lastLoadTime;
    private _localChangesCache;
    private _changesCacheTTL;
    constructor();
    /** 检查资源目录是否存在且已初始化 */
    isInitialized(): boolean;
    /** 自动同步所有已克隆仓库到最新，然后重载 manifest */
    autoSyncAll(): Promise<{
        synced: string[];
        message: string;
    }>;
    /** 确保 manifest 已加载到内存 */
    ensureManifestsLoaded(): Promise<void>;
    /** 加载所有仓库的 manifest 索引到内存 */
    loadManifests(): Promise<boolean>;
    /** 获取本地资源目录路径 */
    getResourceDir(): string;
    /** 核心检索接口 */
    queryResources(params: QueryParams): ResourceItem[];
    /** 计算关键词匹配度 */
    private calcRelevance;
    /** 按筛选条件过滤 */
    filterResources(filters: {
        repo?: string;
        type?: string;
        category?: string;
        techStack?: string[];
        minScore?: number;
    }): ResourceItem[];
    /** 获取单个资源详情（含正文） */
    getResourceDetail(id: string): Promise<ResourceItem | null>;
    /** 获取全部资源摘要列表 */
    getAllResources(repo?: string): ResourceItem[];
    /** 用户添加资源 */
    addResource(resource: Omit<ResourceItem, 'file'> & {
        content: string;
        facets?: Record<string, any>;
    }, repo: string): Promise<{
        success: boolean;
        path?: string;
    }>;
    private git;
    private gitSilent;
    /** 检查仓库是否是 git 仓库 */
    isGitRepo(repo: string): Promise<boolean>;
    /** 获取仓库综合状态 */
    getRepoStatus(repo: string): Promise<{
        exists: boolean;
        isGit: boolean;
        branch: string;
        remote: string;
        behind: number;
        ahead: number;
        changes: Array<{
            path: string;
            status: string;
        }>;
        lastCommit: {
            hash: string;
            message: string;
            date: string;
        } | null;
    }>;
    /** 同步拉取 */
    syncRepo(repo: string): Promise<{
        success: boolean;
        message: string;
        pulled: number;
    }>;
    /** 检查是否有远程更新 */
    checkForUpdates(repo: string): Promise<{
        success: boolean;
        hasUpdates: boolean;
        behind: number;
        message: string;
    }>;
    /** 强制拉取最新代码 */
    forcePullOrAbort(repo: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /** 获取本地变更文件列表 */
    getLocalChanges(repo: string): Promise<Array<{
        path: string;
        status: string;
    }>>;
    /** 分类变更文件：仅新增(??/A/AM) vs 被阻止(M/D/R等) */
    getNewFilesOnly(repo: string): Promise<{
        newFiles: Array<{
            path: string;
            status: string;
        }>;
        blockedFiles: Array<{
            path: string;
            status: string;
        }>;
    }>;
    /** 校验单个资源文件的 YAML frontmatter — 从仓库配置读取必填字段和有效类型 */
    validateNewFileYaml(repo: string, filePath: string): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    /** 基础 YAML 校验：仅检查变更 .md 文件的必填字段，不阻止修改/删除 */
    validateCommitYaml(repo: string): Promise<{
        valid: boolean;
        errors: string[];
        filesToCommit: Array<{
            path: string;
            status: string;
        }>;
    }>;
    /** 提交范围验证：仅新增文件 + YAML 必填字段 */
    validateCommitScope(repo: string): Promise<{
        valid: boolean;
        errors: string[];
        newFiles: Array<{
            path: string;
            status: string;
        }>;
        blockedFiles: Array<{
            path: string;
            status: string;
        }>;
    }>;
    /** 创建贡献分支 */
    createContributionBranch(repo: string, branchName: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /** 全部提交：git add --all + commit（不做范围限制） */
    commitAll(repo: string, message: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /** 提交变更 */
    commitChanges(repo: string, message: string, files?: string[]): Promise<{
        success: boolean;
        message: string;
    }>;
    /** 推送分支 */
    pushBranch(repo: string, branchName: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /** 安全推送：遇到 non-fast-forward 拒绝则 pull --rebase 后重试一次 */
    safePushBranch(repo: string, branchName: string): Promise<{
        success: boolean;
        message: string;
        retried: boolean;
    }>;
    /** 检查 gh CLI 是否可用 */
    isGhAvailable(): Promise<boolean>;
    /** 检查 gh CLI 是否已登录 GitHub */
    isGitHubAuthenticated(): Promise<boolean>;
    /** 创建 Pull Request */
    createPullRequest(repo: string, branchName: string, title: string, body: string): Promise<{
        success: boolean;
        message: string;
        url?: string;
    }>;
    /** 克隆仓库到本地 */
    cloneRepo(repo: string, remoteUrl?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /** 检查 git 是否可用 */
    isGitAvailable(): Promise<boolean>;
    /** 更新资源评分 */
    rateResource(id: string, score: number): Promise<void>;
    /** 获取评分排行榜 */
    getLeaderboard(category?: string, limit?: number): ResourceItem[];
    private matchesFilters;
    private toResourceItem;
}
export declare const resourceStore: ResourceStore;
export {};
