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

const NAV_VIEWS: Array<{ id: Exclude<LibraryView, { categoryId: string }>; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'all', label: 'All items' },
  { id: 'unread', label: 'Unread' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'archive', label: 'Archive' },
];

function viewLabel(view: LibraryView, categories: readonly Category[]): string {
  if (typeof view === 'string') {
    return NAV_VIEWS.find((item) => item.id === view)?.label ?? view;
  }
  return categories.find((category) => category.id === view.categoryId)?.name ?? 'Category';
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function LibraryApp() {
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
        void opened.requestPersistence().then(async () => {
          if (!cancelled) setStorage(await opened.getStorageStatus());
        });
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
    const currentId = selectedIdRef.current;
    const [nextCategories, nextArticles, nextStorage, libraryItems, archivedItems] =
      await Promise.all([
        open.listCategories(),
        nextQuery.trim() ? open.search(nextQuery) : open.listArticles(nextView),
        open.getStorageStatus(),
        open.listArticles('all'),
        open.listArticles('archive'),
      ]);
    setCategories(nextCategories);
    setArticles(nextArticles);
    setStorage(nextStorage);
    setSearching(Boolean(nextQuery.trim()));
    setSelected(
      [...libraryItems, ...archivedItems, ...nextArticles].find(
        (article) => article.id === currentId,
      ) ?? null,
    );
  }, []);

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
    if (!library || !selectedId) {
      setReader(null);
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
  }, [library, selectedId]);

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
  }

  async function importCaptureFixture(key: DevelopmentCaptureFixture) {
    if (!library) return;
    const article = await library.importCapturePackage(await createDevelopmentCaptureFixture(key));
    setQuery('');
    setSelectedId(article.id);
    selectedIdRef.current = article.id;
    await refresh(library, view, '');
  }

  async function createCategory() {
    if (!library) return;
    await library.createCategory(newCategory);
    setNewCategory('');
    await refresh(library, view, query);
  }

  async function renameSelectedCategory() {
    if (!library || typeof view !== 'object') return;
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

  if (error) {
    return (
      <main>
        <h1>PostKeeper</h1>
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!library) {
    return (
      <main>
        <h1>PostKeeper</h1>
        <p>Opening local library…</p>
      </main>
    );
  }

  return (
    <div className="library-shell">
      <header className="library-header">
        <div>
          <p className="eyebrow">Milestone 5 · Sharing and portable backups</p>
          <h1>PostKeeper</h1>
        </div>
        <p data-testid="storage-status" className="storage-status">
          {storage
            ? `Storage: ${storage.persisted ? 'persistent' : 'not persistent'} · ${formatBytes(storage.usage)}${
                storage.quota ? ` of ${formatBytes(storage.quota)}` : ''
              } · blobs: ${storage.blobBackend}`
            : 'Storage: checking…'}
        </p>
      </header>
      {transferStatus && (
        <p className="transfer-status" role="status" data-testid="extension-transfer-status">
          {transferStatus}
        </p>
      )}
      <SyncPanel
        library={library}
        onLibraryChanged={() => refresh(library, view, query)}
        onDiagnosticsChange={setSyncDiagnostics}
      />
      <BackupPanel
        library={library}
        sync={syncDiagnostics}
        onLibraryChanged={() => refresh(library, view, query)}
      />
      <div className="library-layout">
        <nav className="library-nav" aria-label="Library views">
          <ul>
            {NAV_VIEWS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={view === item.id ? 'active' : undefined}
                  aria-current={view === item.id ? 'page' : undefined}
                  onClick={() => {
                    setView(item.id);
                    setQuery('');
                    setSearching(false);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <h2>Categories</h2>
          <ul>
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  className={
                    typeof view === 'object' && view.categoryId === category.id
                      ? 'active'
                      : undefined
                  }
                  aria-current={
                    typeof view === 'object' && view.categoryId === category.id ? 'page' : undefined
                  }
                  onClick={() => {
                    setView({ categoryId: category.id });
                    setQuery('');
                  }}
                >
                  {category.name}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void createCategory();
            }}
          >
            <label>
              New category
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                name="new-category"
              />
            </label>
            <button type="submit" disabled={!newCategory.trim()}>
              Create category
            </button>
          </form>
          {typeof view === 'object' && (
            <div className="stack">
              <label>
                Rename category
                <input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  name="rename-category"
                />
              </label>
              <button type="button" onClick={() => void renameSelectedCategory()}>
                Rename
              </button>
              <button type="button" onClick={() => void moveCategory(-1)}>
                Move up
              </button>
              <button type="button" onClick={() => void moveCategory(1)}>
                Move down
              </button>
              <button type="button" onClick={() => void deleteSelectedCategory()}>
                Delete category
              </button>
            </div>
          )}
        </nav>
        <section className="library-list" aria-labelledby="list-heading">
          <div className="list-toolbar">
            <h2 id="list-heading">{searching ? 'Search results' : viewLabel(view, categories)}</h2>
            <div className="fixture-actions">
              <button
                type="button"
                onClick={() =>
                  void (async () => {
                    const article = await library.importTrustedFixture(LONG_PRINTABLE_FIXTURE);
                    setSelectedId(article.id);
                    selectedIdRef.current = article.id;
                    await refresh(library, view, query);
                  })()
                }
              >
                Import long print fixture
              </button>
              <button type="button" onClick={() => void importFixture()}>
                Import development fixture
              </button>
              <button type="button" onClick={() => void importCaptureFixture('public')}>
                Import public capture package
              </button>
              <button type="button" onClick={() => void importCaptureFixture('hostile')}>
                Import hostile capture package
              </button>
            </div>
          </div>
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <label>
              Search library
              <input
                type="search"
                role="searchbox"
                name="library-search"
                data-testid="library-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button type="button" onClick={() => void rebuild()}>
              Rebuild search index
            </button>
          </form>
          {rebuildCount !== null && (
            <p role="status" data-testid="rebuild-status">
              Rebuilt {rebuildCount} search documents from local records.
            </p>
          )}
          <ul data-testid="article-list">
            {articles.map((article) => (
              <li key={article.id}>
                <button
                  type="button"
                  className={article.id === selectedId ? 'article-link active' : 'article-link'}
                  onClick={() => {
                    setSelectedId(article.id);
                    setSelected(article);
                  }}
                >
                  <strong>{article.title}</strong>
                  <span>{article.siteName}</span>
                </button>
              </li>
            ))}
          </ul>
          {articles.length === 0 && <p>No articles in this view.</p>}
        </section>
        <section className="library-reader" aria-labelledby="reader-heading">
          {selected && reader ? (
            <>
              <h2 id="reader-heading">{selected.title}</h2>
              <p className="meta">
                {selected.author} · {selected.siteName}
              </p>
              <p className="original-url">{selected.originalUrl}</p>
              <ArticleSharing key={selected.id} content={{ ...reader, article: selected }} />
              {(selected.captureStatus !== 'complete' || selected.warnings.length > 0) && (
                <div className="capture-warning" role="status" data-testid="capture-status">
                  <strong>Capture status: {selected.captureStatus}</strong>
                  {selected.warnings.length > 0 && (
                    <ul>
                      {selected.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="article-actions">
                <button
                  type="button"
                  onClick={() => void patchSelected({ isRead: !selected.isRead })}
                >
                  {selected.isRead ? 'Mark unread' : 'Mark read'}
                </button>
                <button
                  type="button"
                  onClick={() => void patchSelected({ isFavorite: !selected.isFavorite })}
                >
                  {selected.isFavorite ? 'Unfavorite' : 'Favorite'}
                </button>
                <button
                  type="button"
                  onClick={() => void patchSelected({ isArchived: !selected.isArchived })}
                >
                  {selected.isArchived ? 'Move to library' : 'Archive'}
                </button>
              </div>
              <fieldset>
                <legend>Categories</legend>
                {categories.length === 0 && <p>Create a category to organize this article.</p>}
                {categories.map((category) => (
                  <label key={category.id} className="check">
                    <input
                      type="checkbox"
                      checked={selected.categoryIds.includes(category.id)}
                      onChange={(event) => void toggleMembership(category.id, event.target.checked)}
                    />
                    {category.name}
                  </label>
                ))}
              </fieldset>
              <Reader content={reader} />
            </>
          ) : (
            <>
              <h2 id="reader-heading">Reader</h2>
              <p>Select an article to read it offline from local storage.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
