declare const __POSTKEEPER_BROWSER_TARGET__: 'chromium' | 'firefox';

type ExtensionMessageListener = (
  message: unknown,
  sender: { tab?: { id?: number; url?: string } },
  sendResponse: (response: unknown) => void,
) => boolean | void | Promise<unknown>;

interface PostKeeperExtensionApi {
  runtime: {
    lastError?: { message?: string };
    onMessage: { addListener(listener: ExtensionMessageListener): void };
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage(): Promise<void>;
  };
  permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
  };
  scripting?: {
    executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown>;
  };
  storage: {
    local: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    create(options: { active?: boolean; url: string }): Promise<{ id?: number; url?: string }>;
    executeScript?(tabId: number, options: { file: string }): Promise<unknown>;
    get(tabId: number): Promise<{ id?: number; status?: string; url?: string }>;
    query(
      options: Record<string, unknown>,
    ): Promise<Array<{ id?: number; status?: string; url?: string }>>;
    onUpdated: {
      addListener(listener: (tabId: number, changeInfo: { status?: string }) => void): void;
      removeListener(listener: (tabId: number, changeInfo: { status?: string }) => void): void;
    };
    reload(tabId: number): Promise<void>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    update(
      tabId: number,
      options: { active?: boolean; url?: string },
    ): Promise<{ id?: number; status?: string; url?: string }>;
  };
}

interface Window {
  __postkeeperCaptureContentInstalled?: boolean;
  __postkeeperBridgeInstalled?: boolean;
}

declare const chrome: PostKeeperExtensionApi | undefined;
declare const browser: PostKeeperExtensionApi | undefined;
