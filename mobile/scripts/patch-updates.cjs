// Pinned, fail-closed privacy patch. Reapplied by npm ci; review on Expo upgrades.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'node_modules/expo-updates/package.json'));
if (pkg.version !== '29.0.20') throw new Error('Review the Expo Updates privacy patch before changing versions.');
const file = path.join(root, 'node_modules/expo-updates/android/src/main/java/expo/modules/updates/loader/FileDownloader.kt');
let source = fs.readFileSync(file, 'utf8');
const marker = '// Gather Mind: minimal update requests, including redirects.';
if (!source.includes(marker)) {
  const anchor = '  private var client: OkHttpClient = OkHttpClient.Builder()';
  if (source.split(anchor).length !== 2) throw new Error('Expo downloader changed; privacy patch not applied.');
  source = source.replace(anchor, `  ${marker}
  private fun privateUpdateRequest(chain: okhttp3.Interceptor.Chain): Response {
    val original = chain.request()
    val url = original.url
    val allowed = url.scheme == "https" && url.port == 443 &&
      url.username.isEmpty() && url.password.isEmpty() && (
        (url.host == "gathermind.control.dk" && url.encodedPath == "/manifest" && url.query == null) ||
        (url.host == "github.com" && url.encodedPath.startsWith("/fezdk/gather_mind/releases/download/")) ||
        url.host == "release-assets.githubusercontent.com"
      )
    if (!allowed || original.method != "GET") throw IOException("Update URL is not allowed")
    val builder = original.newBuilder().headers(Headers.Builder().build())
    // No install IDs, errors, cookies, credentials, or server-defined headers.
    for (name in listOf("Accept", "Accept-Encoding", "Host", "Connection")) {
      original.header(name)?.let { builder.header(name, it) }
    }
    if (url.host == "gathermind.control.dk") {
      for (name in listOf("Expo-Platform", "Expo-Protocol-Version", "Expo-Runtime-Version", "expo-expect-signature")) {
        original.header(name)?.let { builder.header(name, it) }
      }
    }
    builder.header("User-Agent", "GatherMind-Updates")
    return chain.proceed(builder.build())
  }

${anchor}
    .addInterceptor { chain -> privateUpdateRequest(chain) }
    .addNetworkInterceptor { chain -> privateUpdateRequest(chain) }`);
  fs.writeFileSync(file, source);
}
if (!source.includes('.addNetworkInterceptor { chain -> privateUpdateRequest(chain) }')) {
  throw new Error('Incomplete Expo Updates privacy patch');
}
console.log('Verified Expo Updates Android privacy patch (29.0.20).');
