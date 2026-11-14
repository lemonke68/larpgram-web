export type Drafts = Record<string, string>;

const storageKey = (userId: string) => `larpgram.drafts.v1:${userId}`;

export function readDrafts(userId: string): Drafts {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, draft]) => typeof draft === 'string' && draft.length > 0),
    );
  } catch {
    return {};
  }
}

export function writeDrafts(userId: string, drafts: Drafts): void {
  try {
    if (Object.keys(drafts).length) {
      localStorage.setItem(storageKey(userId), JSON.stringify(drafts));
    } else {
      localStorage.removeItem(storageKey(userId));
    }
  } catch {
    // Drafts still work in memory when browser storage is unavailable.
  }
}
