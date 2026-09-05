import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDevelopmentCaptureFixture,
  PUBLIC_FIXTURE,
  LONG_PRINTABLE_FIXTURE,
  type DevelopmentCaptureFixture,
} from '@postkeeper/test-fixtures';
import {
  openLibrary,
  type ArticleListItem,
  type Category,
  type Library,
  type LibraryView,
  type ReaderContent,
  type StorageStatus,
} from '@postkeeper/local-store';
import { Reader } from './Reader';
import { SyncPanel } from './SyncPanel';
import { listenForExtensionTransfer } from './extensionTransfer';
import { ArticleSharing } from './ArticleSharing';
import { BackupPanel } from './BackupPanel';
import { LOCAL_SYNC_DIAGNOSTICS } from './diagnostics';
import { SharedLinks } from './SharedLinks';
import { CaptureActions } from './CaptureActions';
import { Icon, type IconName } from './ui/Icon';
import { Sheet } from './ui/Sheet';
import { t, formatBytes, formatDate } from './i18n';
import { About } from './About';

const NAV_VIEWS: Array<{
  id: Exclude<LibraryView, { categoryId: string }>;
  label: string;
  icon: IconName;
}> = [
  { id: 'inbox', label: t('nav.inbox'), icon: 'inbox' },
  { id: 'all', label: t('nav.all'), icon: 'library' },
  { id: 'unread', label: t('nav.unread'), icon: 'unread' },
  { id: 'favorites', label: t('nav.favorites'), icon: 'star' },
  { id: 'archive', label: t('nav.archive'), icon: 'archive' },
];

function viewLabel(view: LibraryView, categories: readonly Category[]): string {
  if (typeof view === 'string') {
    return NAV_VIEWS.find((item) => item.id === view)?.label ?? view;
  }
  return (
    categories.find((category) => category.id === view.categoryId)?.name ?? t('library.category')
  );
}

export function LibraryApp() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [syncDiagnostics, setSyncDiagnostics] = useState(LOCAL_SYNC_DIAGNOSTICS);
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView>('inbox');
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const [selected, setSelected] = useState<ArticleListItem | null>(null);
  const [reader, setReader] = useState<ReaderContent | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [rebuildCount, setRebuildCount] = useState<number | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const refreshSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let openedLibrary: Library | null = null;
    void (async () => {
      try {
        const opened = await openLibrary();
        openedLibrary = opened;
        if (cancelled) {
          await opened.close();
          return;
        }
        setLibrary(opened);
        setStorage(await opened.getStorageStatus());
        void opened
          .requestPersistence()
          .then(async () => {
            if (!cancelled) setStorage(await opened.getStorageStatus());
          })
          .catch(() => undefined); // Persistence is optional; the library remains usable.
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
      void openedLibrary?.close();
    };
  }, []);

  const refresh = useCallback(async (open: Library, nextView: LibraryView, nextQuery: string) => {
    const request = ++refreshSequence.current;
    const [nextCategories, nextArticles, nextStorage, libraryItems, archivedItems] =
      await Promise.all([
        open.listCategories(),
        nextQuery.trim() ? open.search(nextQuery) : open.listArticles(nextView),
        open.getStorageStatus(),
        open.listArticles('all'),
        open.listArticles('archive'),
      ]);
    if (request !== refreshSequence.current) return;
    setCategories(nextCategories);
    setArticles(nextArticles);
    setStorage(nextStorage);
    setSearching(Boolean(nextQuery.trim()));
    setSelected(
      [...libraryItems, ...archivedItems, ...nextArticles].find(
        (article) => article.id === selectedIdRef.current,
      ) ?? null,
    );
  }, []);

  const onSharedSaved = useCallback(
    async (article: ArticleListItem | { id: ArticleListItem['id'] }) => {
      if (!library) return;
      setView('inbox');
      setQuery('');
      setSelectedId(article.id);
      selectedIdRef.current = article.id;
      await refresh(library, 'inbox', '');
      setReading(true);
      setAddOpen(false);
    },
    [library, refresh],
  );

  useEffect(() => {
    if (!library) return;
    return listenForExtensionTransfer(
      library,
      async (article) => {
        setView('inbox');
        setQuery('');
        setSelectedId(article.id);
        selectedIdRef.current = article.id;
        await refresh(library, 'inbox', '');
        setReading(true);
      },
      setTransferStatus,
    );
  }, [library, refresh]);

  useEffect(() => {
    if (!library) return;
    void refresh(library, view, query).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [library, query, refresh, view]);

  useEffect(() => {
    setReader(null);
    if (!library || !selectedId) {
      return;
    }
    let cancelled = false;
    void library.getReader(selectedId as ArticleListItem['id']).then(
      (content) => {
        if (!cancelled) setReader(content);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [library, selectedId, selected?.currentSnapshotId]);

  useEffect(() => {
    if (typeof view === 'object') {
      const category = categories.find((item) => item.id === view.categoryId);
      setRenameValue(category?.name ?? '');
    }
  }, [categories, view]);

  async function importFixture() {
    if (!library) return;
    const article = await library.importTrustedFixture(PUBLIC_FIXTURE);
    setQuery('');
    setSelectedId(article.id);
    selectedIdRef.current = article.id;
    await refresh(library, view, '');
    setSettingsOpen(false);
    setReading(true);
  }

  async function importCaptureFixture(key: DevelopmentCaptureFixture) {
    if (!library) return;
    const article = await library.importCapturePackage(await createDevelopmentCaptureFixture(key));
    setQuery('');
    setSelectedId(article.id);
    selectedIdRef.current = article.id;
    await refresh(library, view, '');
    setSettingsOpen(false);
    setReading(true);
  }

  async function createCategory() {
    if (!library) return;
    await library.createCategory(newCategory);
    setNewCategory('');
    await refresh(library, view, query);
    setCategoriesOpen(false);
  }

  async function renameSelectedCategory() {
    if (!library || typeof view !== 'object' || !renameValue.trim()) return;
    await library.renameCategory(view.categoryId, renameValue);
    await refresh(library, view, query);
  }

  async function moveCategory(direction: -1 | 1) {
    if (!library || typeof view !== 'object') return;
    const ids = categories.map((category) => category.id);
    const index = ids.indexOf(view.categoryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    await library.reorderCategories(next);
    await refresh(library, view, query);
  }

  async function deleteSelectedCategory() {
    if (!library || typeof view !== 'object') return;
    await library.deleteCategory(view.categoryId);
    setView('inbox');
    await refresh(library, 'inbox', query);
  }

  async function toggleMembership(categoryId: Category['id'], member: boolean) {
    if (!library || !selectedId) return;
    await library.setMembership(selectedId as ArticleListItem['id'], categoryId, member);
    await refresh(library, view, query);
  }

  async function patchSelected(
    patch: Partial<Pick<ArticleListItem, 'isRead' | 'isFavorite' | 'isArchived'>>,
  ) {
    if (!library || !selectedId) return;
    await library.updateArticle(selectedId as ArticleListItem['id'], patch);
    await refresh(library, view, query);
  }

  async function rebuild() {
    if (!library) return;
    setRebuildCount(await library.rebuildSearchIndex());
    await refresh(library, view, query);
  }

  function navigate(next: LibraryView) {
    setView(next);
    setQuery('');
    setSearching(false);
    setReading(false);
    setCategoriesOpen(false);
  }

  function backToList() {
    setReading(false);
    requestAnimationFrame(() => document.getElementById('article-' + selectedId)?.focus());
  }

  const categoryButtons = categories.map((category) => (
    <button
      type="button"
      key={category.id}
      className={
        typeof view === 'object' && view.categoryId === category.id ? 'nav-item active' : 'nav-item'
      }
      aria-current={
        typeof view === 'object' && view.categoryId === category.id ? 'page' : undefined
      }
      onClick={() => navigate({ categoryId: category.id })}
    >
      <Icon name="folder" />
      <span dir="auto">{category.name}</span>
    </button>
  ));

  if (error || !library)
    return (
      <main className="startup">
        <Icon name="bookmark" />
        <h1>{t('app.name')}</h1>
        <p role={error ? 'alert' : 'status'}>{error ?? t('library.opening')}</p>
      </main>
    );

  const readerMatchesSelection =
    selected &&
    reader &&
    reader.article.id === selected.id &&
    reader.snapshot.id === selected.currentSnapshotId;

  return (
    <div
      className={reading && readerMatchesSelection ? 'library-shell is-reading' : 'library-shell'}
    >
      <header className="library-header">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="bookmark" />
          </span>
          <h1>{t('app.name')}</h1>
        </div>
        <div className="header-actions">
          <button
            className={'sync-indicator phase-' + syncDiagnostics.phase}
            onClick={() => setSettingsOpen(true)}
            aria-label={t('settings.sync')}
          >
            <Icon name="cloud" />
            <span>{t(`sync.phase.${syncDiagnostics.phase}`)}</span>
          </button>
          <button className="primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" />
            <span>{t('common.add')}</span>
          </button>
          <button
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('common.settings')}
            title={t('common.settings')}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
      {transferStatus && (
        <p className="transfer-status" role="status" data-testid="extension-transfer-status">
          {transferStatus}
        </p>
      )}
      <SharedLinks
        library={library}
        onSaved={onSharedSaved}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
      <div className="library-layout">
        <nav className="library-nav" aria-label={t('nav.views')}>
          <div className="view-links">
            {NAV_VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={view === item.id ? 'nav-item active' : 'nav-item'}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => navigate(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="desktop-categories">
            <div className="section-label">
              <h2>{t('nav.categories')}</h2>
              <button
                className="icon-button"
                aria-label={t('category.manage')}
                onClick={() => setCategoriesOpen(true)}
              >
                <Icon name="plus" />
              </button>
            </div>
            {categoryButtons}
          </div>
          <p className="nav-caption">{t('app.tagline')}</p>
        </nav>
        <section className="library-list" aria-labelledby="list-heading">
          <div className="list-toolbar">
            <div>
              <p className="eyebrow">{t('library.items', { count: articles.length })}</p>
              <h2 id="list-heading" dir="auto">
                {searching ? t('library.searchResults') : viewLabel(view, categories)}
              </h2>
            </div>
            <button
              className="icon-button mobile-categories"
              onClick={() => setCategoriesOpen(true)}
              aria-label={t('category.manage')}
            >
              <Icon name="folder" />
            </button>
          </div>
          <form className="search-form" role="search" onSubmit={(event) => event.preventDefault()}>
            <Icon name="search" />
            <input
              type="search"
              role="searchbox"
              name="library-search"
              data-testid="library-search"
              aria-label={t('library.search')}
              placeholder={t('library.searchHint')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
          <ul className="article-list" data-testid="article-list">
            {articles.map((article) => (
              <li key={article.id}>
                <button
                  id={'article-' + article.id}
                  type="button"
                  className={article.id === selectedId ? 'article-link active' : 'article-link'}
                  onClick={() => {
                    selectedIdRef.current = article.id;
                    setSelectedId(article.id);
                    setSelected(article);
                    setReading(true);
                  }}
                >
                  <span className="article-source">
                    <span dir="auto">
                      {article.siteName || new URL(article.originalUrl).hostname}
                    </span>
                    {article.isFavorite && <Icon name="star" />}
                  </span>
                  <strong dir="auto">{article.title}</strong>
                  {article.excerpt && !article.warnings.includes('pending-link') && (
                    <span className="article-excerpt" dir="auto">
                      {article.excerpt}
                    </span>
                  )}
                  <span className="article-meta">
                    <time dateTime={article.savedAt}>{formatDate(article.savedAt)}</time>
                    {article.warnings.includes('pending-link') ? (
                      <span className="badge">{t('library.pending')}</span>
                    ) : article.captureStatus !== 'complete' ? (
                      <span className="badge">{t(`library.${article.captureStatus}`)}</span>
                    ) : !article.isRead ? (
                      <span className="unread-dot" aria-label={t('nav.unread')} />
                    ) : (
                      <Icon name="check" />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {articles.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name={searching ? 'search' : 'bookmark'} />
              </span>
              <h3>{t(searching ? 'library.noResults' : 'library.emptyTitle')}</h3>
              <p>{t(searching ? 'library.noResultsHint' : 'library.emptyHint')}</p>
              <p className="visually-hidden">{t('library.empty')}</p>
              <button
                className="primary"
                onClick={() => (searching ? setQuery('') : setAddOpen(true))}
              >
                {t(searching ? 'library.clearSearch' : 'common.add')}
              </button>
            </div>
          )}
        </section>
        <section className="library-reader" aria-labelledby="reader-heading">
          {selected && reader && readerMatchesSelection ? (
            <>
              <div className="reader-toolbar">
                <button
                  className="back-to-library icon-button"
                  onClick={backToList}
                  aria-label={t('library.back')}
                >
                  <Icon name="back" />
                </button>
                <span className="reading-status">
                  {t(
                    selected.warnings.includes('pending-link')
                      ? 'library.pending'
                      : selected.captureStatus === 'complete'
                        ? 'library.complete'
                        : `library.${selected.captureStatus}`,
                  )}
                </span>
                <div className="article-actions">
                  <button
                    className="icon-button"
                    aria-label={t(selected.isRead ? 'library.markUnread' : 'library.markRead')}
                    title={t(selected.isRead ? 'library.markUnread' : 'library.markRead')}
                    aria-pressed={selected.isRead}
                    onClick={() => void patchSelected({ isRead: !selected.isRead })}
                  >
                    <Icon name="check" />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t(selected.isFavorite ? 'library.unfavorite' : 'library.favorite')}
                    title={t(selected.isFavorite ? 'library.unfavorite' : 'library.favorite')}
                    aria-pressed={selected.isFavorite}
                    onClick={() => void patchSelected({ isFavorite: !selected.isFavorite })}
                  >
                    <Icon name="star" />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t(selected.isArchived ? 'library.unarchive' : 'library.archive')}
                    title={t(selected.isArchived ? 'library.unarchive' : 'library.archive')}
                    aria-pressed={selected.isArchived}
                    onClick={() => void patchSelected({ isArchived: !selected.isArchived })}
                  >
                    <Icon name="archive" />
                  </button>
                </div>
              </div>
              <div className="reader-heading">
                <h2 id="reader-heading" dir="auto">
                  {selected.title}
                </h2>
                <p className="meta" dir="auto">
                  {[selected.author, selected.siteName].filter(Boolean).join(' · ')}
                </p>
              </div>
              <CaptureActions
                key={selected.id}
                article={selected}
                library={library}
                onSaved={onSharedSaved}
              />
              <div className="reader-options">
                <ArticleSharing key={selected.id} content={{ ...reader, article: selected }} />
                <details className="article-details">
                  <summary>
                    <Icon name="folder" />
                    {t('library.details')}
                  </summary>
                  <p className="original-url" dir="auto">
                    {selected.originalUrl}
                  </p>
                  <fieldset>
                    <legend>{t('nav.categories')}</legend>
                    {categories.length === 0 && <p>{t('category.empty')}</p>}
                    {categories.map((category) => (
                      <label key={category.id} className="check">
                        <input
                          type="checkbox"
                          checked={selected.categoryIds.includes(category.id)}
                          onChange={(event) =>
                            void toggleMembership(category.id, event.target.checked)
                          }
                        />
                        <span dir="auto">{category.name}</span>
                      </label>
                    ))}
                  </fieldset>
                </details>
              </div>
              {(selected.captureStatus !== 'complete' || selected.warnings.length > 0) &&
                !selected.warnings.includes('pending-link') && (
                  <details className="capture-warning" data-testid="capture-status">
                    <summary>
                      {t('library.captureStatus', {
                        status: t(`library.${selected.captureStatus}`),
                      })}
                    </summary>
                    <ul>
                      {selected.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
              <Reader content={reader} />
            </>
          ) : (
            <div className="reader-empty">
              <Icon name="unread" />
              <h2 id="reader-heading">{t('library.reader')}</h2>
              <p>{t('library.readerHint')}</p>
            </div>
          )}
        </section>
      </div>
      <Sheet
        id="categories"
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        title={t('nav.categories')}
      >
        <p className="muted">{t('category.hint')}</p>
        <div className="category-choices">{categoryButtons}</div>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void createCategory();
          }}
        >
          <label>
            {t('category.new')}
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              name="new-category"
            />
          </label>
          <button className="primary" type="submit" disabled={!newCategory.trim()}>
            {t('category.create')}
          </button>
        </form>
        {typeof view === 'object' && (
          <div className="stack">
            <label>
              {t('category.renameLabel')}
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                name="rename-category"
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                disabled={!renameValue.trim()}
                onClick={() => void renameSelectedCategory()}
              >
                {t('category.rename')}
              </button>
              <button type="button" onClick={() => void moveCategory(-1)}>
                {t('category.up')}
              </button>
              <button type="button" onClick={() => void moveCategory(1)}>
                {t('category.down')}
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => void deleteSelectedCategory()}
              >
                {t('category.delete')}
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <Sheet
        id="settings"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t('common.settings')}
      >
        <details className="settings-group">
          <summary>
            <Icon name="cloud" />
            {t('settings.sync')}
            <span className="badge">{t(`sync.phase.${syncDiagnostics.phase}`)}</span>
          </summary>
          <SyncPanel
            library={library}
            onLibraryChanged={() => refresh(library, view, query)}
            onDiagnosticsChange={setSyncDiagnostics}
          />
        </details>
        <details className="settings-group">
          <summary>
            <Icon name="archive" />
            {t('settings.backup')}
          </summary>
          <BackupPanel
            library={library}
            sync={syncDiagnostics}
            onLibraryChanged={() => refresh(library, view, query)}
          />
        </details>
        <details className="settings-group">
          <summary>
            <Icon name="settings" />
            {t('settings.storage')}
          </summary>
          <p data-testid="storage-status" className="storage-status">
            {storage
              ? t('storage.status', {
                  persistence: t(storage.persisted ? 'storage.persistent' : 'storage.temporary'),
                  usage: storage.quota
                    ? t('storage.used', {
                        usage: formatBytes(storage.usage),
                        quota: formatBytes(storage.quota),
                      })
                    : formatBytes(storage.usage),
                  backend: storage.blobBackend,
                })
              : t('storage.checking')}
          </p>
          <button type="button" onClick={() => void rebuild()}>
            {t('settings.rebuild')}
          </button>
          {rebuildCount !== null && (
            <p role="status" data-testid="rebuild-status">
              {t('settings.rebuilt', { count: rebuildCount })}
            </p>
          )}
        </details>
        <details className="settings-group">
          <summary>
            <Icon name="bookmark" />
            {t('settings.about')}
          </summary>
          <About />
        </details>
        <details className="settings-group developer-tools">
          <summary>{t('settings.developer')}</summary>
          <p>{t('settings.developerHint')}</p>
          <div className="stack">
            <button
              type="button"
              onClick={() =>
                void (async () => {
                  const article = await library.importTrustedFixture(LONG_PRINTABLE_FIXTURE);
                  setSelectedId(article.id);
                  selectedIdRef.current = article.id;
                  await refresh(library, view, query);
                  setSettingsOpen(false);
                  setReading(true);
                })()
              }
            >
              {t('fixture.long')}
            </button>
            <button type="button" onClick={() => void importFixture()}>
              {t('fixture.development')}
            </button>
            <button type="button" onClick={() => void importCaptureFixture('public')}>
              {t('fixture.public')}
            </button>
            <button type="button" onClick={() => void importCaptureFixture('hostile')}>
              {t('fixture.hostile')}
            </button>
          </div>
        </details>
        <p className="preview-note">
          {t('app.preview')} · {__APP_VERSION__}
        </p>
      </Sheet>
    </div>
  );
}
