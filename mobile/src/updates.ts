export const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/fezdk/gather_mind/releases/latest';
export const RELEASES_PAGE_URL = 'https://github.com/fezdk/gather_mind/releases';
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type LatestRelease = {
  version: string;
  tagName: string;
  url: string;
};

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type ReleaseRequest = (input: string, init?: RequestInit) => Promise<FetchResponse>;

function parseVersion(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isReleaseNewer(latestVersion: string, installedVersion: string): boolean {
  const latest = parseVersion(latestVersion);
  const installed = parseVersion(installedVersion);
  if (!latest || !installed) return false;
  for (let index = 0; index < latest.length; index += 1) {
    if (latest[index] > installed[index]) return true;
    if (latest[index] < installed[index]) return false;
  }
  return false;
}

export function automaticUpdateCheckIsDue(
  enabled: boolean,
  lastAttemptAt: number | null,
  now = Date.now(),
): boolean {
  if (!enabled) return false;
  return lastAttemptAt === null || now - lastAttemptAt >= UPDATE_CHECK_INTERVAL_MS || now < lastAttemptAt;
}

export function shouldNotifyAboutRelease(
  latestVersion: string,
  installedVersion: string,
  lastNotifiedVersion: string | null,
): boolean {
  return latestVersion !== lastNotifiedVersion && isReleaseNewer(latestVersion, installedVersion);
}

export async function fetchLatestRelease(
  request: ReleaseRequest = fetch as ReleaseRequest,
  timeoutMs = 10_000,
): Promise<LatestRelease> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(LATEST_RELEASE_API_URL, {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub returned status ${response.status}.`);
    const body = await response.json();
    if (!body || typeof body !== 'object' || !('tag_name' in body) || typeof body.tag_name !== 'string') {
      throw new Error('GitHub returned release information in an unexpected format.');
    }
    const tagName = body.tag_name.trim();
    const parsed = parseVersion(tagName);
    if (!parsed) throw new Error('The latest GitHub release does not use an X.Y.Z version tag.');
    return {
      version: parsed.join('.'),
      tagName,
      url: `${RELEASES_PAGE_URL}/tag/${encodeURIComponent(tagName)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
