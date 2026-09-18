<?php
declare(strict_types=1);

// No network calls, database, signing keys, or user-content processing here.
function gm_manifest_response(array $request, string $store, string $certificate): array
{
    $headers = [
        'expo-protocol-version' => '1',
        'expo-sfv-version' => '0',
        'Cache-Control' => 'private, no-store, max-age=0',
        'Vary' => 'expo-platform, expo-runtime-version, Accept',
        'X-Content-Type-Options' => 'nosniff',
    ];
    $reply = static function (int $status, string $body = '', array $extra = []) use ($headers): array {
        return [$status, array_merge($headers, $extra), $body];
    };
    if (!in_array($request['method'] ?? '', ['GET', 'HEAD'], true)) {
        return $reply(405, '', ['Allow' => 'GET, HEAD']);
    }
    if (($request['path'] ?? '') !== '/manifest') {
        return $reply(404);
    }
    if (($request['protocol'] ?? '') !== '1') {
        return $reply(406);
    }
    if (($request['platform'] ?? '') !== 'android') {
        return $reply(400);
    }
    $runtime = $request['runtime'] ?? '';
    if (!preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]{0,99}\z/', $runtime)) {
        return $reply(400);
    }
    $accept = $request['accept'] ?? '*/*';
    $json = gm_accepts($accept, 'application/expo+json') || gm_accepts($accept, 'application/json');
    $multipart = gm_accepts($accept, 'multipart/mixed');
    if (!$json && !$multipart) {
        return $reply(406);
    }
    $file = $store . '/' . $runtime . '.json';
    if (!file_exists($file)) {
        return $multipart ? $reply(204) : $reply(406);
    }
    try {
        if (is_link($file)) {
            throw new RuntimeException('Symlink not allowed');
        }
        $bytes = @file_get_contents($file, false, null, 0, 1048577);
        if ($bytes === false || strlen($bytes) > 1048576) {
            throw new RuntimeException('Invalid envelope size');
        }
        $envelope = json_decode($bytes, true, 32, JSON_THROW_ON_ERROR);
        $manifest = $envelope['manifest'] ?? null;
        $signature = $envelope['signature'] ?? null;
        if (!is_string($manifest) || !is_string($signature) || strlen($signature) > 2048) {
            throw new RuntimeException('Invalid envelope');
        }
        $decoded = base64_decode($signature, true);
        if ($decoded === false || base64_encode($decoded) !== $signature) {
            throw new RuntimeException('Invalid signature encoding');
        }
        $pem = @file_get_contents($certificate);
        $publicKey = $pem === false ? false : openssl_pkey_get_public($pem);
        $details = $publicKey === false ? false : openssl_pkey_get_details($publicKey);
        if (!$details || $details['type'] !== OPENSSL_KEYTYPE_RSA || $details['bits'] < 2048
            || openssl_verify($manifest, $decoded, $publicKey, OPENSSL_ALGO_SHA256) !== 1) {
            throw new RuntimeException('Untrusted manifest');
        }
        $data = json_decode($manifest, true, 32, JSON_THROW_ON_ERROR);
        if (($data['runtimeVersion'] ?? null) !== $runtime
            || !is_string($data['id'] ?? null)
            || !preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i', $data['id'])
            || !is_string($data['createdAt'] ?? null)
            || strtotime($data['createdAt']) === false
            || !is_array($data['assets'] ?? null)
            || !is_string($data['metadata']['appVersion'] ?? null)
            || !preg_match('/\A[0-9]+\.[0-9]+\.[0-9]+\z/', $data['metadata']['appVersion'])) {
            throw new RuntimeException('Invalid manifest');
        }
        foreach (array_merge([$data['launchAsset'] ?? null], $data['assets']) as $asset) {
            // Only immutable, versioned assets in this project's public repository.
            if (!is_array($asset) || !is_string($asset['url'] ?? null)
                || !preg_match('~\Ahttps://github\.com/fezdk/gather_mind/releases/download/v[0-9]+\.[0-9]+\.[0-9]+/[A-Za-z0-9][A-Za-z0-9._-]*\z~', $asset['url'])
                || !is_string($asset['hash'] ?? null)
                || !preg_match('/\A[A-Za-z0-9_-]{43}\z/', $asset['hash'])
                || !is_string($asset['key'] ?? null)
                || !is_string($asset['contentType'] ?? null)) {
                throw new RuntimeException('Invalid asset');
            }
        }
        $signatureHeader = 'sig="' . $signature . '", keyid="main", alg="rsa-v1_5-sha256"';
        if ($json) {
            return $reply(200, $manifest, [
                'Content-Type' => 'application/expo+json',
                'expo-signature' => $signatureHeader,
            ]);
        }
        // A fresh boundary cannot be controlled by the manifest or request.
        $boundary = 'gather-mind-' . bin2hex(random_bytes(24));
        $body = '--' . $boundary . "\r\nContent-Disposition: form-data; name=\"manifest\"\r\n"
            . "Content-Type: application/json\r\nexpo-signature: " . $signatureHeader
            . "\r\n\r\n" . $manifest . "\r\n--" . $boundary . "--\r\n";
        return $reply(200, $body, ['Content-Type' => 'multipart/mixed; boundary=' . $boundary]);
    } catch (Throwable $error) {
        // Fail closed. Never return paths, manifest contents, or request headers in errors/logs.
        return $reply(503, '', ['Retry-After' => '300']);
    }
}

function gm_accepts(string $header, string $type): bool
{
    $bestSpecificity = -1;
    $quality = 0.0;
    foreach (explode(',', strtolower($header)) as $entry) {
        $parts = array_map('trim', explode(';', $entry));
        $media = array_shift($parts);
        $specificity = $media === $type ? 2 : ($media === explode('/', $type)[0] . '/*' ? 1 : ($media === '*/*' ? 0 : -1));
        if ($specificity < 0 || $specificity < $bestSpecificity) {
            continue;
        }
        $q = 1.0;
        foreach ($parts as $part) {
            if (strpos($part, 'q=') === 0) {
                $q = is_numeric(substr($part, 2)) ? (float) substr($part, 2) : 0.0;
            }
        }
        $bestSpecificity = $specificity;
        $quality = $q;
    }
    return $quality > 0 && $quality <= 1;
}
