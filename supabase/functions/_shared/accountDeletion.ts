const STORAGE_BUCKETS = [
  'community-avatars',
  'feedback-screenshots',
] as const;
const STORAGE_LIST_PAGE_SIZE = 1000;
const STORAGE_DELETE_BATCH_SIZE = 100;

type StorageEntry = {
  name?: unknown;
  id?: unknown;
};

type StorageBucket = {
  list: (
    path: string,
    options: {
      limit: number;
      offset: number;
      sortBy: { column: string; order: 'asc' | 'desc' };
    },
  ) => Promise<{ data: StorageEntry[] | null; error: unknown }>;
  remove: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
};

type AccountDeletionClient = {
  storage: {
    from: (bucket: string) => StorageBucket;
  };
  from: (table: string) => {
    delete: () => {
      or: (filters: string) => Promise<{ error: unknown }>;
    };
  };
};

/**
 * Removes data that is not covered by Auth's database foreign-key cascade.
 * The Auth user ID is always supplied by a verified server-side caller.
 */
export async function cleanupUserOwnedData(
  adminClient: AccountDeletionClient,
  userId: string,
) {
  let removedStorageObjects = 0;

  for (const bucket of STORAGE_BUCKETS) {
    const paths = await listUserStoragePaths(adminClient.storage.from(bucket), userId);
    for (let index = 0; index < paths.length; index += STORAGE_DELETE_BATCH_SIZE) {
      const batch = paths.slice(index, index + STORAGE_DELETE_BATCH_SIZE);
      const { error } = await adminClient.storage.from(bucket).remove(batch);
      if (error) {
        throw new Error(`Could not remove ${bucket} objects for account deletion.`);
      }
      removedStorageObjects += batch.length;
    }
  }

  // These rows intentionally have no FK because they record administrative
  // actions. They are still user-associated data and must not survive a full
  // account deletion.
  const { error: auditError } = await adminClient
    .from('admin_audit_log')
    .delete()
    .or(`admin_user_id.eq.${userId},target_user_id.eq.${userId}`);
  if (auditError) {
    throw new Error('Could not remove account audit records.');
  }

  return { removedStorageObjects };
}

async function listUserStoragePaths(bucket: StorageBucket, userId: string) {
  const pendingPrefixes = [userId];
  const visitedPrefixes = new Set<string>();
  const filePaths = new Set<string>();

  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.shift();
    if (!prefix || visitedPrefixes.has(prefix)) continue;
    visitedPrefixes.add(prefix);

    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(prefix, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        throw new Error('Could not list account storage objects.');
      }

      const entries = data ?? [];
      for (const entry of entries) {
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!name || name.includes('/') || name === '.' || name === '..') continue;

        const entryPath = `${prefix}/${name}`;
        if (typeof entry.id === 'string' && entry.id) {
          // Keep the safety boundary explicit even though prefix starts at the
          // verified user ID. Never remove a path outside that user's folder.
          if (entryPath === userId || entryPath.startsWith(`${userId}/`)) {
            filePaths.add(entryPath);
          }
        } else if (entryPath.startsWith(`${userId}/`)) {
          pendingPrefixes.push(entryPath);
        }
      }

      if (entries.length < STORAGE_LIST_PAGE_SIZE) break;
      offset += entries.length;
    }
  }

  return Array.from(filePaths);
}
