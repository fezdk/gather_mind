<?php
declare(strict_types=1);

// CLI only. Lives outside html; never an HTTP upload endpoint.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/lib/manifest.php';
$site = dirname(__DIR__);
$source = $argv[1] ?? '';
if (!$source || count($argv) !== 2) { fwrite(STDERR, "Usage: php ops/install.php ENVELOPE\n"); exit(1); }
$lock = fopen($site . '/updates/.publish-lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) { exit(1); }
$staging = null;
$exitCode = 0;
try {
    $envelope = file_get_contents($source, false, null, 0, 1048577);
    if ($envelope === false || strlen($envelope) > 1048576) throw new RuntimeException('Invalid size');
    $data = json_decode($envelope, true, 32, JSON_THROW_ON_ERROR);
    $manifest = json_decode($data['manifest'], true, 32, JSON_THROW_ON_ERROR);
    $runtime = $manifest['runtimeVersion'];
    if (!is_string($runtime) || !preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]{0,99}\z/', $runtime)) throw new RuntimeException('Invalid runtime');
    $staging = $site . '/updates/.stage-' . bin2hex(random_bytes(12));
    mkdir($staging, 0700);
    $candidate = $staging . '/' . $runtime . '.json';
    file_put_contents($candidate, $envelope, LOCK_EX);
    $request = ['method' => 'GET', 'path' => '/manifest', 'protocol' => '1', 'platform' => 'android',
        'runtime' => $runtime, 'accept' => 'application/expo+json'];
    $response = gm_manifest_response($request, $staging, $site . '/trust/certificate.pem');
    if ($response[0] !== 200) throw new RuntimeException('Signature or manifest validation failed');
    $target = $site . '/updates/' . $runtime . '.json';
    if (file_exists($target)) {
        $old = gm_manifest_response($request, $site . '/updates', $site . '/trust/certificate.pem');
        if ($old[0] !== 200) throw new RuntimeException('Existing manifest is invalid; investigate before replacing it');
        $previous = json_decode($old[2], true, 32, JSON_THROW_ON_ERROR);
        if (strtotime($manifest['createdAt']) <= strtotime($previous['createdAt'])
            || version_compare($manifest['metadata']['appVersion'], $previous['metadata']['appVersion'], '<=')
            || $manifest['id'] === $previous['id']) throw new RuntimeException('Update must have a newer version, timestamp and ID');
        $archive = $site . '/updates/archive';
        if (!is_dir($archive)) mkdir($archive, 0755);
        $backup = $archive . '/' . $runtime . '-' . $previous['id'] . '.json';
        if (file_exists($backup)) {
            if (file_get_contents($backup) !== file_get_contents($target)) throw new RuntimeException('Archive conflict');
        } elseif (!copy($target, $backup)) throw new RuntimeException('Archive failed');
    }
    chmod($candidate, 0644);
    if (!rename($candidate, $target)) throw new RuntimeException('Activation failed');
    echo 'Activated signed version ' . $manifest['metadata']['appVersion'] . "\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'Not activated: ' . $error->getMessage() . "\n");
    $exitCode = 1;
} finally {
    if ($staging && is_dir($staging)) {
        foreach (glob($staging . '/*.json') as $temporary) unlink($temporary);
        rmdir($staging);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
}
exit($exitCode);
