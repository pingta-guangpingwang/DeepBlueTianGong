const en = {
  app: {
    title: 'DeepBlue TianGong · Knowledge Collection Engine',
  },
  tabs: {
    collector: 'Collect',
    workshop: 'Workshop',
    pending: 'Review',
    config: 'Config',
  },
  collector: {
    title: 'Data Sources',
    empty: 'No data source configured',
    emptyHint: 'Add data sources and target repos in the Config tab',
    status: 'Status',
    idle: 'Ready, waiting for collection task',
    running: 'Collection in progress...',
  },
  workshop: {
    allRepos: 'All Repos',
    search: 'Search resources...',
    syncing: 'Fetching latest data from GitHub...',
    sync: 'Sync',
    commit: 'Commit',
    empty: 'No resource data',
    emptyHint: 'Sync repos or add collection sources to get started',
  },
  pending: {
    title: 'Pending Review',
    empty: 'No pending items',
    emptyHint: 'Collected or manually added resources appear here',
    auditAll: 'Audit All',
    approveAll: 'Approve All',
    approve: 'Approve',
    delete: 'Delete',
  },
  config: {
    repos: 'Repo Config',
    reposEmpty: 'No repo config',
    reposHint: 'Repo config is loaded from repos.json',
    sources: 'Source Config',
    sourcesEmpty: 'No source config',
    sourcesHint: 'Source config is loaded from sources.json',
  },
}

export default en
